# VULN-122 — Bound SQL parameters and account data written to application logs

**Status:** FIXED (2026-11-25, branch `arena/ac3a149c-web-stor`)

| Field | Detail |
| --- | --- |
| **Vulnerability** | Sensitive information exposure through log files (CWE-532) |
| **Location** | `src/lib/http.ts` → `handleUnexpected()` (pre-fix: `console.error("[api:" + context + "]", err)`) |
| **Severity** | Low |
| **Why it is vulnerable** | Every API route funnels unexpected failures through `handleUnexpected`, which logged the raw thrown value. Drizzle wraps driver errors in `DrizzleQueryError`, which carries the rendered statement **and** its `params` array, and PostgreSQL `unique_violation` messages embed the offending key — e.g. `Key (email)=(…) already exists`. Customer emails, cart UUIDs and order references were therefore persisted to whatever collects stdout. |
| **Attack scenario** | No direct attacker action is required: any failing write (duplicate registration, a checkout race, a constraint violation) writes personal data into log storage, where it outlives the request, is replicated to the log provider and is visible to anyone with log-read access. An attacker who can trigger failures (e.g. by racing registrations) can also choose which values get logged. |
| **Fix applied** | New dependency-free `src/lib/log-safety.ts` (`safeErrorForLog`) reduces any thrown value to `{ name, code? }`, dropping messages, `query`, `params`, `detail` and stack. `handleUnexpected` logs only that fingerprint and still returns the same generic 500 body with `private, no-store`. |
| **Files changed** | `src/lib/log-safety.ts` (new), `src/lib/http.ts`, `tests/security-regression.test.ts`, `tests/support/log-safety-probe.ts` (new) |
| **Regression risk** | Low. The client-facing contract is unchanged (status 500, generic message, `Vary: Cookie`, `no-store`). Operators lose free-text error messages in API logs; the error class name plus driver code (`23505`, `ECONNREFUSED`, …) remains sufficient to triage and correlate with database logs. |
| **Verification performed** | Unit test feeds a `DrizzleQueryError`-shaped object containing an email, SQL text and a `scrypt$…` hash: the fingerprint is exactly `{ name: "DrizzleQueryError", code: "23505" }` and none of those strings survive serialization. A child-process probe runs the real handler (stubbed `server-only`, no-network tripwire) and asserts the captured `console.error` arguments are exactly `["[api:sec-04]", { name: "DrizzleQueryError", code: "23505" }]` while the HTTP body stays generic. |
