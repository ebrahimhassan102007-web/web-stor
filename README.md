# E-Vora — Digital Goods & Gaming Store

A bilingual (EN/AR) demo digital-goods storefront built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **PostgreSQL + Drizzle ORM** and **Zod**. The demo checkout does not process payments, send email, or expose delivery codes.

> Dark & light themes · full RTL/LTR support · instant code delivery · security-first backend.

---

## Features

- **Home** — hero, trusted-security badges, featured products, category grid
- **Products** — grid listing with full-text search, category filtering and sorting (newest / price ↑↓ / rating)
- **Product detail** — large art tile, description, dynamic stock status, quantity selector, add-to-cart
- **Cart** — add / remove / update quantities with live totals; per-line delivery inputs (Player ID for top-ups, region for gift cards)
- **Checkout** — lean email-based demo form and transactional order creation; the public confirmation shows the order reference only and does not expose customer details or delivery codes
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
| **XSS** | React auto-escaping; no `dangerouslySetInnerHTML`; CSP blocks objects and constrains base/form targets, but currently permits inline/eval scripts and is not a strict CSP. Validate a nonce-based policy before deployment. |
| **CSRF** | Cart cookie is `SameSite=Lax`; state-changing handlers verify `Origin` against configured `APP_ORIGIN` in production (required) or the direct Host during development. Forwarded-host values are not trusted. |
| **Session forgery** | Cart id is a random UUID, HMAC-SHA256-signed with `SESSION_SECRET`; signatures compared in constant time. Cookies are `HttpOnly`, `Secure` (production) and `SameSite=Lax`. |
| **IDOR** | Every cart mutation is scoped to the cart id from the verified session cookie — line-item ids from the URL are always ANDed with the session cart. |
| **Input abuse** | All bodies and URL params pass Zod schemas (bounded lengths, ranges, formats, control-character rejection) before touching the database. |
| **Price manipulation** | Prices/totals are computed exclusively from the database inside the checkout transaction — client-supplied prices are never trusted. |
| **Overselling / races** | Checkout runs in a single transaction with `SELECT … FOR UPDATE` and a `stock >= qty` guarded decrement. |
| **Info leakage** | Uniform generic API errors; full details logged server-side only. `X-Powered-By` disabled. Public order receipts show no customer data or delivery codes. |
| **Enumeration** | New order numbers use 12 uniformly sampled characters from a 30-character alphabet (~58.88 bits of entropy). They are identifiers, never authorization. |
| **Abuse / flooding** | Best-effort in-memory sliding-window limits on one process. Multi-instance production needs a shared atomic rate limiter. Client forwarding headers are ignored unless trusted-proxy configuration is explicitly enabled. |
| **Clickjacking / misc.** | `nosniff`, `Referrer-Policy`, restrictive `Permissions-Policy` headers on every response. |

Money is stored as **integer cents** end-to-end — no floating-point currency math.

### Production security prerequisites / known blockers

- Configure `APP_ORIGIN` to the exact public HTTPS origin. State-changing API
  calls fail closed in production when it is missing.
- The in-memory rate limiter is process-local and is not sufficient for
  multiple instances. Configure a shared atomic limiter (or trusted edge
  limiter); set `TRUST_PROXY_IP_HEADERS=true` only if the trusted proxy
  overwrites forwarding headers.
- The current CSP permits `unsafe-inline` and `unsafe-eval` scripts in
  production. A tested nonce-based policy remains future work. The app does
  not set HSTS because TLS termination and domain policy are deployment-specific;
  enforce HTTPS/HSTS at the selected trusted edge.
- No email provider or authenticated order-history mechanism exists. The
  public receipt intentionally omits personal data and delivery codes; this
  phase therefore does not provide customer access to the generated codes.
- Production database migrations/backups and operational monitoring must be
  reviewed for the selected database/hosting setup. Quality checks alone do
  not establish production readiness.

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
`./.pglite/` folder. Use the explicitly confirmed local reset command in
Scripts when a destructive reset is intentionally needed.

Existing non-empty catalog data is preserved on boot; automatic startup
seeding only fills a newly empty non-production database. No catalog or
associated carts/orders are automatically deleted. If embedded database
files are damaged, recovery is intended for disposable local development;
review and back up data before using any reset procedure.

### 2. (Optional) Environment variables

```bash
cp .env.example .env   # see the file for details
```

- `SESSION_SECRET` — signs cart-session cookies. Optional in dev (a
  temporary one is auto-generated; carts reset on restart), **required in
  production**: `openssl rand -hex 32`.
- `DATABASE_URL` — point the app at an external PostgreSQL (Neon,
  Supabase, ...) instead of the embedded one. Only **remote** hosts are
  honoured; a localhost URL falls back to embedded PGlite in development.
  Production requires a non-local PostgreSQL `DATABASE_URL`; PGlite is refused.
  Migrations run on boot; production startup does not auto-seed demo products.
- `APP_ORIGIN` — exact public origin, e.g. `https://store.example.com`;
  required for production state-changing requests and CSRF validation.
- `TRUST_PROXY_IP_HEADERS=true` — optional; enable only when a trusted
  reverse proxy overwrites `X-Forwarded-For` before forwarding requests.
  Otherwise rate limiting deliberately ignores it.

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
| `npm run db:seed` | Add missing demo categories/products to local PGlite without updating or deleting existing records; refuses production and external databases |
| `NODE_ENV=development RESET_LOCAL_CATALOG=YES npm run db:reset:dev` | Explicit destructive reset of local embedded catalog and dependent demo orders/carts; requires the confirmation flag |
| `npm run lint` / `typecheck` / `test` | ESLint / strict TypeScript / Node test suite |

## Database Schema

```
categories 1─∞ products 1─∞ cart_items ∞─1 carts
                     │
                     └─∞ order_items ∞─1 orders
```

Order items snapshot the product name and unit price at purchase time, so order history is immutable even if the catalog changes.

---

**Disclaimer:** demo storefront — no real payments are processed.
