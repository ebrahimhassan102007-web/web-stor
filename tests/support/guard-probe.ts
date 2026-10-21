/**
 * Child-process probe for the destructive-test guard.
 *
 * Runs with `tests/support/no-network.cjs` preloaded, so any attempt to open a
 * socket or resolve a host exits with code 3. It only evaluates the (pure)
 * safety policy for the URL given on the command line and prints the result.
 *
 * Usage: node --import tsx --require no-network.cjs guard-probe.ts <url> [optIn]
 */
import { resolveTestDatabaseTarget } from "../../src/lib/db/test-database";

const url = process.argv[2] ?? "";
const optIn = process.argv[3];

const resolution = resolveTestDatabaseTarget({
  TEST_DATABASE_URL: url,
  ...(optIn ? { ALLOW_REMOTE_TEST_DATABASE: optIn } : {}),
});

process.stdout.write(JSON.stringify(resolution));
