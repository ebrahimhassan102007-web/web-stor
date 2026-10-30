# E-Vora — Premium Visual Upgrade ("Dawn Luxury")

**Scope:** presentation only. No API route, server action, database query, auth rule, cart/checkout behaviour, price, product record or payment setting was modified.

- Branch: `arena/6bbbf7ed-web-stor` (this session's fixed branch; PR #19 was merged before this work started, so this is a clean follow-up branch state).
- Preview: local `next dev` on `0.0.0.0:3000` (catalogue preview mode — no `DATABASE_URL`, read-only seeded catalogue), exposed as the Arena live preview.

---

## 1. Art direction

| Layer | Dark theme | Light theme |
| --- | --- | --- |
| Surface | `#06060a` → `#0a0a10` → `#15151e` (near-black with a warm undertone) | `#f5f1ea` → `#efeae1` → `#fffefb` (warm ivory paper, **not** inverted dark) |
| Ambient light | 3 fixed, heavily blurred dawn glows: champagne `rgba(236,217,180,.10)`, rose `rgba(240,168,160,.085)`, violet `rgba(179,166,240,.075)` | Warm, weaker glows (`--ambient-strength: .85`) |
| Accent light | Champagne `#ecd9b4` / `#f6ecd9` | Champagne **text** `#9a7434` (4.9:1 on white) |
| Brand action | Red stays the CTA colour (`#ef4444`), now with a gradient + inner highlight | `#c62b1f` |
| Text | `#ece9e2` on dark, muted `#9c968c` | `#1a1712`, muted `#6a6257` |
| Glass | `rgba(12,12,18,.62)` + 14px blur + hairline top highlight | `rgba(255,253,249,.78)` |

Design rules applied everywhere:

- **One glow, one grain, one aurora.** Decorative light is confined to the fixed `DawnStage` and the hero (mobile drops the third light source and halves blur).
- **Hairline "lit-from-above" edges** instead of heavy borders (masked 1px gradient on `.glass-card`).
- **Depth by shadow, not by colour noise** — layered warm shadows (`--card-shadow` → `--elev-hover`).
- **Typography**: one display treatment (`title-luxe`, tight tracking), one eyebrow treatment (`eyebrow`, champagne, uppercase). Letter-spacing is applied **only** under `html[lang="en"]`; Arabic keeps `letter-spacing: normal` so Cairo's joined letters are never broken.

## 2. Motion system (CSS-only, no libraries)

| Utility | What it does | Where |
| --- | --- | --- |
| `.reveal` / `.is-visible` | opacity + 18px translate on first intersection, delay via `--reveal-delay` | sections, category cards, product grids |
| `.rise-in` | one-shot staggered entrance with `--rise-delay` | hero eyebrow → title → paragraph → search → CTAs → trust chips |
| `.dawn-glow-a/b/c` | 64–96s alternating drift, transform-only | fixed background |
| `hero-aurora` | 34s scale/translate inside the hero panel | home hero |
| `.float-soft` | 14s ±10px float | glass E-Vora mark only |
| `.sheen` | hover light sweep (opacity + translate) | product media, product detail art |
| `card-media-zoom` | 1.0 → 1.055 image scale on hover/focus | product artwork layer only (text never scales) |
| `btn-primary` / `btn-ghost` / `btn-icon` | hover lift + `active:scale(.985)` press feedback | every button/link button |
| `.skeleton` | 1.6s sweep | `/products` and `/account` loading states |
| drawer | 200ms inline-end slide, RTL-aware keyframes | mobile navigation |

Guarantees:

- **`prefers-reduced-motion: reduce`** disables every animation, zeroes reveal delays, forces `.reveal`/`.rise-in` to full opacity, and removes the sheen. A JS `matchMedia` check in `Reveal` short-circuits the observer as a second layer.
- **No layout shift:** all motion is `opacity`/`transform` only. Skeletons mirror final geometry. No font or image swaps were introduced.
- **No runaway animation:** no infinite animations outside the three ambient glows and the hero aurora (both transform-only and disabled for reduced motion). The old `animate-pulse` footer dot was removed.
- **No new dependency**: `package.json` is untouched.

## 2b. Dark panels in a light theme

The hero, the offers hero, the support-bot hero, the login side panel, the wallet card and the account balance card stay dark in **both** themes — a dark showcase panel on warm ivory is what makes the light theme feel designed rather than inverted. Instead of overriding colours element by element, `dawn-panel` re-declares the light-on-dark tokens locally:

```
.hero-shell, .dawn-panel {
  --champagne, --champagne-soft, --foreground, --muted,
  --border-subtle, --glass-bg, --glass-border, --hover-fill,
  --input-bg, --card-shadow, --elev-hover
}
```

so nested utilities (`text-muted`, `badge-*`, `glass-card`, `btn-*`) stay legible automatically. `title-luxe` deliberately does **not** set a colour (it inherits), and the light-mode `text-gradient-dawn` is re-brightened inside those panels — otherwise the accent word would turn dark gold on near-black.

## 3. Page-by-page

| Page | Work |
| --- | --- |
| Home | New cinematic hero: aurora + ornaments + staggered reveal, glass 3D "E" mark, premium `search-luxe` bar with focus glow, trust chips, restyled pillars/notice/categories/featured with staggered reveals |
| Products | Eyebrow + gradient title, refined notice, `Reveal` grid (first 8 staggered), new `loading.tsx` skeleton |
| Product detail | Art panel with sheen + champagne brand chip + bottom fade, gradient price, refined trust tiles, "keep exploring" header |
| Cart | Eyebrow + gradient title, sticky summary with champagne rule, lift on line cards |
| Checkout / success | Eyebrow + gradient title; success halo |
| Login | Side panel re-skinned from cyan/violet to champagne/dawn, `title-luxe`, champagne tabs |
| Account (dashboard, orders, wallet, nav) | Eyebrow/title system, champagne wallet card with rose counter-glow, champagne nav pills, `account/loading.tsx` skeleton |
| Offers | Hero re-skinned to dawn palette, `btn-primary`, staggered grid |
| Info pages (about/FAQ/contact/policies) | Champagne eyebrow chip, champagne top hairline, `title-luxe` |
| Admin hub | Eyebrow, `lift` cards, champagne hover, warmer notice |
| Footer | Gradient fade + champagne hairline, static status dot (no infinite pulse), champagne link hover |
| 404 | Champagne gradient numerals, dawn halo, `title-luxe` |
| Support bot | `dawn-panel` hero, champagne eyebrow, `title-luxe` |
| Header | Scroll-reactive glass (`data-scrolled`), rAF-throttled passive listener, gradient logo mark with inner ring, `btn-icon` controls, drawer items with champagne active state; all `data-testid`s, 44px targets, focus trap and 16 drawer links preserved |

## 4. RTL / LTR

- Logical properties only (`ms-/me-`, `ps-/pe-`, `start-/end-`, `inset-inline-*`); the hero mark, glows, ornaments, drawer, nav underline and arrow chevrons all flip correctly.
- Chevrons/arrows keep the existing `rtl:-scale-x-100` pattern; hover translates are mirrored (`rtl:group-hover:-translate-x-0.5`).
- Arabic letter-spacing is force-neutralised, and the new `eyebrow`/`tracking-luxe` letter-spacing is scoped to `html[lang="en"]`.
- Hero and card copy read correctly in both scripts at every breakpoint tested (320/360/768/1280).

## 5. Accessibility

- Global `:focus-visible` outline (`--focus-ring`) on top of existing per-component rings; hero CTA/secondary buttons keep ≥44–48px heights.
- Contrast: muted text 8.6:1 (dark) / 5.4:1 (light); champagne on ivory 4.9:1; primary button label unchanged from the documented CONTRAST-REPORT mitigation (bold ≥ 0.9375rem).
- Decorative layers are `aria-hidden` + `pointer-events: none`; skeletons expose `aria-busy` and a screen-reader label.
- The `<noscript>` fallback forces reveal content visible if JavaScript never runs.

## 5b. Visual QA (screenshots, this environment)

Chromium was eventually driven headlessly in this sandbox (a bundled static
build plus three stub NSS/NSPR shared libraries), so the redesign was reviewed
as pixels, not only as code. Evidence lives in `docs/visual-review/` (real
before/after pairs; "before" comes from a `3bb4cae` worktree).

What the review caught and fixed (all committed):

| Finding | Fix |
| --- | --- |
| `text-base` was painting text with the page background | the theme map had a colour token named `base`; renamed it to `canvas` |
| Hero search field went ivory in light mode | panels now override `--bg-card` / `--bg-raised` locally |
| No desktop navigation at all (links only in the drawer) | five existing destinations inline from `lg` up, with an active underline |
| `title-luxe` forced page ink, breaking headings on dark panels in light theme | it now inherits colour |
| Light ambient layer made ivory look dusty | rose/violet contributions reduced, warmth kept |
| Glass "E" mark pushed the headline below the fold on phones | mark now follows the copy below `lg` |
| Real tofu boxes where emoji glyphs should be | theme toggle, empty cart and empty checkout use crisp SVG icons |
| Arabic notice text broke mid-phrase | notice is a single flowing block |

Measurements taken with the same tooling:

- `scrollWidth - innerWidth = 0` on 320/390/768/1024/1280/1440/1920 px and both
  locales; header content never exceeds the viewport.
- No `.reveal` / `.rise-in` element remains at `opacity: 0` after scrolling the
  page (home, products, offers, detail, cart, about, 404).
- Zero `pageerror` events on every captured route.
- Mobile drawer at 390 px: full-height, 16 links, focus trapped inside.

## 6. Verification

| Gate | Result |
| --- | --- |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | **115 tests, 109 pass, 0 fail, 6 skipped** (unchanged behaviour) |
| `npm run build` | pass |
| Dev server smoke (`/`, `/products`, `/offers`, `/login`, `/cart`, `/checkout`, `/account/wallet`, `/about`, `/faq`, `/contact`, `/policies/terms`, `/support-bot`, product detail) | 200 + zero runtime errors |
| Theme/locale cookies (`evora_theme=light`, `evora_locale=ar`) | `<html lang="ar" dir="rtl" data-theme="light">` verified |
| Playwright (`e2e/visual.spec.ts`) locally | **NOT RUN** — no browser binary in the sandbox and the Playwright download CDN is unreachable from it. |
| Playwright in CI | ✅ **pass** in the Quality workflow (`End-to-end header tests`, which runs the whole `e2e/` directory: the existing `header.spec.ts` **and** the new `visual.spec.ts`), 2m52s, run `40757494898`. |
| Screenshots | **Produced here** for 11 route/theme/locale combinations (see `docs/visual-review/`), and additionally by CI as the `visual-review-screenshots` artifact (14 days). |

## 7. Known limitations

1. The screenshot matrix in CI (`docs/evidence/`) is generated by the Quality workflow; the curated before/after pairs are committed in `docs/visual-review/`.
2. The catalogue is served from the read-only preview fallback (no `DATABASE_URL`), so styling was verified against preview rows.
3. Light theme keeps the hero as a deliberate dark "panel" for contrast; everything else is warm ivory.
4. Marketplace/seller pages do not exist yet (they are a later PR); their design language is defined here and will be applied when those routes land.
