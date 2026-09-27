# خدمتك ستور | Khodmtak Store

**خدماتك الرقمية في مكان واحد — Your Digital Services, All in One Place**

A production-grade, Arabic-first (RTL) digital services marketplace: digital
subscriptions, game top-ups, mobile recharges, digital gift-card codes, and
digital services — built with a security-first backend and a dark premium
glassmorphism UI (near-black `#050505`, red accent, green success).

> ⚠️ Only legitimate, authorized digital products are supported. The store is
> not designed for, and must not be used for, reselling unauthorized or
> stolen accounts/codes.

## Stack

| Layer      | Technology                                                |
| ---------- | --------------------------------------------------------- |
| Framework  | Next.js 16 (App Router) · React 19 · TypeScript (strict)  |
| Styling    | Tailwind CSS v4 · Cairo variable font (Arabic-first, RTL) |
| Database   | PostgreSQL · Drizzle ORM (parameterized only) · migrations |
| Validation | Zod on every API input                                     |
| Auth       | scrypt password hashing · DB-backed sessions (hashed tokens) · RBAC (customer / admin) |
| Tests      | Vitest — unit + live security/concurrency integration      |

## Features

- **DB-driven categories** (اشتراكات رقمية، شحن ألعاب، شحن رصيد، بطاقات رقمية، خدمات رقمية) with admin CRUD, reorder and visibility.
- **5 product types** — `DIGITAL_CODE`, `SUBSCRIPTION`, `GAME_TOPUP`, `MOBILE_RECHARGE`, `DIGITAL_SERVICE` — with Arabic + English names, discount pricing, featured flags, and **dynamic required customer fields** (PUBG player ID, Egyptian recharge phone, account email) validated server-side per type.
- **Encrypted digital-code inventory** (AES-256-GCM at rest, dedicated key): `AVAILABLE → RESERVED → SOLD` lifecycle, `SELECT … FOR UPDATE SKIP LOCKED` reservation, a DB constraint binding every `SOLD` code to exactly one order item — a code can never be delivered twice, and code values are never logged or exposed in listings.
- **Verified-payment-then-fulfillment pipeline**: client `paymentStatus` is never trusted; HMAC-signed payment callbacks; `payment_events` uniqueness makes webhooks idempotent; state machine `PENDING_PAYMENT → PAID → PROCESSING → FULFILLED / FAILED / CANCELLED / REFUNDED` with guarded transitions.
- **Provider abstractions** (`PaymentProvider`, `GameTopupProvider`, `RechargeProvider`, notifications) with clearly-isolated **mock/dev implementations that refuse to run in production** unless explicitly opted in — no fake production claims.
- **Customer dashboard**: orders + deliveries with strict ownership checks (IDOR-safe), codes decrypted server-side only for the verified owner.
- **Admin dashboard**: stats, product/category/order management, bulk encrypted code upload, and an append-only **audit log** of every admin action.
- **Idempotent checkout** (client-generated idempotency key), server-computed prices/totals, transactional stock decrement.
- Rate limiting, same-origin verification on mutations, strict security headers (CSP, HSTS in production), structured JSON logging that never includes secrets or code values.

## Getting started

```bash
npm install
cp .env.example .env        # fill DATABASE_URL, SESSION_SECRET, INVENTORY_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD

npm run db:migrate          # apply SQL migrations (drizzle/)
npm run db:seed             # idempotent Arabic catalog + admin bootstrap
npm run dev                 # http://localhost:3000
```

In non-production, the seed also loads `DEV-TEST-*` sample codes so the full
checkout → payment → delivery flow works end to end with the mock payment
simulator at `/pay/mock`.

### Scripts

| Command              | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Development server                         |
| `npm run build`      | Production build                           |
| `npm run db:migrate` | Apply Drizzle SQL migrations               |
| `npm run db:seed`    | Idempotent seed (requires admin env vars)  |
| `npm test`           | Vitest — unit + security integration suite |
| `npm run lint`       | ESLint                                     |

The integration tests in `tests/security-integration.test.ts` run against a
**live server** (start the app first); they are skipped automatically when the
server is unreachable. They cover the concurrent one-code-one-customer race,
IDOR, CSRF, price manipulation, enumeration and rate limiting.

## Production configuration required

The following are intentionally **not** faked — each needs real credentials
and a small provider implementation in `src/lib/providers/`:

1. **Real payments** — implement a `PaymentProvider` (e.g. Stripe Checkout +
   signed webhooks) and set `PAYMENT_PROVIDER` accordingly.
2. **Game top-up API** — real `GameTopupProvider` against your supplier.
3. **Mobile recharge API** — real `RechargeProvider` against the operator/aggregator.
4. **Transactional email** — real notification provider (SMTP/API); the dev
   provider only logs a queued event.
5. **Production PostgreSQL** with TLS + backups; run `npm run db:migrate`.
6. Secrets: unique `SESSION_SECRET`, `INVENTORY_SECRET`, `PAYMENT_WEBHOOK_SECRET`.

See `SECURITY.md` for the security posture and regression process.
