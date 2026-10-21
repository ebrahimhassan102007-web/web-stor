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
| Database   | PostgreSQL via Drizzle ORM (node-postgres)     |
| Validation | Zod (shared client + server schemas)           |
| Fonts      | Geist, self-hosted (zero external requests)    |

## Security Architecture

| Threat | Mitigation |
| --- | --- |
| **SQL injection** | 100% Drizzle ORM query builder — every query is parameterized; no raw SQL string concatenation anywhere. LIKE wildcards in search input are escaped. |
| **XSS** | React auto-escaping everywhere; no `dangerouslySetInnerHTML`; CSP blocks objects and constrains base/form targets, but currently permits inline/eval scripts and is therefore not a strict CSP. |
| **CSRF** | Cart cookie is `SameSite=Lax`; additionally every state-changing Route Handler verifies the `Origin` header against `APP_ORIGIN` (required in production) or the direct request `Host` in development. `X-Forwarded-Host` is never trusted. |
| **Session forgery** | Cart id is a random UUID, HMAC-SHA256-signed with `SESSION_SECRET`; signatures compared in constant time. Cookies are `HttpOnly`, `Secure` (production) and `SameSite=Lax`. |
| **IDOR** | Every cart mutation is scoped to the cart id from the verified session cookie — line-item ids from the URL are always ANDed with the session cart. |
| **Input abuse** | All bodies and URL params pass Zod schemas (bounded lengths, ranges, formats, control-character rejection) before touching the database. |
| **Price manipulation** | Prices/totals are computed exclusively from the database inside the checkout transaction — client-supplied prices are never trusted. |
| **Overselling / races** | Checkout runs in a single transaction with `SELECT … FOR UPDATE` and a `stock >= qty` guarded decrement. Cart additions use a product-row lock plus a single atomic `INSERT … ON CONFLICT DO UPDATE` whose `LEAST(...)` expression increments the stored quantity, so concurrent adds cannot lose an increment. |
| **Info leakage** | Uniform generic API errors; full details logged server-side only. `X-Powered-By` disabled. The anonymous order confirmation shows the order reference only — never customer details, addresses, items or totals. |
| **Enumeration** | Order references are `WS-` + 12 characters uniformly sampled from a 30-character alphabet (≈ 58.88 bits, no modulo bias). They are identifiers, never authorisation. |
| **Abuse / flooding** | Best-effort in-memory sliding-window rate limits on cart and checkout endpoints. See the limitation below. |
| **Clickjacking / misc.** | `nosniff`, `Referrer-Policy`, restrictive `Permissions-Policy` headers on every response. |

Money is stored as **integer cents** end-to-end — no floating-point currency math.

### Production prerequisites / known blockers

- **`DATABASE_URL` is mandatory.** There is no embedded or fallback database:
  startup fails closed when it is missing, unparseable or not a PostgreSQL
  URL. The only database engine is PostgreSQL; nothing is created locally by
  the application.
- Configure **`APP_ORIGIN`** to the exact public HTTPS origin. In production,
  state-changing API calls fail closed while it is missing or malformed.
- **Rate limiting is process-local.** The in-memory limiter is best-effort for
  a single instance only and is not adequate for multi-instance production
  deployments; use a shared atomic limiter (Redis/database) or an edge/WAF
  rate limiter. Forwarded IP headers are ignored unless
  `TRUST_PROXY_IP_HEADERS=true` is set for a proxy that overwrites them;
  otherwise all clients share one conservative bucket.
- The current CSP permits `unsafe-inline` and `unsafe-eval` scripts; a tested
  nonce-based policy remains future work. HSTS is deployment-specific and must
  be enforced at the TLS edge.
- **Demo checkout only:** no payment is processed and no email is sent. The
  public confirmation page deliberately exposes no personal data, and there is
  no authenticated order-history mechanism in this phase.

## Getting Started

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# set DATABASE_URL and a strong SESSION_SECRET (openssl rand -hex 32)
```

### 3. Database

Use any PostgreSQL 14+ instance, **or** run the bundled zero-install dev server (real PostgreSQL binaries shipped via npm):

```bash
npm run db:server   # starts local PostgreSQL on :5432 (keep running)
npm run db:push     # apply the Drizzle schema
npm run db:seed     # add missing demo categories + products
```

`db:seed` is **additive and non-destructive**: it inserts only missing rows, is
safe to re-run, and refuses to run with `NODE_ENV=production`. There are no
automatic migrations: `db:push` is the documented schema workflow, and it is
never run automatically by the application at startup.

### 4. Run

```bash
npm run dev         # http://localhost:3000
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js lifecycle |
| `npm run db:server` | Local dev PostgreSQL (embedded binaries) |
| `npm run db:push` | Push Drizzle schema to the database |
| `npm run db:seed` | Add missing demo catalog rows (additive, non-production only) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Node test suite (unit tests + PostgreSQL integration tests) |

### Tests

`npm test` runs the unit tests always. Integration tests that exercise the
real PostgreSQL schema (additive seeding, concurrent cart additions, cart-line
atomicity) run against `TEST_DATABASE_URL` and are skipped with a notice when
it is not set. Point it at a disposable database whose name contains `test`:

```bash
npm run db:server
DATABASE_URL=postgres://webstor:webstor_dev_password@localhost:5432/webstor_test npm run db:push
TEST_DATABASE_URL=postgres://webstor:webstor_dev_password@localhost:5432/webstor_test npm test
```

Never point the test suite at production data.

## Database Schema

```
categories 1─∞ products 1─∞ cart_items ∞─1 carts
                     │
                     └─∞ order_items ∞─1 orders
```

Order items snapshot the product name and unit price at purchase time, so order history is immutable even if the catalog changes.

---

**Disclaimer:** demo storefront — no real payments are processed and no email is sent.
