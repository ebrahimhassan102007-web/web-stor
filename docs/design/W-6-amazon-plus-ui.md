# W-6 — Amazon-plus storefront, Seller Central and Account Command dashboards

**Status:** IMPLEMENTED (local verification only) — 2026-11-25, branch `arena/2600e3ef-web-stor`, built on `main` @ `01579bc` (PR #27).
**Scope:** presentation and interaction architecture only. No migration, no API contract change to an existing mutating route, no new dependency, no new secret.

The whole wave is one idea: make E-Vora read like Amazon's information architecture while keeping the security posture of Waves S-25/S-26 exactly as it was.

---

## 1. Two-tier command header + instant omnibox

### 1.1 Structure

| Tier | Contents | Behaviour |
| --- | --- | --- |
| **1 — command bar** (`h-[4.25rem]`) | brand mark · omnibox trigger · wallet chip + “+” · Account Hub · cart badge · theme/language · drawer toggle | Sticky, glass, compacts after 12px of scroll (`data-scrolled`) |
| **2 — ecosystem rail** (`sm+`) | All products · Gaming top-ups · AI & pro tools · Gift cards · Subscriptions · Today's deals · Support · **Seller Central** | One horizontal line, hidden scrollbar, active-state aware |

**Phones (< 640px)** deliberately hide the rail and the theme/language toggles in the header: at 320px a second row plus two toggles pushes the row past the viewport, and `e2e/header.spec.ts` asserts **zero horizontal overflow** (every element's `right` edge is measured). Both toggles therefore move *into* the drawer header on phones — no feature is lost, and the guarded invariant holds. The rail's destinations are all in the drawer (which still carries exactly 15 items + the one “add funds” link = the 16 anchors the E2E counts).

### 1.2 Omnibox (`src/components/omnibox.tsx`)

- Opens on **click**, `/`, or **⌘K / Ctrl+K**; never while a caret is inside an input/textarea/select/contenteditable.
- The index is fetched **once** from the new public `GET /api/catalog/omnibox` and then filtered **client-side** on every keystroke (products by EN/AR name, slug, category; categories by name; quick links by label). Typing never touches the network or the database.
- Keyboard: `ArrowDown` / `ArrowUp` cycle, `Enter` opens, `Escape` closes and returns focus to the trigger. ARIA: `role="combobox"` + `aria-activedescendant` + `listbox`/`option`.
- Rows show the icon, title, category **and live price** (`formatCents`), grouped as Quick links → Categories → Products.
- Rendered through `createPortal` to `document.body` — the same P0-1 reason as the drawer (a `backdrop-filter` ancestor becomes the containing block for `position: fixed`).
- Data-leak surface: the endpoint returns **public storefront data only** (`slug`, names, icon, price, category). No seller id, no vault ciphertext, no digest, no buyer data — asserted in `tests/wave6.test.ts`.

## 2. Storefront

### 2.1 Homepage bento

- A hero **spotlight** (h1, search, CTAs, highlights) plus three quick-action cards: Flash offers, Vault promise, Become a verified merchant — each a real destination (`/offers`, `/policies/delivery-refunds`, `/seller`).
- A **trust architecture bar**: split-key encrypted delivery · escrow buyer protection · instant wallet checkout.
- **Category pills** as links, `flex-wrap` (never a horizontal scroller on a phone).
- Two merchandising rows (“Trending now”, “More to explore”) fed by `getFeaturedProducts(8)`.
- The compliance notice (“preview catalogue, no real payments”) is preserved verbatim in both languages.

### 2.2 Product cards

Category pill · trust badge (**Verified merchant** when the listing has a seller, **E-Vora official** for platform/preview rows) · **Instant code delivery** ribbon · integer-formatted price + indicative EGP · view-details affordance · optional quick-add.

Structural rule: the tile is one `<Link>`; the quick-add button lives in a **sibling footer**, never inside the anchor (nested interactive elements are invalid HTML and a keyboard trap). Quick-add appears only for real `stock > 0`, so the preview catalogue never offers an impossible action.

No discount badge is rendered: the catalogue has no compare-at price, and inventing one would be fabricated urgency. `t.card.savings` is wired for when such a column exists.

### 2.3 Product detail buy box

h1 + chips full-width, then a two-column grid: artwork | **`lg:sticky lg:top-32` buy box** (price, delivery status, explicit Player UID / activation-email / region guidance, the single primary CTA, three guarantees, preview caveat). Below: product details + specification table + trust panel + related products. Phones get the buy box directly under the artwork, full-width and 44px+.

## 3. Seller Central (`/seller`)

- **Executive KPI ribbon** — gross sales, payout-eligible, escrow/dispute held, platform commission (10%), active sealed vault codes (`countSellerVaultStock`, a tenant-scoped `count(*)` of unallocated, unshredded envelopes; no code, digest or buyer is selected).
- **Security readiness tracker** — a three-segment bar (`email → 2FA → owner approval`) driven by the *same* `SELLER_GATE_KEYS` the API enforces, with the exact next step linked for each unmet gate. It can never claim something `/api/seller/**` would refuse.
- **Tabbed workspace** — Listings (publish/unpublish + create), Vault stock (batch import with an explicit encryption reassurance), Performance (per-metric tiles + settled order count). Every write is still re-authorised server-side; the UI is convenience, never the control.

## 4. Account Command Hub (`/account/**`)

- `/account`: **command tile grid** (Orders & digital vault · Wallet & ledger · Password & 2FA · Active devices · Seller Central) above the unchanged profile/security cards; anchors `#security` and `#devices` make the tiles real destinations.
- `/account/orders`: status badges by state (paid/confirmed/fulfilled/cancelled), the **encrypted code vault card** with sealed → `vault-unseal` reveal transition, per-code copy that flips to a green ✓ badge, guarded destroy, and the dispute panel.
- `/account/wallet`: balance hero + an **immutable ledger** whose rows are colour-coded from `entry_type` (`credit_topup` green, `debit_order` neutral, `credit_refund` champagne) with direction glyphs.

## 5. Motion system (`src/app/globals.css`)

New, dependency-free, CSP-clean:

| Utility / class | Purpose |
| --- | --- |
| `.stagger > *`, `.enter-up`, `.enter-pop` | Staggered `fade-slide-up` / `fade-scale` entrance driven by a `--i` index |
| `.tactile` | `translateY(-2px)` hover lift, champagne edge, `scale(0.985)` press |
| `.sheen-edge` | One-shot border-luminescence sweep on hover/focus-within |
| `.badge-pop` | Cart-counter / copy-confirmation pop |
| `.vault-unseal`, `.vault-scanline` | Sealed → revealed transition for delivered codes |
| `.command-panel`, `.kpi-tile` | Dashboard surfaces |
| `.rail-scroll` | Scroll rail with a hidden scrollbar |
| `.shell`, `.tap` | Fluid container (`1280px → 1408px`) and 44px touch targets |

Only `opacity`/`transform`/`filter` are animated (verified by a test that inspects every Wave-6 keyframe); no inline `<style>`, no CDN, no `dangerouslySetInnerHTML`. `@media (prefers-reduced-motion: reduce)` neutralises every one of the new utilities.

## 6. Responsiveness

| Range | Layout |
| --- | --- |
| **360–639** | Single column, `overflow-x: clip` on `html`, wrapped pills, stacked dashboards, 44px targets, drawer + omnibox icon |
| **640–1023** | 2–3 column grids, rail visible, toggles back in the header |
| **1024–1439** | 3–4 columns, sticky buy box, seller tabs inline |
| **1440+** | `shell` widens to 1408px so wide monitors stay dense instead of stretched |

RTL: logical utilities only (`inset-inline`, `padding-inline`, `ms-`/`me-`, `start`/`end`) and a hard law — **no positive letter-spacing under `[dir="rtl"]`** (`letter-spacing: normal !important` for `.eyebrow`, `.tracking-luxe` and the badge family), because tracking shreds connected Arabic script. Tests assert both the English-only grant and the RTL revocation.

## 7. Preserved red lines

- `/admin` and `/admin/**` — still an unconditional `404`, empty body, `private, no-store`; `src/app/admin` does not exist.
- `/seller` remains in `privatePrefixes`; every `/api/seller/**` response stays `private, no-store`.
- Rate limits, `guardMutatingRequest()` (Origin + CSRF + ban), split-key v2 vault crypto, buyer one-step registration and checkout: untouched. The only new route is a **GET**.
- All `_ev_client_telemetry_noop` honeypots, their placement and their styling: untouched.
- Every existing route, label, role and `data-testid` used by `e2e/*.spec.ts`: preserved (asserted in `tests/wave6.test.ts`, re-run by CI's Playwright job).

## 8. Residual risk

- The Playwright suite cannot run in this environment (no browser binary and no download route), so the 320px overflow guard, screenshots and drawer behaviour are verified in CI rather than locally.
- `/offers` and `/api/catalog/omnibox` return `500` when the database is unreachable and `DATABASE_URL` is set — that is the catalogue module's deliberate fail-loudly policy (it only disguises a genuinely missing schema, error `42P01`), not a regression introduced here.
- Light/dark parity for the new tiles is token-based, but only screenshot review (CI `docs/evidence/dawn-*.png`) can catch a subtle contrast miss.
