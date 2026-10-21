import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { parse as parseConnectionString } from "pg-connection-string";
import {
  assertTestDatabaseTarget,
  hasTestDatabaseSuffix,
  isLoopbackHost,
  isUnixSocketHost,
  REMOTE_TEST_DATABASE_OPT_IN,
  REMOTE_TEST_DATABASE_OPT_IN_VALUE,
  resolveEffectiveConnectionHost,
  resolveTestDatabaseTarget,
  TEST_DATABASE_NAME_SUFFIX,
  type TestDatabaseRejection,
} from "../src/lib/db/test-database";

const run = promisify(execFile);
const root = process.cwd();

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

/* ------------------ Host override: the real connection target -------------- */

/**
 * `pg` reads the connection string through `pg-connection-string`, which lets
 * `?host=` override the URI authority. These cases pin the behaviour we rely
 * on and prove the policy classifies the *effective* target, not `URL.hostname`.
 */
const OVERRIDE_CASES: ReadonlyArray<{
  url: string;
  kind: TestDatabaseRejection["kind"] | "allowed";
  why: string;
}> = [
  {
    url: "postgres://user:pass@localhost:5432/webstor_test?host=db.example.com",
    kind: "ambiguous",
    why: "authority says localhost, ?host= says remote",
  },
  {
    url: "postgres://db.example.com:5432/webstor_test?host=localhost",
    kind: "ambiguous",
    why: "authority says remote, ?host= says localhost",
  },
  {
    url: "postgres://user:pass@localhost:5432/webstor_test?host=localhost&host=db.example.com",
    kind: "ambiguous",
    why: "repeated host parameters (pg uses the last one)",
  },
  {
    url: "postgres://user:pass@localhost:5432/webstor_test?host=db.example.com&host=localhost",
    kind: "ambiguous",
    why: "repeated host parameters in the other order",
  },
  {
    url: "postgres://user:pass@localhost:5432/webstor_test?host=localhost%2Cdb.example.com",
    kind: "ambiguous",
    why: "comma-separated host list",
  },
  {
    url: "postgres://user:pass@localhost:5432/webstor_test?host[]=db.example.com",
    kind: "ambiguous",
    why: "host[] array form",
  },
  {
    url: "postgres://user:pass@localhost:5432/webstor_test?hostaddr=db.example.com",
    kind: "ambiguous",
    why: "hostaddr alias",
  },
  {
    url: "postgres://user:pass@localhost:5432/webstor_test?HOST=db.example.com",
    kind: "ambiguous",
    why: "case-variant host key",
  },
  {
    url: "postgres:///webstor_test",
    kind: "ambiguous",
    why: "no host at all (pg falls back to PGHOST/localhost)",
  },
  {
    url: "postgres://%2Fvar%2Frun%2Fpostgresql/webstor_test",
    kind: "ambiguous",
    why: "percent-encoded socket in the authority",
  },
  {
    url: "postgres://localhost:5432/webstor_test?host=localhost",
    kind: "allowed",
    why: "authority and ?host= agree",
  },
  {
    url: "postgres:///webstor_test?host=localhost",
    kind: "allowed",
    why: "explicit local query host with an empty authority",
  },
  {
    url: "postgres:///webstor_test?host=127.0.0.1",
    kind: "allowed",
    why: "explicit loopback query host",
  },
  {
    url: "postgres:///webstor_test?host=%2Fvar%2Frun%2Fpostgresql",
    kind: "allowed",
    why: "explicit local unix socket path",
  },
];

test("host-parameter overrides are classified by the effective target", () => {
  for (const testCase of OVERRIDE_CASES) {
    const resolution = resolveTestDatabaseTarget({
      TEST_DATABASE_URL: testCase.url,
    });
    assert.equal(
      resolution.allowed,
      testCase.kind === "allowed",
      `${testCase.why}: ${testCase.url} → ${JSON.stringify(resolution)}`,
    );
    if (!resolution.allowed) {
      assert.equal(resolution.kind, testCase.kind, testCase.why);
    }
  }
});

test("a localhost authority plus a remote ?host= is rejected by default", () => {
  const resolution = resolveTestDatabaseTarget({
    TEST_DATABASE_URL:
      "postgres://user:pass@localhost:5432/webstor_test?host=db.example.com",
  });
  assert.equal(resolution.allowed, false);
  if (resolution.allowed) return;
  assert.equal(resolution.kind, "ambiguous");
  assert.match(resolution.reason, /different servers/i);

  // The bypass this fixes: URL.hostname says localhost while pg connects to
  // the query host, which used to be classified as a local target.
  const url = "postgres://user:pass@localhost:5432/webstor_test?host=db.example.com";
  assert.equal(new URL(url).hostname, "localhost");
  assert.equal(parseConnectionString(url).host, "db.example.com");
});

test("an empty authority with a remote ?host= is rejected by default", () => {
  const url = "postgres:///webstor_test?host=db.example.com";
  assert.equal(new URL(url).hostname, "");
  assert.equal(parseConnectionString(url).host, "db.example.com");

  const resolution = resolveTestDatabaseTarget({ TEST_DATABASE_URL: url });
  assert.equal(resolution.allowed, false);
  if (resolution.allowed) return;
  assert.equal(resolution.kind, "remote");
  assert.match(resolution.reason, /non-loopback/);
});

test("a remote effective host given via ?host= needs the explicit opt-in", () => {
  const url = "postgres:///webstor_test?host=db.example.com";

  const withoutOptIn = resolveTestDatabaseTarget({ TEST_DATABASE_URL: url });
  assert.equal(withoutOptIn.allowed, false);

  const withOptIn = resolveTestDatabaseTarget({
    TEST_DATABASE_URL: url,
    [REMOTE_TEST_DATABASE_OPT_IN]: REMOTE_TEST_DATABASE_OPT_IN_VALUE,
  });
  assert.equal(withOptIn.allowed, true);
  if (!withOptIn.allowed) return;
  assert.equal(withOptIn.remote, true);
  assert.equal(withOptIn.host, "db.example.com");
  assert.equal(withOptIn.hostSource, "query");
  assert.equal(withOptIn.label, "db.example.com:5432/webstor_test");

  // The opt-in never bypasses the strict database-name rule.
  const wrongName = resolveTestDatabaseTarget({
    TEST_DATABASE_URL: "postgres:///webstor_prod?host=db.example.com",
    [REMOTE_TEST_DATABASE_OPT_IN]: REMOTE_TEST_DATABASE_OPT_IN_VALUE,
  });
  assert.equal(wrongName.allowed, false);
  if (!wrongName.allowed) assert.equal(wrongName.kind, "unsafe-name");
});

test("local wording in ?host= cannot smuggle a remote target past the policy", () => {
  for (const url of [
    "postgres:///webstor_test?host=db.example.com&host=localhost",
    "postgres:///webstor_test?host=localhost&host=db.example.com",
    "postgres:///webstor_test?host=localhost%2Cdb.example.com",
    "postgres:///webstor_test?host=localhost.",
  ]) {
    const resolution = resolveTestDatabaseTarget({ TEST_DATABASE_URL: url });
    if (url.endsWith("host=localhost.")) {
      // Trailing dot is the same loopback name: allowed and still local.
      assert.equal(resolution.allowed, true, url);
      if (resolution.allowed) assert.equal(resolution.remote, false);
      continue;
    }
    assert.equal(resolution.allowed, false, url);
    if (!resolution.allowed) {
      assert.equal(resolution.kind, "ambiguous", url);
    }
  }
});

test("the effective host always matches what pg-connection-string resolves", () => {
  for (const testCase of OVERRIDE_CASES) {
    const resolution = resolveTestDatabaseTarget({
      TEST_DATABASE_URL: testCase.url,
    });
    if (!resolution.allowed) continue;

    const driverHost = parseConnectionString(testCase.url).host ?? "";
    assert.equal(
      resolution.host,
      driverHost.replace(/\.$/, "").toLowerCase(),
      `${testCase.url}: policy host must equal the driver's host`,
    );
    assert.equal(
      resolution.connectionString,
      testCase.url,
      "the exact validated string is what gets used",
    );
  }
});

test("the driver really does let ?host= win, which is why conflicts are refused", () => {
  const conflict = "postgres://user:pass@localhost:5432/webstor_test?host=db.example.com";
  assert.equal(parseConnectionString(conflict).host, "db.example.com");

  const repeated =
    "postgres://user:pass@localhost:5432/webstor_test?host=localhost&host=db.example.com";
  assert.equal(parseConnectionString(repeated).host, "db.example.com");

  const emptyAuthority = "postgres:///webstor_test?host=db.example.com";
  assert.equal(parseConnectionString(emptyAuthority).host, "db.example.com");

  // …and that an empty host falls back to PGHOST, so it is refused.
  assert.equal(new URL("postgres:///webstor_test").hostname, "");
  const noHost = resolveTestDatabaseTarget({
    TEST_DATABASE_URL: "postgres:///webstor_test",
  });
  assert.equal(noHost.allowed, false);
});

test("resolveEffectiveConnectionHost reports the source and refuses junk", () => {
  const local = resolveEffectiveConnectionHost(new URL(LOCAL_TEST_URL));
  assert.deepEqual(local, { ok: true, host: "localhost", source: "authority" });

  const socket = resolveEffectiveConnectionHost(
    new URL("postgres:///webstor_test?host=%2Fvar%2Frun%2Fpostgresql"),
  );
  assert.deepEqual(socket, {
    ok: true,
    host: "/var/run/postgresql",
    source: "unix-socket",
  });
  if (socket.ok) assert.equal(isUnixSocketHost(socket.host), true);

  for (const url of [
    "postgres:///webstor_test",
    "postgres://localhost/webstor_test?host=a&host=b",
    "postgres://localhost/webstor_test?host=a,b",
    "postgres://localhost/webstor_test?hostaddr=a",
    "postgres://localhost/webstor_test?host[]=a",
  ]) {
    const resolution = resolveEffectiveConnectionHost(new URL(url));
    assert.equal(resolution.ok, false, url);
  }
});

test("every host-override rejection stays credential-free", () => {
  const secretUrls = OVERRIDE_CASES.map((testCase) => testCase.url).concat([
    "postgres://leakuser:leakpassword@localhost:5432/webstor_test?host=db.example.com",
    "postgres://leakuser:leakpassword@/webstor_test?host=db.example.com",
  ]);

  for (const url of secretUrls) {
    const resolution = resolveTestDatabaseTarget({ TEST_DATABASE_URL: url });
    if (resolution.allowed) continue;
    for (const secret of ["leakpassword", "leakuser", "secret", "user:pass", "postgres://", "postgresql://"]) {
      assert.equal(
        resolution.reason.includes(secret),
        false,
        `${url}: rejection leaked ${secret}`,
      );
    }
  }
});

/* -------------------- No connection while rejecting ----------------------- */

test("rejection is evaluated before any pool or connection exists", async () => {
  const policy = await readFile(
    path.join(root, "src/lib/db/test-database.ts"),
    "utf8",
  );
  // The policy module must stay pure: no driver/socket imports at all.
  for (const forbidden of ['from "pg"', 'require("pg")', 'from "node:net"', 'from "node:tls"', 'dns']) {
    assert.equal(policy.includes(forbidden), false, `policy must not import ${forbidden}`);
  }

  const suite = await readFile(
    path.join(root, "tests/postgres-behaviour.test.ts"),
    "utf8",
  );
  const validate = suite.indexOf("assertTestDatabaseTarget(process.env)");
  const pool = suite.indexOf("new Pool(");
  const truncate = suite.indexOf("TRUNCATE TABLE");
  assert.ok(validate > 0, "suite must validate the target");
  assert.ok(pool > validate, "the pool must be created only after validation");
  assert.ok(truncate > pool, "truncation must happen only after validation");
});

test("no socket is opened while an unsafe URL is rejected (network tripwire)", async () => {
  const probe = path.join(root, "tests/support/guard-probe.ts");
  const tripwire = path.join(root, "tests/support/no-network.cjs");

  async function probeUrl(url: string, optIn?: string) {
    const args = ["--import", "tsx", probe, url];
    if (optIn) args.push(optIn);
    return run(process.execPath, args, {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        NODE_OPTIONS: `--require ${tripwire}`,
      } as unknown as NodeJS.ProcessEnv,
      timeout: 60_000,
    });
  }

  for (const url of [
    "postgres://leakuser:leakpassword@localhost:5432/webstor_test?host=db.example.com",
    "postgres:///webstor_test?host=db.example.com",
    "postgres:///webstor_test?host=a&host=b",
    "postgres://db.example.com:5432/webstor_prod",
  ]) {
    const { stdout, stderr } = await probeUrl(url);
    assert.equal(stderr.includes("NETWORK_ATTEMPT"), false, `${url} opened a connection`);
    const resolution = JSON.parse(stdout) as TestDatabaseRejection;
    assert.equal(resolution.allowed, false, url);
  }

  // Sanity check: the accepted CI-style target still resolves without network.
  const { stdout } = await probeUrl(LOCAL_TEST_URL);
  const accepted = JSON.parse(stdout) as { allowed: boolean; host: string };
  assert.equal(accepted.allowed, true);
  assert.equal(accepted.host, "localhost");

  // Control: the tripwire itself must trip, otherwise the check above would be
  // vacuous. A deliberate TCP connect attempt must abort the probe.
  const control = await run(
    process.execPath,
    ["-e", 'require("node:net").connect({ host: "db.example.com", port: 5432 });'],
    {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        NODE_OPTIONS: `--require ${tripwire}`,
      } as unknown as NodeJS.ProcessEnv,
      timeout: 60_000,
    },
  ).then(
    () => ({ code: 0, stderr: "" }),
    (error: { code?: number; stderr?: string }) => ({
      code: error.code ?? 1,
      stderr: error.stderr ?? "",
    }),
  );
  assert.equal(control.code, 3, "the tripwire must abort TCP connections");
  assert.match(control.stderr, /NETWORK_ATTEMPT/);
});
