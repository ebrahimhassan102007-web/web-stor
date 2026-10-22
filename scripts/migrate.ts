/**
 * Explicit database schema deployment step.
 *
 * Fresh disposable database:
 *   DATABASE_URL=postgres://.../evora_test npm run db:migrate
 *
 * Existing storefront (after a backup and a restored-copy rehearsal):
 *   DATABASE_URL=postgres://.../evora_test npm run db:migrate -- --adopt-existing
 *
 * Use -- --dry-run first to inspect the plan. Remote and production targets
 * require separate, intentional confirmations; no command is run by Next.js
 * startup.
 */
import "dotenv/config";
import { migratePostgres } from "../src/lib/db/migrations";
import { resolveDatabaseUrl } from "../src/lib/db/config";

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host === "::1") return true;
  const octets = host.split(".");
  return (
    octets.length === 4 &&
    octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) &&
    Number(octets[0]) === 127
  );
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function main(): Promise<void> {
  const supportedFlags = new Set(["--adopt-existing", "--dry-run"]);
  for (const argument of process.argv.slice(2)) {
    if (!supportedFlags.has(argument)) {
      throw new Error(`Unknown migration option: ${argument}`);
    }
  }

  const databaseUrl = resolveDatabaseUrl();
  const host = new URL(databaseUrl).hostname;
  const remote = !isLoopbackHost(host);
  if (remote && process.env.ALLOW_REMOTE_MIGRATION !== "YES") {
    throw new Error(
      "Refusing a remote migration target. Set ALLOW_REMOTE_MIGRATION=YES only after confirming the target is the intended database.",
    );
  }
  if (process.env.NODE_ENV === "production") {
    if (
      process.env.ALLOW_PRODUCTION_MIGRATION !== "YES" ||
      process.env.CONFIRM_PRODUCTION_BACKUP !== "YES"
    ) {
      throw new Error(
        "Production migrations require ALLOW_PRODUCTION_MIGRATION=YES and CONFIRM_PRODUCTION_BACKUP=YES after a verified backup and restore rehearsal.",
      );
    }
  }

  const dryRun = hasFlag("--dry-run");
  const result = await migratePostgres({
    connectionString: databaseUrl,
    adoptExisting: hasFlag("--adopt-existing"),
    dryRun,
  });

  const planned = result.operations
    .map((operation) => `${operation.tag}:${operation.action}`)
    .join(", ");
  console.log(`[migrate] ${dryRun ? "dry-run plan" : "completed"}: ${planned}`);
  if (!dryRun) {
    console.log(
      `[migrate] applied ${result.applied.length}, adopted ${result.adopted.length}, unchanged ${result.unchanged.length}; no application data was deleted.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    "[migrate] failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
