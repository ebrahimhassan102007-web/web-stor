import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTestDatabaseTarget,
  hasTestDatabaseSuffix,
  isLoopbackHost,
  REMOTE_TEST_DATABASE_OPT_IN,
  REMOTE_TEST_DATABASE_OPT_IN_VALUE,
  resolveTestDatabaseTarget,
  TEST_DATABASE_NAME_SUFFIX,
} from "../src/lib/db/test-database";

const LOCAL_TEST_URL = "postgres://webstor:secret@localhost:5432/webstor_test";
const REMOTE_TEST_URL = "postgres://webstor:secret@db.example.com:5432/webstor_test";

/* ---------------------------- Loopback detection ------------------------- */

test("loopback detection accepts only this-machine hosts", () => {
  for (const host of [
    "localhost",
    "localhost.",
    "",
    "127.0.0.1",
    "127.1.2.3",
    "::1",
    "[::1]",
    "0:0:0:0:0:0:0:1",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(isLoopbackHost(host), true, host);
  }

  for (const host of [
    "db.example.com",
    "10.0.0.5",
    "192.168.1.10",
    "postgres",
    "host.docker.internal",
    "2001:db8::1",
    "localhost.evil.test",
  ]) {
    assert.equal(isLoopbackHost(host), false, host);
  }
});

test("the test database suffix is strict", () => {
  assert.equal(TEST_DATABASE_NAME_SUFFIX, "_test");
  assert.equal(hasTestDatabaseSuffix("webstor_test"), true);
  assert.equal(hasTestDatabaseSuffix("WEBSTOR_TEST"), true);
  for (const name of ["webstor", "test", "mytest", "test_webstor", "webstor_test2", "_test_backup", "_test"]) {
    assert.equal(hasTestDatabaseSuffix(name), false, name);
  }
});

/* --------------------------- Default: local only ------------------------- */

test("a local *_test database is allowed by default", () => {
  const resolution = resolveTestDatabaseTarget({ TEST_DATABASE_URL: LOCAL_TEST_URL });
  assert.equal(resolution.allowed, true);
  if (!resolution.allowed) return;
  assert.equal(resolution.remote, false);
  assert.equal(resolution.databaseName, "webstor_test");
  assert.equal(resolution.label, "localhost:5432/webstor_test");
});

test("loopback IP targets are allowed by default", () => {
  for (const url of [
    "postgres://webstor:secret@127.0.0.1:5432/webstor_test",
    "postgresql://webstor:secret@[::1]:5432/webstor_test",
  ]) {
    const resolution = resolveTestDatabaseTarget({ TEST_DATABASE_URL: url });
    assert.equal(resolution.allowed, true, url);
  }
});

test("a remote database is rejected by default", () => {
  const resolution = resolveTestDatabaseTarget({ TEST_DATABASE_URL: REMOTE_TEST_URL });
  assert.equal(resolution.allowed, false);
  if (resolution.allowed) return;
  assert.equal(resolution.kind, "remote");
  assert.match(resolution.reason, /non-loopback/);
  assert.match(resolution.reason, /ALLOW_REMOTE_TEST_DATABASE=YES/);
});

test("remote rejection never leaks credentials or the full connection URL", () => {
  const resolution = resolveTestDatabaseTarget({ TEST_DATABASE_URL: REMOTE_TEST_URL });
  assert.equal(resolution.allowed, false);
  if (resolution.allowed) return;
  for (const secret of ["webstor:secret", "secret", "postgres://", "postgresql://"]) {
    assert.equal(
      resolution.reason.includes(secret),
      false,
      `rejection message must not contain ${secret}`,
    );
  }
  // The credential-free host:port/database label is fine.
  assert.match(resolution.reason, /db\.example\.com:5432\/webstor_test/);

  assert.throws(
    () => assertTestDatabaseTarget({ TEST_DATABASE_URL: REMOTE_TEST_URL }),
    (error: Error) => {
      assert.equal(error.name, "UnsafeTestDatabaseError");
      assert.equal(error.message.includes("secret"), false);
      assert.equal(error.message.includes(REMOTE_TEST_URL), false);
      return true;
    },
  );
});

/* ----------------------- Explicit remote opt-in path --------------------- */

test("an opted-in disposable remote test database is handled as designed", () => {
  const resolution = resolveTestDatabaseTarget({
    TEST_DATABASE_URL: REMOTE_TEST_URL,
    [REMOTE_TEST_DATABASE_OPT_IN]: REMOTE_TEST_DATABASE_OPT_IN_VALUE,
  });
  assert.equal(resolution.allowed, true);
  if (!resolution.allowed) return;
  assert.equal(resolution.remote, true, "the target must be flagged as remote");
  assert.equal(resolution.databaseName, "webstor_test");
  assert.equal(resolution.label, "db.example.com:5432/webstor_test");
  assert.equal(assertTestDatabaseTarget({
    TEST_DATABASE_URL: REMOTE_TEST_URL,
    [REMOTE_TEST_DATABASE_OPT_IN]: REMOTE_TEST_DATABASE_OPT_IN_VALUE,
  }).remote, true);
});

test("the opt-in does not bypass the strict test-name requirement", () => {
  for (const url of [
    "postgres://webstor:secret@db.example.com:5432/webstor",
    "postgres://webstor:secret@db.example.com:5432/webstor_prod",
    "postgres://webstor:secret@db.example.com:5432/stagingtest",
  ]) {
    const resolution = resolveTestDatabaseTarget({
      TEST_DATABASE_URL: url,
      [REMOTE_TEST_DATABASE_OPT_IN]: REMOTE_TEST_DATABASE_OPT_IN_VALUE,
    });
    assert.equal(resolution.allowed, false, url);
    if (resolution.allowed) return;
    assert.equal(resolution.kind, "unsafe-name", url);
  }
});

test("the opt-in must be the exact documented value", () => {
  for (const value of ["", "yes", "true", "1", "Y", "YES "]) {
    const resolution = resolveTestDatabaseTarget({
      TEST_DATABASE_URL: REMOTE_TEST_URL,
      [REMOTE_TEST_DATABASE_OPT_IN]: value,
    });
    assert.equal(resolution.allowed, false, JSON.stringify(value));
    if (resolution.allowed) return;
    assert.equal(resolution.kind, "remote");
  }
});

/* ------------------------------ Production ------------------------------ */

test("production refuses destructive tests even for a local *_test database", () => {
  const resolution = resolveTestDatabaseTarget({
    NODE_ENV: "production",
    TEST_DATABASE_URL: LOCAL_TEST_URL,
  });
  assert.equal(resolution.allowed, false);
  if (resolution.allowed) return;
  assert.equal(resolution.kind, "production");
  assert.match(resolution.reason, /NODE_ENV=production/);

  assert.throws(
    () => assertTestDatabaseTarget({ NODE_ENV: "production", TEST_DATABASE_URL: LOCAL_TEST_URL }),
    /refused when NODE_ENV=production/,
  );
});

test("production also refuses an opted-in remote test database", () => {
  const resolution = resolveTestDatabaseTarget({
    NODE_ENV: "production",
    TEST_DATABASE_URL: REMOTE_TEST_URL,
    [REMOTE_TEST_DATABASE_OPT_IN]: REMOTE_TEST_DATABASE_OPT_IN_VALUE,
  });
  assert.equal(resolution.allowed, false);
  if (resolution.allowed) return;
  assert.equal(resolution.kind, "production");
});

/* --------------------------- Missing / invalid -------------------------- */

test("a missing or malformed TEST_DATABASE_URL cannot enable destructive tests", () => {
  const missing = resolveTestDatabaseTarget({});
  assert.equal(missing.allowed, false);
  if (!missing.allowed) assert.equal(missing.kind, "missing");

  const malformed = resolveTestDatabaseTarget({ TEST_DATABASE_URL: "not a url" });
  assert.equal(malformed.allowed, false);
  if (!malformed.allowed) assert.equal(malformed.kind, "invalid");

  const mysql = resolveTestDatabaseTarget({
    TEST_DATABASE_URL: "mysql://webstor:secret@localhost:3306/webstor_test",
  });
  assert.equal(mysql.allowed, false);
  if (!mysql.allowed) assert.equal(mysql.kind, "invalid");

  const noName = resolveTestDatabaseTarget({
    TEST_DATABASE_URL: "postgres://webstor:secret@localhost:5432/",
  });
  assert.equal(noName.allowed, false);
  if (!noName.allowed) assert.equal(noName.kind, "invalid");
});

test("a local database without the strict suffix is refused before connecting", () => {
  for (const name of ["webstor", "webstor_dev", "webstor_prod"]) {
    const resolution = resolveTestDatabaseTarget({
      TEST_DATABASE_URL: `postgres://webstor:secret@localhost:5432/${name}`,
    });
    assert.equal(resolution.allowed, false, name);
    if (resolution.allowed) return;
    assert.equal(resolution.kind, "unsafe-name");
    assert.match(resolution.reason, /must end with "_test"/);
  }
});
