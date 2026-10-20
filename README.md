# WebStor — Secure Tech Marketplace

A hardened, dark-themed e-commerce web application built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **PostgreSQL + Drizzle ORM** and **Zod**.

> Deep-black glassmorphism UI · red primary / green success accents · security-first backend.

---

## Features

- **Home** — hero, trusted-security badges, featured products, category grid
- **Products** — grid listing with full-text search, category filtering and sorting (newest / price ↑↓ / rating)
- **Product detail** — large art tile, description, dynamic stock status, quantity selector, add-to-cart
- **Cart** — add / remove / update quantities with live totals and free-shipping logic
- **Checkout** — validated shipping form, transactional order creation, order confirmation page

## Tech Stack

| Layer      | Choice                                        |
| ---------- | --------------------------------------------- |
| Framework  | Next.js 16 (App Router, Route Handlers, RSC)  |
| UI         | React 19 + Tailwind CSS v4 (custom dark theme) |
| Database   | PostgreSQL via Drizzle ORM — embedded PGlite for local dev, node-postgres for external DBs |
| Validation | Zod (shared client + server schemas)           |
| Fonts      | Geist, self-hosted (zero external requests)    |

## Security Architecture

| Threat | Mitigation |
| --- | --- |
| **SQL injection** | 100% Drizzle ORM query builder — every query is parameterized; no raw SQL string concatenation anywhere. LIKE wildcards in search input are escaped. |
| **XSS** | React auto-escaping everywhere; no `dangerouslySetInnerHTML`; strict CSP (`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`). |
| **CSRF** | Cart cookie is `SameSite=Lax`; additionally every state-changing Route Handler verifies the `Origin` header against the served host. |
| **Session forgery** | Cart id is a random UUID, HMAC-SHA256-signed with `SESSION_SECRET`; signatures compared in constant time. Cookies are `HttpOnly`, `Secure` (production) and `SameSite=Lax`. |
| **IDOR** | Every cart mutation is scoped to the cart id from the verified session cookie — line-item ids from the URL are always ANDed with the session cart. |
| **Input abuse** | All bodies and URL params pass Zod schemas (bounded lengths, ranges, formats, control-character rejection) before touching the database. |
| **Price manipulation** | Prices/totals are computed exclusively from the database inside the checkout transaction — client-supplied prices are never trusted. |
| **Overselling / races** | Checkout runs in a single transaction with `SELECT … FOR UPDATE` and a `stock >= qty` guarded decrement. |
| **Info leakage** | Uniform generic API errors; full details logged server-side only. `X-Powered-By` disabled. |
| **Enumeration** | Order numbers are unguessable (58+ bits from a CSPRNG). |
| **Abuse / flooding** | Per-client sliding-window rate limits on cart and checkout endpoints. |
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
the migrations in `./drizzle/` and seeds the demo catalog (6 categories,
27 products) automatically. Data persists in the `./.pglite/` folder —
delete that folder to reset the dev database to a fresh seeded state.

### 2. (Optional) Environment variables

```bash
cp .env.example .env   # see the file for details
```

- `SESSION_SECRET` — signs cart-session cookies. Optional in dev (a
  temporary one is auto-generated; carts reset on restart), **required in
  production**: `openssl rand -hex 32`.
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
| `npm run db:seed` | Force re-seed the catalog (auto-seeded on first boot) |
| `npm run lint` / `typecheck` | ESLint / strict TypeScript checks |

## Database Schema

```
categories 1─∞ products 1─∞ cart_items ∞─1 carts
                     │
                     └─∞ order_items ∞─1 orders
```

Order items snapshot the product name and unit price at purchase time, so order history is immutable even if the catalog changes.

---

**Disclaimer:** demo storefront — no real payments are processed.
