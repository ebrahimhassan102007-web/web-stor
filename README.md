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
npm run db:seed     # seed categories + products
```

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
| `npm run db:seed` | Seed demo catalog data |
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
