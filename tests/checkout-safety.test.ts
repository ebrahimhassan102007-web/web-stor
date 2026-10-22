import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();

test("production checkout returns 503 without opening a database connection", async () => {
  const probe = path.join(root, "tests/support/production-checkout-probe.ts");
  const tripwire = path.join(root, "tests/support/no-network.cjs");
  const serverOnlyStub = path.join(root, "tests/support/stub-server-only.cjs");
  const sessionSecret = randomBytes(32).toString("hex");

  const { stdout, stderr } = await run(
    process.execPath,
    ["--import", "tsx", probe],
    {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        APP_ORIGIN: "https://store.test",
        DATABASE_URL: "postgresql://db.example.invalid:5432/evora_test",
        SESSION_SECRET: sessionSecret,
        NODE_OPTIONS: `--require ${serverOnlyStub} --require ${tripwire}`,
      } as NodeJS.ProcessEnv,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    },
  );

  assert.equal(stderr.includes("NETWORK_ATTEMPT"), false);
  const output = stdout.trim().split(/\r?\n/).at(-1);
  assert.ok(output, "probe must return a JSON response");
  const response = JSON.parse(output) as { status: number; body: string };
  assert.equal(response.status, 503);
  assert.match(response.body, /CHECKOUT_DISABLED/);
});
