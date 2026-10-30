import { expect, test, type Page } from "@playwright/test";

/**
 * Visual guards for the "Dawn Luxury" refresh.
 *
 * Three jobs:
 *   1. machine-checkable invariants — no horizontal overflow on a 320px phone,
 *      reveal wrappers never leave content invisible, light and dark themes are
 *      genuinely different surfaces, and reduced-motion users still see the hero;
 *   2. a small screenshot matrix written to `docs/evidence/dawn-*.png` so a
 *      reviewer can compare before/after without running the app;
 *   3. nothing here depends on sign-in or on seeded order data, so the spec is
 *      safe to run on the preview catalogue.
 *
 * Chromium is installed by the Quality workflow. Playwright config emulates
 * reduced motion globally, which is also what makes the reveal assertions
 * deterministic (the CSS forces `.reveal` to full opacity in that mode).
 */

const baseURL = process.env.PW_BASE_URL ?? "http://localhost:3100";

async function setPreferences(page: Page, locale: "ar" | "en", theme: "dark" | "light") {
  await page.context().addCookies([
    { name: "evora_locale", value: locale, url: baseURL },
    { name: "evora_theme", value: theme, url: baseURL },
  ]);
}

/** The document must not scroll sideways: 1px tolerance for subpixel rounding. */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal overflow on ${label}`).toBeLessThanOrEqual(innerWidth + 1);
}

test("public pages fit a 320px phone in Arabic and English", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 640 });

  for (const locale of ["ar", "en"] as const) {
    await setPreferences(page, locale, "dark");
    for (const path of ["/", "/products", "/offers", "/cart", "/login"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1").first()).toBeVisible();
      await expectNoHorizontalOverflow(page, `${path} @320 ${locale}`);

      // A reveal wrapper must never be stuck at opacity 0 above the fold.
      const invisible = await page.evaluate(
        () =>
          Array.from(document.querySelectorAll<HTMLElement>(".reveal, .rise-in")).filter(
            (node) => Number(window.getComputedStyle(node).opacity) === 0,
          ).length,
      );
      expect(invisible, `invisible reveal wrappers on ${path} @320 ${locale}`).toBe(0);
    }
  }
});

test("screenshot matrix: desktop, tablet, phone / Arabic, English / dark, light", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const shots = [
    { path: "/", width: 1280, height: 800, locale: "en", theme: "dark" },
    { path: "/", width: 1280, height: 800, locale: "en", theme: "light" },
    { path: "/", width: 1280, height: 800, locale: "ar", theme: "dark" },
    { path: "/", width: 1280, height: 800, locale: "ar", theme: "light" },
    { path: "/", width: 360, height: 740, locale: "en", theme: "dark" },
    { path: "/", width: 360, height: 740, locale: "ar", theme: "dark" },
    { path: "/", width: 768, height: 1024, locale: "en", theme: "light" },
  ] as const;

  for (const shot of shots) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await setPreferences(page, shot.locale, shot.theme);
    await page.goto(shot.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible();
    // Let the ambient layers and any (reduced-motion-safe) entrance settle.
    await page.waitForTimeout(400);
    const name = `dawn-home-${shot.width}-${shot.locale}-${shot.theme}.png`;
    await page.screenshot({ path: `docs/evidence/${name}` });
  }

  // Interior pages, desktop only — enough to review the shared treatment.
  const interior = [
    { path: "/products", file: "dawn-products-1280-en-dark.png", locale: "en", theme: "dark" },
    { path: "/offers", file: "dawn-offers-1280-ar-dark.png", locale: "ar", theme: "dark" },
    { path: "/login", file: "dawn-login-1280-en-light.png", locale: "en", theme: "light" },
    { path: "/cart", file: "dawn-cart-1280-en-dark.png", locale: "en", theme: "dark" },
    { path: "/contact", file: "dawn-contact-1280-ar-light.png", locale: "ar", theme: "light" },
    { path: "/about", file: "dawn-about-1280-en-light.png", locale: "en", theme: "light" },
  ] as const;

  for (const shot of interior) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setPreferences(page, shot.locale, shot.theme);
    await page.goto(shot.path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `docs/evidence/${shot.file}` });
  }
});

test("dark and light themes are genuinely different surfaces", async ({ page }) => {
  const backgrounds: string[] = [];
  for (const theme of ["dark", "light"] as const) {
    await setPreferences(page, "en", theme);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    backgrounds.push(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg-base").trim()));
  }
  expect(backgrounds[0]).not.toEqual(backgrounds[1]);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
});

test("reduced-motion users still receive the full hero", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setPreferences(page, "ar", "dark");
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const heroOpacity = await page.evaluate(() => {
    const hero = document.querySelector(".rise-in");
    return hero ? Number(getComputedStyle(hero).opacity) : -1;
  });
  expect(heroOpacity).toBe(1);
  await expect(page.locator("h1").first()).toBeVisible();
  // Arabic must still render right-to-left.
  expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
});
