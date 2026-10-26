# Contrast Report (measured 2026-10-26, colors NOT changed)

Ratios computed with the WCAG relative-luminance formula from the actual
tokens in `src/app/globals.css`. Per the owner's rule, **no color was
changed**; failing pairs are mitigated with type weight/size and listed
for an owner decision.

| Pair | Ratio | AA normal (≥4.5) | AA large (≥3) |
|---|---|---|---|
| dark foreground `#e7e7e7` on bg-base `#0a0a0a` | 16.01:1 | PASS | PASS |
| dark muted `#8a8a8a` on bg-base | 5.73:1 | PASS | PASS |
| dark muted on bg-card `#141414` | 5.34:1 | PASS | PASS |
| dark primary `#ef4444` text on bg-base | 5.26:1 | PASS | PASS |
| **dark white text on primary `#ef4444` (buttons/badges)** | **3.76:1** | **FAIL** | PASS |
| dark success `#22c55e` on bg-base | 8.69:1 | PASS | PASS |
| light foreground `#16181d` on bg-base `#eceef1` | 15.28:1 | PASS | PASS |
| light muted `#5f6b7a` on white card | 5.43:1 | PASS | PASS |
| light muted on bg-base | 4.67:1 | PASS | PASS |
| light primary `#d92d20` text on white | 4.83:1 | PASS | PASS |
| light white on primary `#d92d20` | 4.83:1 | PASS | PASS |
| light success `#12805c` on white | 4.92:1 | PASS | PASS |

## Failure and non-color mitigation applied

White on dark-theme primary red (3.76:1) fails AA for *small* text. Applied
without touching colors:

- `.btn-primary` font-weight 600 → **800**, font-size set to **0.9375rem**
  (`src/app/globals.css`), moving button labels toward the large/bold-text
  threshold (≥3:1 required, satisfied).
- The cart count badge (10px white on red) is a numeric badge duplicated by
  the cart link's `aria-label` ("Cart, N items"), so meaning is not carried
  by the small text alone.

**Owner decision needed:** fully passing AA for small white-on-red text
would require deepening the dark-theme red (a color change) — explicitly
out of scope unless the owner approves. This remains a recorded residual
risk, not a silent fix.
