/**
 * Local development PostgreSQL server.
 *
 * Boots a real PostgreSQL instance (binaries shipped via npm) so the app can
 * be developed without a system-wide Postgres installation. In production,
 * point DATABASE_URL at a managed PostgreSQL instance instead.
 */
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(".pgdata");
const PORT = Number(process.env.PGPORT ?? 5432);

async function main() {
  const freshCluster = !fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "webstor",
    password: "webstor_dev_password",
    port: PORT,
    persistent: true,
  });

  if (freshCluster) {
    console.log("[db] initializing new PostgreSQL cluster...");
    await pg.initialise();
  }

  await pg.start();
  if (freshCluster) {
    await pg.createDatabase("webstor");
  }
  console.log(`[db] PostgreSQL listening on port ${PORT} (db: webstor)`);

  const shutdown = async () => {
    console.log("[db] shutting down...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[db] failed to start PostgreSQL:", err);
  process.exit(1);
});
