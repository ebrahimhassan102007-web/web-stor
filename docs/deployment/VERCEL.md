# Vercel deployment runbook (E-Vora / web-stor)

This document explains how the project is expected to build and run on Vercel, what
the repository guarantees, and how to diagnose a failed deployment **without**
touching application code.

It exists because of a real incident: several *Preview* deployments failed one to
three seconds after they started, while every *Production* deployment of the very
same commit tree succeeded. Section 4 records the evidence and the conclusion.

---

## 1. What the repository guarantees

| Guarantee | How it is enforced | Regression test |
| --- | --- | --- |
| `next build` never needs a runtime secret | strict env validation is deferred to server start (`assertValidEnv` is a no-op under `NEXT_PHASE=phase-production-build`) | `tests/vercel-deployment.test.ts` |
| The runtime still fails closed | `assertValidEnv()` runs on every server start and still throws on any missing/short secret | `tests/vercel-deployment.test.ts`, `tests/hardening.test.ts` |
| The build always has its tooling | `vercel.json` pins `installCommand` to `npm ci --include=dev` (Tailwind, PostCSS and TypeScript live in `devDependencies`) | `tests/vercel-deployment.test.ts` |
| A deterministic Node runtime | `package.json` → `"engines": { "node": "22.x" }`, the same major CI uses | `tests/vercel-deployment.test.ts` |
| No database work at build time | every data route is dynamic (`ƒ`); `sitemap.ts`, `robots.ts`, `manifest.ts` and `icon.svg` import no DB/catalogue module | `tests/vercel-deployment.test.ts` |
| Schema changes are a separate, idempotent step | `npm run db:migrate` (`tsx scripts/migrate.ts`) applies `drizzle/0000…0010` and is safe to re-run | `tests/migration-runner.test.ts`, `tests/postgres-migration-compatibility.test.ts` |

### Build lifecycle on Vercel

```
git push ──► clone ──► npm ci --include=dev ──► npm run build (next build) ──► upload
                       installCommand            buildCommand                  artefacts
```

A healthy build takes **20–35 s** once the dependency cache is warm, and ~40–90 s
cold. Anything that reports a result in **1–3 s** never reached `next build`.

---

## 2. Environment variables (names only — never commit values)

Set these in **Project → Settings → Environment Variables** and tick **both**
`Production` and `Preview` (and `Development` if you use `vercel dev`). A variable
that exists only for Production makes Previews render fail-closed 500s, and hides
configuration mistakes until release day.

**Core**

- `DATABASE_URL`
- `APP_ORIGIN`
- `SESSION_SECRET` (≥ 32 chars)
- `AUTH_SECRET` (≥ 32 chars)

**Wallet / webhooks**

- `WALLET_TOPUP_WEBHOOK_SECRET` (≥ 32 chars)

**Two-factor (TOTP)**

- `TOTP_ENCRYPTION_KEY` (32 bytes: 64 hex chars or 43 base64url chars)
- `TOTP_ENCRYPTION_KEY_ID`

**Fulfilment vault**

- `FULFILLMENT_ENCRYPTION_KEY` (32 bytes, same encoding rules)
- `FULFILLMENT_ENCRYPTION_KEY_ID`

**Digital-goods vault v2 (split key)**

- `VAULT_MASTER_KEY` (32 bytes, mandatory)
- `VAULT_MASTER_KEY_ID`
- `VAULT_KEY_PEPPER` (optional second share, 32 bytes)

**Providers (only when the feature is enabled — configure all of a group or none)**

- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Email/SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- Redis/rate-limit (optional): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

Rules enforced at runtime:

- keys must be given **as a pair** with their `*_KEY_ID`;
- keys must decode to exactly 32 bytes;
- `APP_ORIGIN` must be an origin (no path) and `https:` in production;
- `CHECKOUT_MODE=demo` is refused in production.

Generate a key locally without printing it into shell history twice:

```bash
node -e 'const c=require("crypto");console.log(c.randomBytes(32).toString("hex"))'
```

---

## 3. Database migrations (never from a build)

Migrations are **not** run by `next build` or by server start — by design, so a
Preview deployment can never mutate the production schema.

```bash
# from a trusted shell / CI job with DATABASE_URL pointing at the target database
npm run db:migrate      # idempotent: 0000 … 0010, already-applied files are skipped
npm run db:seed         # optional, only when you intentionally want sample data
```

Order of a release:

1. Run `npm run db:migrate` against the target database.
2. Merge to `main` (this triggers the Production deployment).
3. Smoke-check `/`, `/products`, `/login`, and one authenticated `/account` page.

`drizzle/meta/_journal.json` is the source of truth for applied order; the migration
runner records each applied file and refuses to re-apply it, so re-running the
command is always safe.

---

## 4. Incident record — “Deployment has failed” with no log line

### Observed (GitHub commit statuses, project `web-stor`)

| Commit | Type | Vercel | Duration |
| --- | --- | --- | --- |
| `1161e65` | merge → `main` (Production) | success | 39 s |
| `01579bc` | merge → `main` (Production) | success | 35 s |
| `8555d4b` | branch (Preview) | success | 21 s |
| `c25a9db` | branch (Preview) | success | 34 s |
| `b2859d0` | branch (Preview) | **failure** | **1 s** |
| `08f8394` | branch (Preview) | **failure** | **1 s** |
| `9b79b46` | branch (Preview) | **failure** | **1 s** |

Every failure in the last 40 commits resolved in **1–3 s**; every success took
**20–35 s**. Failures are *not* correlated with the commit author (a commit by the
automation identity succeeded; commits by the repository owner's own address both
succeeded and failed).

### Reproduction (local, faithful to Vercel)

```bash
git archive HEAD | tar -x -C /tmp/vercel-sim
cd /tmp/vercel-sim
env -i PATH="$PATH" HOME="$HOME" npm ci --include=dev
env -i PATH="$PATH" HOME="$HOME" \
  NODE_ENV=production VERCEL=1 VERCEL_ENV=preview CI=1 \
  npm run build        # → exit 0, full route table, 18 s, zero secrets in env
```

The build succeeds with **no** `DATABASE_URL`, `SESSION_SECRET`, `AUTH_SECRET`,
`*_ENCRYPTION_KEY` or `VAULT_*` value present, so neither `NEXT_PHASE` handling,
peer dependencies, the Node version nor the build command can be the cause.

### Conclusion

The repository is not the cause. A 1–3 s failure is returned *before* the build
container executes `npm run build`, so the fault is in Vercel-side state that is
evaluated per deployment, not in the code. The realistic candidates, in the order
worth checking:

1. an integration (database/storage/Redis) whose **preview-environment provisioning**
   fails — the deployment is rejected while its resources are being created;
2. a **usage/quota** or **team/permission** limit reached on the plan;
3. a project **“Ignored Build Step”** that exits non-zero;
4. a project-level **Install Command** override such as `npm ci --omit=dev` — with
   Tailwind/PostCSS/TypeScript being `devDependencies`, that fails in ~2.5 s at the
   first CSS import (this is exactly the failure mode `vercel.json` now prevents).

### Dashboard checklist (in this order)

1. **Project → Deployments** → open the failed deployment → **Building** tab.
   - *No log at all / “Queued” then failed* → step 2.
   - *A log ending at install or at “Build error occurred”* → the log names the cause;
     fix that, not the code.
2. **Project → Settings → Integrations** (and **Storage**): confirm every attached
   resource shows “Connected”. Reconnect/de-provision the integration if it shows an
   error — a Resource Provisioning failure is reported as a failed deployment.
3. **Project → Settings → General → Build & Development Settings**: verify
   Framework Preset = Next.js, Root Directory = repository root, and that
   *Install Command* / *Build Command* are **not** overridden (the repository now
   provides both). Check *Ignored Build Step* is empty.
4. **Project → Settings → Environment Variables**: every name in section 2 exists and
   is scoped to **Preview** as well as Production. Re-“Save” one variable to force a
   fresh environment for the Preview target.
5. **Team → Settings → Usage**: check build minutes / deployment quota; an exhausted
   quota rejects new deployments immediately.
6. **Deployments → (failed) → ⋯ → Redeploy** with *Clear build cache* enabled.
7. If a Preview still fails in ~1 s, run the CLI with a project token to read the
   real message:
   `npx vercel inspect dpl_<id> --logs` (this is the command Vercel prints in the
   failing commit status).

## 5. Live status — is the deployed site actually reachable?

Recorded 2026-11-25 from outside the Vercel account.

| URL | Result |
| --- | --- |
| `https://web-stor-ebrahim24.vercel.app` (production alias of project `ebrahim24/web-stor`) | **HTTP 200 "Protected Deployment – Vercel" login wall** |
| `https://web-stor-git-main-ebrahim24.vercel.app` (branch alias for `main`) | same login wall |
| `https://web-stor-ebrahim24.vercel.app/robots.txt` (static asset) | same login wall |
| `https://web-stor.vercel.app` | **a different project** ("islam store", fakestoreapi catalogue) — not this repository |

A green deployment status means the build and upload succeeded; it does **not** mean
the store is public. Every path, static assets included, is answered by Vercel's
authentication screen, so **Deployment Protection → Vercel Authentication is enabled
for the production target**.

### Turning the wall off

1. **Project → Settings → Deployment Protection**.
2. Under **Vercel Authentication**, choose **Standard Protection** (protects Preview
   deployments only) — or **Disabled** if previews should be public too.
3. **Save**, then **Deployments → latest → Redeploy** (or purge the alias).
4. Verify from a logged-out browser / plain curl:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' https://web-stor-ebrahim24.vercel.app/      # expect 200
   curl -sS https://web-stor-ebrahim24.vercel.app/ | grep -c 'E-Vora'                     # expect >= 1
   curl -sS -o /dev/null -w '%{http_code}\n' https://web-stor-ebrahim24.vercel.app/admin # expect 404
   ```

5. If `/` answers **500** while `/robots.txt` answers 200, the deployment is correct
   and the *runtime environment* is incomplete — go back to section 2 (a missing
   `DATABASE_URL`/secret fails closed by design) and check
   **Deployments → Functions → Logs** for `Invalid environment configuration`.

### What was hardened in the repository anyway

- `assertValidEnv()` no longer runs during the build phase (defence in depth: a future
  statically prerendered page can never crash a build over a runtime-only secret).
  Runtime validation is unchanged and still fails closed.
- `vercel.json` pins `npm ci --include=dev` and `npm run build`, so a project-level
  override or a stray `NPM_CONFIG_PRODUCTION=true` cannot strip the build tooling.
- `engines.node = "22.x"` pins the build image to the same Node major as CI.
- `tests/vercel-deployment.test.ts` locks all of the above.
