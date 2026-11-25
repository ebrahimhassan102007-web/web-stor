/**
 * Deployment guard rails — a clean checkout must build on Vercel without a
 * single runtime secret, and the runtime must still fail closed.
 *
 * These are source- and config-level assertions only: no browser, no database,
 * no network. They exist because Preview deployments failed while Production
 * deployments of the same tree succeeded, and the fix has to stay fixed: strict
 * validation is deferred to server start, the build tooling is always installed,
 * the Node runtime is pinned, and nothing talks to PostgreSQL during a build.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { assertValidEnv, isBuildPhase, validateEnv } from "../src/lib/env";

const cwd = process.cwd();
const source = (relative: string) => readFileSync(path.join(cwd, relative), "utf8");
const json = (relative: string) => JSON.parse(source(relative)) as Record<string, unknown>;

const PRODUCTION_WITHOUT_SECRETS = { NODE_ENV: "production" } as const;

/* ------------------------------------------------------------------ */
/* 1. Build phase never enforces runtime secrets                       */
/* ------------------------------------------------------------------ */

test("S-28: the build phase is detected from NEXT_PHASE only", () => {
  assert.equal(isBuildPhase({ NEXT_PHASE: "phase-production-build" }), true);
  assert.equal(isBuildPhase({ NEXT_PHASE: "phase-production-build", NODE_ENV: "production" }), true);
  assert.equal(isBuildPhase({ NEXT_PHASE: "phase-development-server" }), false);
  assert.equal(isBuildPhase({}), false);
});

test("S-28: assertValidEnv is a no-op during `next build`", () => {
  // A build is not a deployment: no DATABASE_URL, no SESSION_SECRET, no keys.
  assert.doesNotThrow(() => assertValidEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }));
  assert.doesNotThrow(() =>
    assertValidEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build", APP_ORIGIN: "https://example.test" }),
  );
});

test("S-28: the runtime still fails closed with every problem listed", () => {
  // Same input, no build phase → must throw, and must name each missing secret.
  assert.throws(
    () => assertValidEnv({ ...PRODUCTION_WITHOUT_SECRETS }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      for (const name of [
        "SESSION_SECRET",
        "AUTH_SECRET",
        "WALLET_TOPUP_WEBHOOK_SECRET",
        "TOTP_ENCRYPTION_KEY",
        "FULFILLMENT_ENCRYPTION_KEY",
        "VAULT_MASTER_KEY",
        "DATABASE_URL",
        "APP_ORIGIN",
      ]) {
        assert.match(error.message, new RegExp(name));
      }
      return true;
    },
  );
});

test("S-28: validateEnv stays pure, so build-time skips cannot hide real errors", () => {
  const buildPhase = validateEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" });
  const runtime = validateEnv({ ...PRODUCTION_WITHOUT_SECRETS });
  assert.ok(buildPhase.length > 0, "the rules must still report errors during a build");
  assert.deepEqual(buildPhase, runtime, "the phase must not change what is wrong");
});

test("S-28: no insecure fallback secret exists for production", () => {
  const env = source("src/lib/env.ts");
  // No default value may be substituted for a required secret.
  assert.doesNotMatch(env, /SESSION_SECRET\s*\?\?\s*"/);
  assert.doesNotMatch(env, /AUTH_SECRET\s*\?\?\s*"/);
  assert.doesNotMatch(env, /VAULT_MASTER_KEY\s*\?\?\s*"/);
  assert.doesNotMatch(env, /DATABASE_URL\s*\?\?\s*"/);
  // Fail-closed marker must survive future edits.
  assert.match(env, /throw new Error\(`Invalid environment configuration/);
});

test("S-28: the startup hook skips the build phase before validating", () => {
  const instrumentation = source("src/instrumentation.ts");
  assert.match(instrumentation, /isBuildPhase/);
  const guardIndex = instrumentation.indexOf("isBuildPhase()");
  const validateIndex = instrumentation.indexOf("assertValidEnv()");
  assert.ok(guardIndex > -1 && validateIndex > guardIndex, "isBuildPhase() must run before assertValidEnv()");
  assert.match(instrumentation, /NEXT_RUNTIME !== "nodejs"/);
});

/* ------------------------------------------------------------------ */
/* 2. Vercel installs the build tooling and uses the repo commands     */
/* ------------------------------------------------------------------ */

test("S-28: vercel.json pins an install command that keeps devDependencies", () => {
  assert.ok(existsSync(path.join(cwd, "vercel.json")), "vercel.json must exist so the project cannot override the commands");
  const config = json("vercel.json");
  const allowed = new Set(["installCommand", "buildCommand", "framework", "outputDirectory", "regions", "functions"]);
  for (const key of Object.keys(config)) {
    assert.ok(allowed.has(key), `unexpected vercel.json key: ${key}`);
  }
  assert.equal(config.installCommand, "npm ci --include=dev");
  assert.equal(config.buildCommand, "npm run build");
});

test("S-28: every build-critical package is installed by that command", () => {
  const pkg = json("package.json") as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
  const installed = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ["tailwindcss", "@tailwindcss/postcss", "typescript", "next", "react", "react-dom"]) {
    assert.ok(installed[name], `${name} must be a declared dependency`);
  }
  // The CSS pipeline lives in devDependencies, which is exactly why the install
  // command above must not omit them.
  assert.ok(pkg.devDependencies?.tailwindcss, "tailwindcss is a devDependency; --include=dev is mandatory");
  assert.ok(pkg.devDependencies?.["@tailwindcss/postcss"], "@tailwindcss/postcss is a devDependency");
});

test("S-28: the Node runtime is pinned to the major CI uses", () => {
  const engines = json("package.json").engines as { node?: string } | undefined;
  assert.ok(engines?.node, "package.json must pin engines.node so Vercel and CI agree");
  const major = engines.node.replace(/[^0-9]/g, "").slice(0, 2);
  const workflow = source(".github/workflows/quality.yml");
  const ciMajor = /node-version:\s*['"]?(\d+)/.exec(workflow)?.[1];
  assert.equal(major, ciMajor, "engines.node must match the CI Node major");
});

/* ------------------------------------------------------------------ */
/* 3. A build never touches PostgreSQL                                 */
/* ------------------------------------------------------------------ */

test("S-28: statically prerendered routes import no database code", () => {
  for (const route of ["src/app/sitemap.ts", "src/app/robots.ts", "src/app/manifest.ts"]) {
    const file = source(route);
    assert.doesNotMatch(file, /from "@\/lib\/db|from "\.\.\/lib\/db|from "\.\.\/\.\.\/lib\/db/, `${route} must stay DB-free`);
    assert.doesNotMatch(file, /from "@\/lib\/catalog"/, `${route} must not read the catalogue at build time`);
  }
  // Data pages must stay dynamic so they are rendered per request, not at build.
  for (const route of ["src/app/page.tsx", "src/app/products/page.tsx", "src/app/offers/page.tsx"]) {
    assert.match(source(route), /export const dynamic = "force-dynamic"/, `${route} must stay force-dynamic`);
  }
});

/* ------------------------------------------------------------------ */
/* 4. Schema deployment stays an explicit, idempotent step             */
/* ------------------------------------------------------------------ */

test("S-28: db:migrate is a separate, guarded, idempotent command", () => {
  const scripts = json("package.json").scripts as Record<string, string>;
  assert.equal(scripts["db:migrate"], "tsx scripts/migrate.ts");

  const migrate = source("scripts/migrate.ts");
  assert.match(migrate, /migratePostgres/);
  assert.match(migrate, /ALLOW_REMOTE_MIGRATION/);
  assert.match(migrate, /ALLOW_PRODUCTION_MIGRATION/);
  assert.match(migrate, /CONFIRM_PRODUCTION_BACKUP/);
  assert.match(migrate, /--dry-run/);
  // A build or a server start must never migrate implicitly: the startup hook
  // may *document* the command, but its executable body may not call it.
  const instrumentation = source("src/instrumentation.ts");
  const registerBody = instrumentation.slice(instrumentation.indexOf("export async function register"));
  assert.doesNotMatch(registerBody, /migrate/i, "register() must not migrate at startup");
  assert.match(instrumentation, /intentionally \*not\* run/);
  assert.doesNotMatch(source("vercel.json"), /migrate/i, "the build command must not migrate");
  assert.doesNotMatch(scripts.build, /migrate/i);
  assert.doesNotMatch(scripts.start, /migrate/i);
});

test("S-28: every migration in the journal ships with its SQL file", () => {
  const journal = JSON.parse(source("drizzle/meta/_journal.json")) as { entries: { tag: string }[] };
  assert.equal(journal.entries.length, 11, "eleven migrations are the current contract (0000 … 0010)");
  for (const entry of journal.entries) {
    assert.ok(existsSync(path.join(cwd, "drizzle", `${entry.tag}.sql`)), `missing drizzle/${entry.tag}.sql`);
  }
  assert.equal(journal.entries[0].tag, "0000_init");
  assert.equal(journal.entries.at(-1)?.tag, "0010_marketplace_sellers_disputes_and_vault_v2");
});

/* ------------------------------------------------------------------ */
/* 5. The runbook exists, in the repository, with names but no values  */
/* ------------------------------------------------------------------ */

test("S-28: the deployment runbook documents every required variable by name", () => {
  const runbook = source("docs/deployment/VERCEL.md");
  for (const name of [
    "DATABASE_URL",
    "APP_ORIGIN",
    "SESSION_SECRET",
    "AUTH_SECRET",
    "WALLET_TOPUP_WEBHOOK_SECRET",
    "TOTP_ENCRYPTION_KEY",
    "TOTP_ENCRYPTION_KEY_ID",
    "FULFILLMENT_ENCRYPTION_KEY",
    "FULFILLMENT_ENCRYPTION_KEY_ID",
    "VAULT_MASTER_KEY",
    "VAULT_MASTER_KEY_ID",
    "VAULT_KEY_PEPPER",
  ]) {
    assert.match(runbook, new RegExp(name), `runbook must name ${name}`);
  }
  // Preview scope is the failure that started this: it must be spelled out.
  assert.match(runbook, /Preview/);
  // No secret material: 40+ char hex/base64 blobs must never appear in docs.
  assert.doesNotMatch(runbook, /\b[a-f0-9]{40,}\b/);
  assert.doesNotMatch(runbook, /\b[A-Za-z0-9_-]{43}\b/);
});
