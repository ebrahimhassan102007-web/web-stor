/**
 * Wave 6 guard rails — the storefront refresh must not weaken S-25/S-26.
 *
 * These are source- and data-level assertions only: no browser, no database.
 * They lock the invariants that are easy to break with a redesign and hard to
 * notice in review — the e2e selector contract, the `/admin` elimination, the
 * private seller portal, the RTL/Arabic typography law, the reduced-motion law
 * and "no third-party bloat".
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { dictionaries, dirFor } from "../src/lib/i18n/dictionary";

const cwd = process.cwd();
const source = (relative: string) => readFileSync(path.join(cwd, relative), "utf8");

/* ------------------------------------------------------------------ */
/* 1. Header keeps the P0-1 / P0-2 e2e contract                        */
/* ------------------------------------------------------------------ */

test("S-27: the header keeps every selector the e2e suite drives", () => {
  const header = source("src/components/header.tsx");

  // Drawer + toggle + add-funds: the three hooks e2e/header.spec.ts relies on.
  for (const hook of [
    'data-testid="menu-toggle"',
    'data-testid="nav-drawer"',
    'data-testid="menu-overlay"',
    'data-testid="header-add-funds"',
    'data-testid="wallet-chip"',
    'data-testid="header-cart"',
    'data-testid="header-account"',
  ]) {
    assert.ok(header.includes(hook), `missing ${hook}`);
  }

  // The drawer is still portalled to <body>: the sticky header's backdrop-filter
  // would otherwise become the containing block for position: fixed (P0-1).
  assert.match(header, /createPortal\(drawer, document\.body\)/);
  assert.match(header, /const drawerRef = useRef<HTMLElement>\(null\)/);
  assert.match(header, /root\.style\.overflow = "hidden"/);

  // Exactly fifteen drawer destinations + the one "add funds" link = the
  // sixteen anchors e2e/header.spec.ts counts. Adding a rail entry must never
  // leak into the drawer nav.
  const navItemsBlock = header.slice(
    header.indexOf("const navItems = ["),
    header.indexOf("] as const;", header.indexOf("const navItems = [")),
  );
  const drawerLinks = navItemsBlock.match(/\{ href: "/g) ?? [];
  assert.equal(drawerLinks.length, 15, "the drawer must keep exactly 15 destinations");

  // The new sub-rail lives outside the drawer and outside the drawer nav.
  const railBlock = header.slice(header.indexOf("const rail = ["), header.indexOf("] as const;", header.indexOf("const rail = [")));
  assert.ok(railBlock.includes('href: "/seller"'), "the rail surfaces Seller Central");
  assert.ok(railBlock.includes('href: "/offers"'));
  assert.ok(railBlock.includes('href: "/support-bot"'));
});

/* ------------------------------------------------------------------ */
/* 2. The omnibox is public, read-only and leaks nothing               */
/* ------------------------------------------------------------------ */

test("S-27: the omnibox index is a read-only public endpoint", () => {
  const route = source("src/app/api/catalog/omnibox/route.ts");
  assert.match(route, /export async function GET\(/);
  assert.doesNotMatch(route, /export async function (POST|PATCH|PUT|DELETE)/);
  // Private, no-store + Vary: Cookie comes from the shared responder.
  assert.match(route, /jsonOk\(/);

  const catalog = source("src/lib/catalog.ts");
  const indexBlock = catalog.slice(catalog.indexOf("export type OmniboxIndex"), catalog.indexOf("export async function getProductBySlug"));
  // Public storefront data only: no seller identity, no ciphertext, no digests.
  for (const forbidden of ["sellerId", "ciphertext", "codeDigest", "wrappedDek", "stock:"]) {
    assert.ok(!indexBlock.includes(forbidden), `the omnibox index must not expose ${forbidden}`);
  }
  assert.doesNotMatch(indexBlock, /userId|email/i);
});

test("S-27: the omnibox is client-filtered and keyboard driven", () => {
  const omnibox = source("src/components/omnibox.tsx");
  // One fetch, then local filtering on every keystroke.
  assert.equal((omnibox.match(/fetch\("\/api\/catalog\/omnibox"/g) ?? []).length, 1);
  assert.match(omnibox, /toLocaleLowerCase\(\)/);
  // ArrowUp / ArrowDown / Enter / Escape + accessible combobox semantics.
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) {
    assert.ok(omnibox.includes(`event.key === "${key}"`), `missing ${key} handling`);
  }
  assert.match(omnibox, /role="combobox"/);
  assert.match(omnibox, /aria-activedescendant/);
  assert.match(omnibox, /role="listbox"/);
  assert.match(omnibox, /role="option"/);
  // Shortcuts: `/` and ⌘K / Ctrl+K.
  assert.match(omnibox, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(omnibox, /event\.key === "\/"/);
  // The palette must not open while someone is typing in a field.
  assert.match(omnibox, /"INPUT", "TEXTAREA", "SELECT"/);
  // Portalled, for the same backdrop-filter reason as the drawer.
  assert.match(omnibox, /createPortal\(dialog, document\.body\)/);
});

/* ------------------------------------------------------------------ */
/* 3. Red lines: /admin gone, /api/seller isolated                     */
/* ------------------------------------------------------------------ */

test("S-27: /admin is still an unconditional 404 and stays out of the app", () => {
  assert.equal(existsSync(path.join(cwd, "src/app/admin")), false, "there must be no admin route");
  const proxy = source("src/proxy.ts");
  assert.match(proxy, /admin/);
  assert.match(proxy, /404/);
  assert.match(proxy, /private, no-store/);
  // The merchant portal (and only it) joined the private prefix list.
  assert.match(proxy, /privatePrefixes/);
  assert.ok(proxy.includes('"/seller"'));
});

test("S-27: no Wave-6 surface introduces a client-supplied seller scope", () => {
  for (const file of [
    "src/app/seller/page.tsx",
    "src/components/seller-workspace.tsx",
    "src/components/omnibox.tsx",
  ]) {
    const text = source(file);
    assert.doesNotMatch(text, /sellerId=\{|seller_id=\$?\{?(searchParams|params|query)/, `${file} must not take a seller id from the request`);
  }
});

/* ------------------------------------------------------------------ */
/* 4. Motion, RTL and responsive laws                                  */
/* ------------------------------------------------------------------ */

test("S-27: the motion system is CSS-only, GPU-safe and reduced-motion aware", () => {
  const css = source("src/app/globals.css");

  // Compositor-only properties inside every Wave-6 keyframe block.
  const wave6 = css.slice(css.indexOf("Wave 6 — command storefront"));
  const frames = wave6.match(/@keyframes [\w-]+ \{[\s\S]*?\n\}/g) ?? [];
  assert.ok(frames.length >= 4, "expected the new keyframes to exist");
  for (const frame of frames) {
    for (const property of ["width", "height", "margin", "padding", "top", "left"]) {
      assert.ok(!new RegExp(`(^|[^-])${property}:`).test(frame), `keyframes must not animate ${property}: ${frame.slice(0, 40)}`);
    }
  }
  assert.match(wave6, /translate3d/);

  // Reduced motion must neutralise every new entrance utility.
  const reduceBlock = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  for (const selector of [".stagger > *", ".enter-up", ".enter-pop", ".vault-unseal", ".badge-pop"]) {
    assert.ok(reduceBlock.includes(selector), `reduced motion must cover ${selector}`);
  }
  assert.match(reduceBlock, /animation: none !important/);
});

test("S-27: Arabic never receives positive letter-spacing", () => {
  const css = source("src/app/globals.css");
  // Tracking is granted to English only…
  assert.match(css, /html\[lang="en"\] \.eyebrow/);
  assert.match(css, /html\[lang="en"\] \.tracking-luxe/);
  // …and explicitly revoked under RTL.
  assert.match(css, /\[dir="rtl"\] :is\(\.eyebrow, \.tracking-luxe/);
  assert.match(css, /letter-spacing: normal !important/);
  // No positive tracking is ever applied to an RTL-scoped selector.
  const rtlRules = css.split("\n").filter((line) => line.includes("[dir=\"rtl\"]") && line.includes("letter-spacing"));
  for (const rule of rtlRules) {
    assert.doesNotMatch(rule, /letter-spacing:\s*0?\.\d+em/, `RTL tracking found: ${rule}`);
  }
});

test("S-27: phones cannot scroll sideways and touch targets stay 44px", () => {
  const css = source("src/app/globals.css");
  assert.match(css, /@media \(max-width: 639px\) \{\s*html \{\s*overflow-x: clip;/);
  assert.match(css, /@utility tap \{[\s\S]{0,120}min-height: 2\.75rem;[\s\S]{0,80}min-width: 2\.75rem;/);

  // Nothing in the phone-width header is allowed to be a horizontal scroller.
  const header = source("src/components/header.tsx");
  const railBlock = header.slice(header.indexOf("Tier 2 — category"), header.indexOf("</header>"));
  assert.match(railBlock, /hidden border-t border-edge\/60 sm:block/);
  assert.ok(railBlock.includes("rail-scroll"));
});

test("S-27: the four form factors are expressed explicitly", () => {
  const css = source("src/app/globals.css");
  const shell = css.slice(css.indexOf("@utility shell"), css.indexOf("/* 44×44 minimum touch target"));
  assert.match(shell, /max-width: 80rem/);
  assert.match(shell, /@media \(min-width: 640px\)/);
  assert.match(shell, /@media \(min-width: 1536px\)/);

  // Storefront and dashboard grids step 1 → 2 → 3 → 4 columns, never a fixed
  // width, so 360/640/1024/1440 all get a deliberate layout.
  for (const file of ["src/app/page.tsx", "src/app/products/page.tsx", "src/app/account/wallet/page.tsx"]) {
    const text = source(file);
    assert.match(text, /(sm:grid-cols-2|sm:grid-cols-3)/, `${file} needs a tablet step`);
  }
  assert.match(source("src/app/page.tsx"), /xl:grid-cols-4/);
  // The dashboard tiles are dense on phones and one row on wide screens.
  assert.match(source("src/app/seller/page.tsx"), /lg:grid-cols-5/);
  assert.match(source("src/app/account/page.tsx"), /grid-cols-2 gap-2\.5 lg:grid-cols-5/);
});

/* ------------------------------------------------------------------ */
/* 5. Zero external bloat                                             */
/* ------------------------------------------------------------------ */

test("S-27: no animation/UI dependency and no external asset was added", () => {
  const pkg = JSON.parse(source("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const forbidden = ["framer-motion", "motion", "gsap", "react-spring", "@react-spring/web", "tailwindcss-animate", "animate.css", "lottie-react", "embla-carousel"];
  for (const name of forbidden) {
    assert.ok(!all.includes(name as never), `${name} must not be added`);
  }

  // No CDN <script>/<link>, and no raw style injection in the new components.
  for (const file of ["src/components/omnibox.tsx", "src/components/header.tsx", "src/components/product-card.tsx"]) {
    const text = source(file);
    assert.doesNotMatch(text, /https?:\/\/(cdn|unpkg|jsdelivr|fonts\.googleapis)/, `${file} must not load a CDN asset`);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, `${file} must not inject HTML`);
  }
});

/* ------------------------------------------------------------------ */
/* 6. Bilingual parity for every new surface                          */
/* ------------------------------------------------------------------ */

test("S-27: every new dashboard and rail string exists in Arabic and English", () => {
  const namespaces = ["omnibox", "rail", "trust", "bento", "hub", "walletHub", "ordersHub", "sellerKpi"] as const;

  const walk = (value: unknown, prefix: string): string[] => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => walk(child, `${prefix}.${key}`));
    }
    return [prefix];
  };

  for (const locale of ["en", "ar"] as const) {
    const dict = dictionaries[locale] as unknown as Record<string, unknown>;
    for (const namespace of namespaces) {
      assert.ok(dict[namespace], `${locale}.${namespace} is missing`);
    }
    assert.equal(dirFor(locale), locale === "ar" ? "rtl" : "ltr");
  }

  const enKeys = namespaces.flatMap((namespace) => walk(dictionaries.en[namespace], namespace)).sort();
  const arKeys = namespaces.flatMap((namespace) => walk(dictionaries.ar[namespace], namespace)).sort();
  assert.deepEqual(arKeys, enKeys, "Arabic and English must expose the same keys");

  // No placeholder Arabic: every Arabic string carries Arabic script or a
  // deliberate LTR token (a number, an emoji, a code).
  const arabicLeaves = namespaces.flatMap((namespace) =>
    Object.values(dictionaries.ar[namespace] as Record<string, string>).filter((value) => typeof value === "string"),
  );
  for (const value of arabicLeaves) {
    assert.ok(/[\u0600-\u06FF]/.test(value) || /^[\d\s/⌘·+%↑↓→←-]+$/.test(value), `untranslated Arabic string: ${value}`);
  }
});

test("S-27: storefront copy still states that this is a preview", () => {
  const home = source("src/app/page.tsx");
  assert.match(home, /Store preview — products are for browsing only|نسخة استعراضية/);
  const product = source("src/app/products/[slug]/page.tsx");
  assert.match(product, /Preview only|معاينة فقط/);
  const wallet = source("src/app/account/wallet/page.tsx");
  assert.match(wallet, /Deposits are not enabled|الإيداع غير مفعّل/);
});
