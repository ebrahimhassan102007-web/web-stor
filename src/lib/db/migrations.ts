import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { resolveDatabaseUrl } from "./config";

/**
 * Explicit, transactional Drizzle migration handling.
 *
 * This module is never imported by the application runtime. It is used by
 * `scripts/migrate.ts` and by migration tests only. In addition to a fresh
 * install, it supports a database created by the pre-migration storefront:
 * after a strict compatibility preflight, the initial migration is recorded
 * as adopted rather than replayed against tables that already exist.
 *
 * No migration is inferred from a merely similar table name. Unknown,
 * partial, drifted, or hash-mismatched schemas abort before any write.
 */

export interface MigrationClient {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

type JournalEntry = {
  idx: number;
  when: number;
  tag: string;
  breakpoints: boolean;
};

export type MigrationFile = JournalEntry & {
  statements: string[];
  hash: string;
};

type ColumnInfo = {
  table_name: string;
  column_name: string;
  data_type: string;
};

type SchemaState = {
  tables: Set<string>;
  columns: Map<string, Map<string, string>>;
  indexes: Set<string>;
  constraints: Set<string>;
  migrationTableExists: boolean;
  records: Array<{ hash: string; created_at: string | number | null }>;
};

type Requirement = {
  tables?: readonly string[];
  columns?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  indexes?: readonly string[];
  constraints?: readonly string[];
};

export type MigrationOperation = {
  tag: string;
  action: "apply" | "adopt" | "unchanged";
};

export type MigrationResult = {
  dryRun: boolean;
  operations: MigrationOperation[];
  applied: string[];
  adopted: string[];
  unchanged: string[];
};

export type MigrateDatabaseOptions = {
  client: MigrationClient;
  migrationsFolder?: string;
  /** Permit recording compatible pre-existing schema versions as adopted. */
  adoptExisting?: boolean;
  /** Inspect and return the plan, then roll back without writing anything. */
  dryRun?: boolean;
};

export type MigratePostgresOptions = Omit<
  MigrateDatabaseOptions,
  "client"
> & {
  connectionString?: string;
};

const MIGRATION_LOCK_ID = 814_731_903;
const STOREFRONT_TABLES = [
  "cart_items",
  "carts",
  "categories",
  "order_items",
  "orders",
  "products",
] as const;

/** The complete public shape produced by 0000_init, not just table names. */
const BASELINE_COLUMNS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  categories: {
    id: "integer",
    slug: "character varying",
    name: "character varying",
    description: "text",
    icon: "character varying",
    created_at: "timestamp with time zone",
  },
  products: {
    id: "integer",
    slug: "character varying",
    name: "character varying",
    description: "text",
    price_cents: "integer",
    category_id: "integer",
    stock: "integer",
    rating: "numeric",
    review_count: "integer",
    icon: "character varying",
    featured: "boolean",
    created_at: "timestamp with time zone",
  },
  carts: {
    id: "uuid",
    created_at: "timestamp with time zone",
    updated_at: "timestamp with time zone",
  },
  cart_items: {
    id: "integer",
    cart_id: "uuid",
    product_id: "integer",
    quantity: "integer",
    created_at: "timestamp with time zone",
  },
  orders: {
    id: "uuid",
    order_number: "character varying",
    status: "character varying",
    customer_name: "character varying",
    email: "character varying",
    address_line1: "character varying",
    address_line2: "character varying",
    city: "character varying",
    postal_code: "character varying",
    country: "character varying",
    subtotal_cents: "integer",
    shipping_cents: "integer",
    total_cents: "integer",
    created_at: "timestamp with time zone",
  },
  order_items: {
    id: "integer",
    order_id: "uuid",
    product_id: "integer",
    product_name: "character varying",
    unit_price_cents: "integer",
    quantity: "integer",
  },
};

const DIGITAL_COLUMNS = {
  cart_items: { input_value: "character varying" },
  categories: {
    name_ar: "character varying",
    description_ar: "text",
  },
  order_items: {
    product_name_ar: "character varying",
    delivery_code: "text",
    delivery_info: "character varying",
  },
  products: {
    name_ar: "character varying",
    description_ar: "text",
    input_type: "character varying",
  },
} as const;

const AUTH_COLUMNS = {
  users: {
    id: "uuid",
    email: "character varying",
    display_name: "character varying",
    password_hash: "character varying",
    google_sub: "character varying",
    email_verified_at: "timestamp with time zone",
    created_at: "timestamp with time zone",
    updated_at: "timestamp with time zone",
  },
  account_sessions: {
    id: "uuid",
    user_id: "uuid",
    token_hash: "character varying",
    expires_at: "timestamp with time zone",
    created_at: "timestamp with time zone",
  },
  auth_rate_limits: {
    key_hash: "character varying",
    window_started_at: "timestamp with time zone",
    count: "integer",
  },
  email_verification_codes: {
    user_id: "uuid",
    code_hash: "character varying",
    expires_at: "timestamp with time zone",
    sent_at: "timestamp with time zone",
    consumed_at: "timestamp with time zone",
    attempts: "integer",
    created_at: "timestamp with time zone",
  },
  google_oauth_states: {
    state_hash: "character varying",
    nonce: "character varying",
    code_verifier: "character varying",
    return_to: "character varying",
    expires_at: "timestamp with time zone",
    created_at: "timestamp with time zone",
  },
} as const;

const BASELINE_REQUIREMENT: Requirement = {
  tables: STOREFRONT_TABLES,
  columns: BASELINE_COLUMNS,
  indexes: [
    "cart_items_cart_product_idx",
    "cart_items_cart_idx",
    "categories_slug_idx",
    "order_items_order_idx",
    "orders_number_idx",
    "products_slug_idx",
    "products_category_idx",
    "products_featured_idx",
  ],
  constraints: [
    "cart_items_cart_id_carts_id_fk",
    "cart_items_product_id_products_id_fk",
    "order_items_order_id_orders_id_fk",
    "order_items_product_id_products_id_fk",
    "products_category_id_categories_id_fk",
  ],
};

const DIGITAL_REQUIREMENT: Requirement = { columns: DIGITAL_COLUMNS };

const AUTH_REQUIREMENT: Requirement = {
  tables: [
    "account_sessions",
    "auth_rate_limits",
    "email_verification_codes",
    "google_oauth_states",
    "users",
  ],
  columns: AUTH_COLUMNS,
  indexes: [
    "account_sessions_token_hash_idx",
    "account_sessions_user_idx",
    "account_sessions_expiry_idx",
    "auth_rate_limits_window_idx",
    "email_verification_codes_expiry_idx",
    "google_oauth_states_expiry_idx",
    "users_email_idx",
    "users_google_sub_idx",
  ],
  constraints: [
    "account_sessions_user_id_users_id_fk",
    "email_verification_codes_user_id_users_id_fk",
  ],
};

const REQUIREMENTS: Readonly<Record<string, Requirement>> = {
  "0000_init": BASELINE_REQUIREMENT,
  "0001_evora-digital": DIGITAL_REQUIREMENT,
  "0002_authentication": AUTH_REQUIREMENT,
};

async function rows<T extends Record<string, unknown>>(
  client: MigrationClient,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await client.query(text, params);
  return result.rows as T[];
}

/** Read the journal and hash the exact SQL that will be recorded. */
export async function loadMigrations(
  migrationsFolder = path.join(process.cwd(), "drizzle"),
): Promise<MigrationFile[]> {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const parsed = JSON.parse(await readFile(journalPath, "utf8")) as {
    entries?: unknown;
  };
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error("The Drizzle migration journal is empty or invalid.");
  }

  const migrations: MigrationFile[] = [];
  for (const value of parsed.entries) {
    if (!value || typeof value !== "object") {
      throw new Error("The Drizzle migration journal contains an invalid entry.");
    }
    const entry = value as Partial<JournalEntry>;
    if (
      typeof entry.tag !== "string" ||
      typeof entry.when !== "number" ||
      typeof entry.idx !== "number"
    ) {
      throw new Error("The Drizzle migration journal contains an invalid entry.");
    }
    const sql = await readFile(
      path.join(migrationsFolder, `${entry.tag}.sql`),
      "utf8",
    );
    migrations.push({
      idx: entry.idx,
      when: entry.when,
      tag: entry.tag,
      breakpoints: entry.breakpoints !== false,
      statements: sql
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean),
      hash: createHash("sha256").update(sql).digest("hex"),
    });
  }
  return migrations;
}

async function inspectSchema(client: MigrationClient): Promise<SchemaState> {
  const tableRows = await rows<{ table_name: string }>(
    client,
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const columnRows = await rows<ColumnInfo>(
    client,
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const indexRows = await rows<{ indexname: string }>(
    client,
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'",
  );
  const constraintRows = await rows<{ conname: string }>(
    client,
    `SELECT c.conname
     FROM pg_constraint c
     JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'public'`,
  );
  const migrationTable = await rows<{ present: string | null }>(
    client,
    "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS present",
  );
  const migrationTableExists = Boolean(migrationTable[0]?.present);
  const records = migrationTableExists
    ? await rows<{ hash: string; created_at: string | number | null }>(
        client,
        "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id",
      )
    : [];

  const tableColumns = new Map<string, Map<string, string>>();
  for (const column of columnRows) {
    const table = tableColumns.get(column.table_name) ?? new Map<string, string>();
    table.set(column.column_name, column.data_type);
    tableColumns.set(column.table_name, table);
  }

  return {
    tables: new Set(tableRows.map((table) => table.table_name)),
    columns: tableColumns,
    indexes: new Set(indexRows.map((index) => index.indexname)),
    constraints: new Set(constraintRows.map((constraint) => constraint.conname)),
    migrationTableExists,
    records,
  };
}

type RequirementStatus = "absent" | "partial" | "present";

function requirementStatus(
  state: SchemaState,
  requirement: Requirement,
): RequirementStatus {
  let total = 0;
  let present = 0;

  for (const table of requirement.tables ?? []) {
    total += 1;
    if (state.tables.has(table)) present += 1;
  }
  for (const [table, columnsForTable] of Object.entries(
    requirement.columns ?? {},
  )) {
    const actualColumns = state.columns.get(table);
    for (const [column, expectedType] of Object.entries(columnsForTable)) {
      total += 1;
      const actualType = actualColumns?.get(column);
      if (actualType === expectedType) {
        present += 1;
      } else if (actualType) {
        throw new Error(
          `Schema compatibility check failed: ${table}.${column} has type ${actualType}, expected ${expectedType}.`,
        );
      }
    }
  }
  for (const index of requirement.indexes ?? []) {
    total += 1;
    if (state.indexes.has(index)) present += 1;
  }
  for (const constraint of requirement.constraints ?? []) {
    total += 1;
    if (state.constraints.has(constraint)) present += 1;
  }

  if (present === 0) return "absent";
  return present === total ? "present" : "partial";
}

function assertAppliedRecordsMatchJournal(
  state: SchemaState,
  migrations: MigrationFile[],
): Map<string, string> {
  const byTimestamp = new Map(migrations.map((migration) => [
    String(migration.when),
    migration,
  ]));
  const applied = new Map<string, string>();
  for (const record of state.records) {
    if (record.created_at === null) {
      throw new Error("The migration table contains a row without created_at.");
    }
    const migration = byTimestamp.get(String(record.created_at));
    if (!migration) {
      throw new Error(
        "The database contains a migration row that is not in this repository's journal; refusing to guess migration history.",
      );
    }
    if (record.hash !== migration.hash) {
      throw new Error(
        `Migration ${migration.tag} has a different SQL hash in the database; refusing to overwrite migration history.`,
      );
    }
    if (applied.has(migration.tag)) {
      throw new Error(`Migration ${migration.tag} is recorded more than once.`);
    }
    applied.set(migration.tag, migration.tag);
  }
  return applied;
}

function makePlan(
  state: SchemaState,
  migrations: MigrationFile[],
): MigrationOperation[] {
  const applied = assertAppliedRecordsMatchJournal(state, migrations);
  const hasStorefrontTable = STOREFRONT_TABLES.some((table) =>
    state.tables.has(table),
  );
  const hasAnyStorefrontSchema = hasStorefrontTable || applied.size > 0;

  if (state.tables.size > 0 && !hasStorefrontTable && applied.size === 0) {
    throw new Error(
      "The target has a non-empty public schema but no recognizable storefront schema; refusing to initialize or alter it.",
    );
  }
  if (applied.size > 0 && state.tables.size === 0) {
    throw new Error(
      "Migration history exists but the storefront tables are missing; restore or repair the database explicitly before migrating.",
    );
  }
  if (hasAnyStorefrontSchema) {
    const baselineStatus = requirementStatus(state, BASELINE_REQUIREMENT);
    if (baselineStatus !== "present") {
      throw new Error(
        "The existing storefront is not a complete compatible 0000_init schema. No initial migration was run; inspect the reported schema drift on a restored backup.",
      );
    }
  }

  const operations: MigrationOperation[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.tag)) {
      const requirement = REQUIREMENTS[migration.tag];
      if (requirement && requirementStatus(state, requirement) !== "present") {
        throw new Error(
          `Migration ${migration.tag} is recorded but its expected schema objects are missing; refusing to continue with drifted history.`,
        );
      }
      operations.push({ tag: migration.tag, action: "unchanged" });
      continue;
    }

    const requirement = REQUIREMENTS[migration.tag];
    if (!requirement) {
      // Future migrations are always executed normally. Only the three known
      // historical migrations are eligible for explicit schema adoption.
      operations.push({ tag: migration.tag, action: "apply" });
      continue;
    }

    const status = requirementStatus(state, requirement);
    if (status === "partial") {
      throw new Error(
        `Migration ${migration.tag} has only part of its expected schema objects. No SQL was run; resolve the partial schema from a backup before retrying.`,
      );
    }
    operations.push({
      tag: migration.tag,
      action: status === "present" ? "adopt" : "apply",
    });
  }
  return operations;
}

/**
 * Run or plan migrations on an already-connected client.
 *
 * All writes, including adoption records, are in one transaction. The
 * transaction-scoped advisory lock prevents two deploy jobs from applying the
 * same history concurrently. A dry run rolls back even its lock and never
 * creates the Drizzle bookkeeping schema.
 */
export async function migrateDatabase({
  client,
  migrationsFolder,
  adoptExisting = false,
  dryRun = false,
}: MigrateDatabaseOptions): Promise<MigrationResult> {
  const migrations = await loadMigrations(migrationsFolder);
  await client.query("BEGIN");
  let finished = false;
  try {
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_ID]);
    const state = await inspectSchema(client);
    const operations = makePlan(state, migrations);
    const needsAdoption = operations.some((operation) => operation.action === "adopt");
    if (needsAdoption && !adoptExisting && !dryRun) {
      throw new Error(
        "An existing schema needs explicit adoption. Re-run with --adopt-existing only after a backup and compatibility review; the initial migration was not executed.",
      );
    }

    const applied: string[] = [];
    const adopted: string[] = [];
    const unchanged: string[] = [];

    if (!dryRun) {
      if (!state.migrationTableExists) {
        await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
        await client.query(
          `CREATE TABLE "drizzle"."__drizzle_migrations" (
            "id" serial PRIMARY KEY NOT NULL,
            "hash" text NOT NULL,
            "created_at" bigint
          )`,
        );
      }

      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        const migration = migrations[index];
        if (!operation || !migration || operation.tag !== migration.tag) {
          throw new Error("Internal migration plan ordering error.");
        }
        if (operation.action === "unchanged") {
          unchanged.push(operation.tag);
          continue;
        }
        if (operation.action === "apply") {
          for (const statement of migration.statements) {
            await client.query(statement);
          }
          applied.push(operation.tag);
        } else {
          adopted.push(operation.tag);
        }
        await client.query(
          "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
          [migration.hash, migration.when],
        );
      }

      // Verify the final shape before committing. A failed verification rolls
      // back both DDL and bookkeeping rather than leaving a half installation.
      const finalState = await inspectSchema(client);
      for (const migration of migrations) {
        const requirement = REQUIREMENTS[migration.tag];
        if (requirement && requirementStatus(finalState, requirement) !== "present") {
          throw new Error(
            `Migration ${migration.tag} completed without its expected schema objects; transaction rolled back.`,
          );
        }
      }
    }

    if (dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
    finished = true;
    return {
      dryRun,
      operations,
      applied,
      adopted,
      unchanged: dryRun
        ? operations
            .filter((operation) => operation.action === "unchanged")
            .map((operation) => operation.tag)
        : unchanged,
    };
  } catch (error) {
    if (!finished) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

/** Explicitly connect to PostgreSQL, migrate, and close the connection. */
export async function migratePostgres(
  options: MigratePostgresOptions = {},
): Promise<MigrationResult> {
  const client = new Client({
    connectionString: options.connectionString ?? resolveDatabaseUrl(),
  });
  await client.connect();
  try {
    return await migrateDatabase({
      client: client as unknown as MigrationClient,
      migrationsFolder: options.migrationsFolder,
      adoptExisting: options.adoptExisting,
      dryRun: options.dryRun,
    });
  } finally {
    await client.end();
  }
}
