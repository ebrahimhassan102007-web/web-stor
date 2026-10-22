# E-Vora — Digital Goods & Gaming Store

A bilingual (EN/AR) digital-goods storefront built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **PostgreSQL + Drizzle ORM** and **Zod**. It includes E-Vora branding, game top-ups, gift cards, subscriptions and software keys, with a deliberately unpaid demo checkout until verified payments exist.

> Dark & light themes · full RTL/LTR support · email/password + six-digit OTP · Google OpenID Connect when configured · security-first backend.

---

## Features

- **Storefront** — E-Vora home, featured products, category grid, search, category filters, sorting and product details.
- **Cart** — add/remove/update quantities with live totals and per-line delivery inputs (Player ID for top-ups, region for gift cards).
- **Checkout** — development records an explicitly **unpaid demo order** only. Production returns 503 until a real payment provider can verify charges. Demo orders never decrement stock, clear the cart, or deliver generated codes.
- **Accounts** — email/password sign-up and sign-in, six-digit email verification, Google OpenID Connect, server-side sessions and a verified-email profile.
- **Localization and themes** — full English/Arabic UI and catalogue fallback, RTL layout with Cairo, dark/light themes, and cookie-persisted preferences.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS v4, Geist + self-hosted Cairo |
| Database | External PostgreSQL via node-postgres + Drizzle ORM |
| Validation | Zod (shared client/server schemas) |
| Authentication | scrypt password hashes, opaque server-side sessions, OTP HMACs, Google OIDC + PKCE |

## Security architecture

- Drizzle parameterized queries, bounded Zod input, escaped search wildcards and database-computed prices/totals.
- HMAC-signed cart cookies and random opaque account-session cookies; only session digests are stored. Production cookies are `HttpOnly`, `Secure` and `SameSite=Lax`.
- Origin checks on state-changing route handlers; production checks are pinned to `APP_ORIGIN` and fail closed when it is missing or malformed.
- Six-digit CSPRNG verification codes are HMAC-bound, expire after 10 minutes, permit at most five attempts, are single-use and have a persisted resend cooldown. Codes are never displayed or logged.
- Google OAuth uses one-time state, server-side nonce/state, PKCE, Google JWKS ID-token verification and same-origin return paths.
- Atomic cart upserts prevent lost increments and clamp to stock/per-line limits. Demo checkout does not consume inventory or claim payment.
- Public receipts expose only an unguessable order reference, not customer data, totals, line items or delivery codes.
- Security headers include `nosniff`, a restrictive `Permissions-Policy`, `Referrer-Policy` and a documented CSP. The current CSP still permits Next.js inline/eval scripts; it is not a nonce-based policy.
- The small in-memory cart/checkout limiter is best effort for one process. Multi-instance deployments need a shared atomic limiter; authentication also has persistent database buckets.

Money is stored as **integer cents** end-to-end — never floating-point currency math.

## Getting started (disposable local PostgreSQL)

The runtime has **no embedded database and no fallback**. A missing, malformed or non-PostgreSQL `DATABASE_URL` fails closed in development, Preview and production. Application startup validates configuration but **never runs migrations or seeds data**.

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create a genuinely disposable local PostgreSQL database (not Neon production), then configure it:

   ```bash
   cp .env.example .env
   # Edit DATABASE_URL, for example:
   # DATABASE_URL=postgresql://evora:evora@localhost:5432/evora_test
   ```

3. Apply the reviewed schema history explicitly, optionally add the additive demo catalogue, and start Next.js:

   ```bash
   npm run db:migrate
   npm run db:seed       # optional; safe to repeat, never rewrites existing rows
   npm run dev           # http://localhost:3000
   ```

   `db:seed` refuses `NODE_ENV=production` and requires `ALLOW_REMOTE_SEED=YES` for a non-loopback target. It does not run migrations.

4. Set independent secrets before deploying:

   - `SESSION_SECRET` — stable 32-byte+ cart-cookie HMAC key (`openssl rand -hex 32`). Required in production.
   - `AUTH_SECRET` — separate stable 32-byte+ key for OTP digests and auth rate-limit keys. Required in production; an ephemeral development key is used when omitted.
   - `APP_ORIGIN` — exact public origin (scheme + host, no path), required for production Origin checks and OAuth callback construction. A Preview deployment needs its own Preview origin.
   - `TRUST_PROXY_IP_HEADERS=true` — only when the hosting proxy strips client-supplied forwarding headers and writes its own trusted value.

## Database migration strategy

### Fresh disposable database

For a new empty PostgreSQL database, run:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/evora_test npm run db:migrate
```

The command executes `drizzle/0000_init.sql`, `0001_evora-digital.sql` and `0002_authentication.sql` in one transaction, records their exact SHA-256 hashes in `drizzle.__drizzle_migrations`, and verifies the final tables, columns, indexes and foreign keys before committing. Running it again is a no-op. It uses a transaction-scoped advisory lock to prevent concurrent deploy jobs from racing.

Use `npm run db:migrate -- --dry-run` to inspect the plan without creating the migration schema or changing application data.

### Existing storefront schema and catalogue

**Never run the initial migration blindly against an existing database.** The migration command first inspects the public schema and migration history. For a compatible previous `0000_init` storefront with no Drizzle history:

1. **Back up first**, and prove that the backup can be restored. For example, create a custom-format backup and restore it into a new disposable database using your PostgreSQL tooling:

   ```bash
   pg_dump --format=custom --file=evora-before-migration.dump "$DATABASE_URL"
   # Create a NEW empty disposable database, then restore into that database:
   pg_restore --no-owner --no-privileges \
     --dbname=postgresql://user:password@localhost:5432/evora_restore_test \
     evora-before-migration.dump
   ```

   Keep the backup and dump file outside the repository. Test the restore and record row counts/checksums before touching any real deployment.

2. Rehearse on that restored copy:

   ```bash
   DATABASE_URL=postgresql://user:password@localhost:5432/evora_restore_test \
     npm run db:migrate -- --dry-run
   DATABASE_URL=postgresql://user:password@localhost:5432/evora_restore_test \
     npm run db:migrate -- --adopt-existing
   ```

   `--adopt-existing` is an explicit confirmation, not an automatic repair switch. The runner requires the complete known storefront tables, columns, indexes and foreign keys. It records compatible `0000_init` as adopted **without replaying its `CREATE TABLE` statements**, then applies the additive digital and authentication migrations. A schema already shaped like all three migrations can similarly be adopted without duplicating objects.

3. Verify the preserved catalogue, orders and accounts, then run the command again to confirm idempotence. Unknown schemas, missing objects, partial migrations, incompatible column types, unexpected history and SQL-hash changes abort before any write. DDL and bookkeeping roll back together on failure. Existing catalogue rows are never deleted or rewritten by migration or seed.

The migration tests create both a fresh database and a legacy `0000_init` database with a customized catalogue row. They assert the row's name, stock and other values survive, authentication tables are added, and repeat runs are unchanged.

### Eventual production migration

Do not migrate production from a development machine or as an application boot side effect. Before an eventual production change, all of the following are required:

- a current backup plus a successfully tested restore and a documented rollback/recovery owner;
- a reviewed diff of the exact SQL and a successful fresh + restored-copy rehearsal;
- a maintenance/availability plan and confirmation that the target is correct;
- an explicit operator command with `--dry-run` reviewed first, then `--adopt-existing` only when untracked legacy history requires it;
- `ALLOW_REMOTE_MIGRATION=YES` for a remote target, and for `NODE_ENV=production`, both `ALLOW_PRODUCTION_MIGRATION=YES` and `CONFIRM_PRODUCTION_BACKUP=YES`.

No production migration is performed by this repository's checks. Do not point local tests, Preview setup or migration experiments at the live Neon database.

`drizzle-kit push` remains available only for intentionally disposable schema prototyping. It is **not** the supported upgrade mechanism and must not be used to establish production migration history.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js lifecycle; no schema changes |
| `npm run db:generate` | Generate a new SQL migration from the Drizzle schema |
| `npm run db:migrate` | Explicit transactional fresh install or guarded legacy upgrade |
| `npm run db:seed` | Add missing demo catalogue rows only; never migrates or deletes |
| `npm run db:push` | Drizzle Kit prototyping on an explicitly selected disposable database only |
| `npm run lint` / `typecheck` / `test` | ESLint, strict TypeScript and the complete test suite |

## Tests and CI

The Quality workflow starts an isolated PostgreSQL 16 service, runs `npm ci`, lint, typecheck and `npm run db:migrate`, then runs the complete suite against that database. The suite includes:

- real PostgreSQL fresh-install and legacy-schema adoption tests in separate disposable databases;
- schema compatibility, authentication tables, migration idempotence and data preservation;
- additive seeding, concurrent cart updates, stock bounds and unpaid demo checkout;
- configuration fail-closed, test-target network tripwires, authentication, localization-independent security and checkout policies;
- production build and `npm audit --omit=dev`.

Destructive integration tests require `TEST_DATABASE_URL` with a database name ending in `_test`; production is always refused and remote targets require `ALLOW_REMOTE_TEST_DATABASE=YES`. Without a configured PostgreSQL target, PostgreSQL-only tests report an explicit skip rather than connecting elsewhere. PGlite is used only by isolated unit tests, never by the application runtime.

## External authentication providers

Google and SMTP are **not live until configured and tested**:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must come from a Google OAuth 2.0 Web application. Register `${APP_ORIGIN}/api/auth/google/callback` as an authorized redirect URI for each deployment origin. Without both values, Google sign-in returns an unavailable response rather than a simulated success.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` must form a complete real SMTP configuration. Set `SMTP_SECURE=true` for implicit TLS (normally port 465); port 587 normally uses STARTTLS. Without complete SMTP configuration, verification-dependent email registration/sign-in reports delivery as unavailable and never exposes a code.

---

**Payment disclaimer:** this is a demo storefront. No real payments are processed, production checkout is disabled, and demo orders are explicitly unpaid.
