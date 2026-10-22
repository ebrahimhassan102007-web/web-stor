# E-Vora — Digital Goods & Gaming Store

A hardened, bilingual (EN/AR) digital-goods storefront built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **PostgreSQL + Drizzle ORM** and **Zod**. Game top-ups, gift cards, subscriptions and software keys — delivered instantly on-screen after checkout.

> Dark & light themes · full RTL/LTR support · instant code delivery · security-first backend.

---

## Features

- **Home** — hero, trusted-security badges, featured products, category grid
- **Products** — grid listing with full-text search, category filtering and sorting (newest / price ↑↓ / rating)
- **Product detail** — large art tile, description, dynamic stock status, quantity selector, add-to-cart
- **Cart** — add / remove / update quantities with live totals; per-line delivery inputs (Player ID for top-ups, region for gift cards)
- **Checkout** — localized demo checkout. Development records an explicitly unpaid order only; production returns 503 until a real payment provider can verify charges. Demo orders never reserve stock or deliver generated codes, and the public receipt shows only its reference.
- **Accounts** — email/password sign-up and sign-in, six-digit email verification, Google OpenID Connect, server-side sessions, and a verified-email profile
- **EN / عربي** — full bilingual UI (catalog included) with RTL layout and the Cairo font, plus a dark/light theme toggle — both persisted in cookies

## Tech Stack

| Layer      | Choice                                        |
| ---------- | --------------------------------------------- |
| Framework  | Next.js 16 (App Router, Route Handlers, RSC)  |
| UI         | React 19 + Tailwind CSS v4 (dark & light themes, RTL-ready) |
| Database   | PostgreSQL via Drizzle ORM — embedded PGlite for local dev, node-postgres for external DBs |
| Validation | Zod (shared client + server schemas)           |
| Fonts      | Geist (Latin) + Cairo (Arabic), self-hosted (zero external requests) |

## Security Architecture

| Threat | Mitigation |
| --- | --- |
| **SQL injection** | 100% Drizzle ORM query builder — every query is parameterized; no raw SQL string concatenation anywhere. LIKE wildcards in search input are escaped. |
| **XSS** | React auto-escaping everywhere; no `dangerouslySetInnerHTML`; CSP blocks objects and restricts base/form targets, but currently permits inline/eval scripts for Next.js and is not a strict nonce-based policy. |
| **CSRF** | Session cookies are `SameSite=Lax`; state-changing Route Handlers validate `Origin`. Production origin checks are pinned to `APP_ORIGIN` and fail closed when it is missing. |
| **Session forgery** | Cart id is a random UUID, HMAC-SHA256-signed with `SESSION_SECRET`; account sessions use random 256-bit opaque cookies whose SHA-256 digests alone are stored server-side. Cookies are `HttpOnly`, `Secure` (production) and `SameSite=Lax`. |
| **Password theft** | Email passwords are hashed with scrypt and unique random salts; the application never stores plaintext passwords. |
| **Verification-code guessing/replay** | Six-digit CSPRNG codes are HMACed with `AUTH_SECRET`, expire after 10 minutes, permit at most five attempts, are single-use, and are subject to a persisted 60-second resend cooldown. |
| **OAuth request forgery** | Google OpenID Connect uses a one-time state cookie, server-side state/nonce, PKCE, Google JWKS ID-token verification, and a same-origin post-login destination. |
| **Authentication flooding** | Persistent atomic database rate-limit buckets are keyed by HMACed email values and, when trusted proxy IP headers are configured, IP values; verification attempts and resend cooldowns are also enforced in the database. |
| **IDOR** | Every cart mutation is scoped to the cart id from the verified session cookie — line-item ids from the URL are always ANDed with the session cart. |
| **Input abuse** | All bodies and URL params pass Zod schemas (bounded lengths, ranges, formats, control-character rejection) before touching the database. |
| **Price manipulation** | Prices/totals are computed exclusively from the database inside the checkout transaction — client-supplied prices are never trusted. |
| **Overselling / races** | Cart additions lock the product row and use one atomic `INSERT … ON CONFLICT DO UPDATE` with a stock/quantity clamp. Demo checkout does not decrement stock; production checkout is disabled until a real payment can be verified. |
| **Info leakage** | Generic API errors; unexpected details stay server-side. Public order receipts check existence only and show the reference, not customer data, line items, codes or totals. `X-Powered-By` disabled. |
| **Enumeration** | Order numbers are unguessable (58+ bits from a CSPRNG). |
| **Abuse / flooding** | Sliding-window rate limits on cart and checkout endpoints use the trusted client IP when proxy headers are configured, otherwise a conservative shared fallback bucket is used. |
| **Clickjacking / misc.** | `nosniff`, `Referrer-Policy`, restrictive `Permissions-Policy` headers on every response. |

Money is stored as **integer cents** end-to-end — no floating-point currency math.

## Getting Started

### 1. Install & run — that's it

```bash
npm install
npm run dev         # http://localhost:3000
```

There is **no database to install and nothing to configure** for local
development. On first boot the app creates an embedded PostgreSQL database
([PGlite](https://pglite.dev), running in-process via WebAssembly), applies
the migrations in `./drizzle/` and seeds the E-Vora digital catalog
(4 categories, 18 products) automatically. Data persists in the
`./.pglite/` folder — delete that folder to reset the dev database to a
fresh seeded state.

If an older physical-goods catalog is present, startup adds missing E-Vora
digital catalog rows without deleting or rewriting existing categories,
products, carts, or orders. Review the additive migrations in `./drizzle/`
before applying them to a production database. If embedded database files are
ever damaged, the broken folder is preserved as `.pglite.broken-<timestamp>/`
before a fresh local development database is created.

### 2. (Optional) Environment variables

```bash
cp .env.example .env   # see the file for details
```

- `SESSION_SECRET` — signs cart-session cookies. Optional in dev (a
  temporary one is auto-generated; carts reset on restart), **required in
  production**: `openssl rand -hex 32`.
- `AUTH_SECRET` — separate, stable 32-byte+ key for email-code HMACs and
  authentication rate-limit buckets. Required in production; generate with
  `openssl rand -hex 32`. A temporary development-only key is used when
  omitted, so pending email codes will not survive a dev-server restart.
- `APP_ORIGIN` — the exact public origin (scheme + host, no path), such as
  `https://shop.example.com`. Required in production for fail-closed Origin
  checks and Google OAuth callback construction. For a Preview deployment,
  set its own preview origin in that environment.
- `TRUST_PROXY_IP_HEADERS=true` — only when the hosting reverse proxy strips
  client-supplied `X-Forwarded-For` and overwrites it with a trusted IP. This
  enables per-client rate limits; auth also applies persistent per-email
  limits. Do not enable this behind a proxy that passes user-provided values
  through unchanged.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — Google OAuth web-client
  credentials. Add `${APP_ORIGIN}/api/auth/google/callback` as an authorized
  redirect URI in Google Cloud Console. The app uses the official Google
  OpenID Connect authorization-code flow with PKCE; without these values,
  Google sign-in is unavailable rather than simulated.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` —
  configure a real SMTP delivery account for verification emails. Set
  `SMTP_SECURE=true` when the provider requires implicit TLS (port 465 uses it
  by default); port 587 uses STARTTLS. Without a complete SMTP configuration,
  email registration/sign-in that needs verification fails clearly and no
  verification code is exposed or logged.
- `DATABASE_URL` — point the app at an external PostgreSQL (Neon,
  Supabase, ...) instead of the embedded one. Only **remote** hosts are
  honoured; a localhost URL falls back to the embedded database.
  Migrations and the initial seed are applied automatically on boot here
  too.

### 3. Changing the schema

Edit `src/lib/db/schema.ts`, then:

```bash
npm run db:generate   # writes a new migration into ./drizzle
npm run dev           # the migration is applied automatically on boot
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js lifecycle |
| `npm run db:generate` | Generate a SQL migration from the schema |
| `npm run db:push` | Push the schema directly (embedded DB, or DATABASE_URL) |
| `npm run db:seed` | Add missing demo-catalog rows only; refuses production and requires explicit opt-in for remote non-production databases |
| `npm run lint` / `typecheck` / `test` | ESLint / strict TypeScript / security, migration and database tests |

The `0002_authentication` migration is strictly additive: it creates only the
customer-account, session, verification, OAuth-state, and rate-limit tables and
indexes. It does not alter or delete the existing catalog, carts, or orders.
As with all production migrations, back up the database and review generated
SQL before deployment; the runtime applies migrations on boot. To seed a
remote **non-production** database intentionally, use
`ALLOW_REMOTE_SEED=YES npm run db:seed`; the script refuses all production
runs and does not delete existing rows.

### PostgreSQL integration tests

The Quality workflow starts an isolated PostgreSQL 16 service, applies the
current Drizzle schema to that clean database, and runs the complete test suite
against it. The integration suite verifies the six storefront tables plus the
authentication tables (including `users`), additive seeding, concurrent cart
updates, stock bounds, and unpaid demo checkout. Its target guard validates
`TEST_DATABASE_URL` before creating a pool: production is always refused, the
database name must end in `_test`, and remote targets are refused unless the
explicit `ALLOW_REMOTE_TEST_DATABASE=YES` opt-in is supplied. The suite
truncates only its disposable catalog/cart/order fixtures. Never use a
production or shared database for these tests.

## Database Schema

```
categories 1─∞ products 1─∞ cart_items ∞─1 carts
                     │
                     └─∞ order_items ∞─1 orders
```

Order items snapshot the product name and unit price at purchase time, so order history is immutable even if the catalog changes.

---

**Disclaimer:** demo storefront — no real payments are processed.
