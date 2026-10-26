import { expect, test } from "@playwright/test";

const viewports = [
  { name: "360x740", width: 360, height: 740 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "320x640", width: 320, height: 640 },
] as const;

for (const vp of viewports) {
  for (const locale of ["ar", "en"] as const) {
    test(`P0-1 menu drawer is visible and operable @ ${vp.name} (${locale})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.context().addCookies([
        { name: "evora_locale", value: locale, url: "http://localhost:3100" },
      ]);
      await page.goto("/");

      const toggle = page.getByTestId("menu-toggle");
      await toggle.click();

      const drawer = page.getByTestId("nav-drawer");
      await expect(drawer).toBeVisible();

      // All 15 nav links visible (drawer scrolls internally if needed).
      const links = drawer.locator("nav a");
      await expect(links).toHaveCount(16); // 15 nav + drawer add-funds "+"

      // Drawer is NOT clipped into the header strip: it spans viewport height.
      const box = await drawer.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThan(vp.height * 0.9);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);

      // Body scroll is locked while open.
      const overflow = await page.evaluate(
        () => document.documentElement.style.overflow,
      );
      expect(overflow).toBe("hidden");

      // Focus moved into the drawer.
      const focusInside = await page.evaluate(() =>
        document
          .querySelector('[data-testid="nav-drawer"]')
          ?.contains(document.activeElement),
      );
      expect(focusInside).toBe(true);

      await page.screenshot({
        path: `docs/evidence/menu-${vp.name}-${locale}.png`,
      });

      // Escape closes and focus returns to the toggle.
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(toggle).toBeFocused();
      const overflowAfter = await page.evaluate(
        () => document.documentElement.style.overflow,
      );
      expect(overflowAfter).not.toBe("hidden");
    });
  }
}

test("P0-2 signed-out '+' routes through login to the wallet page", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("header-add-funds").click();
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fwallet/);
});

test("P0-2 '+' has an accessible name and >=44px target in both languages", async ({ page }) => {
  for (const locale of ["ar", "en"] as const) {
    await page.context().addCookies([
      { name: "evora_locale", value: locale, url: "http://localhost:3100" },
    ]);
    await page.goto("/");
    const plus = page.getByTestId("header-add-funds");
    await expect(plus).toHaveAccessibleName(locale === "ar" ? "إضافة رصيد" : "Add funds");
    const box = await plus.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("no horizontal scroll at 320px with the wallet chip present", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const diagnostics = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > 321 || r.left < -1)) {
        offenders.push(
          `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)} [${Math.round(r.left)}..${Math.round(r.right)}]`,
        );
        if (offenders.length >= 8) break;
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, offenders };
  });
  expect(
    diagnostics.scrollWidth,
    `offenders: ${diagnostics.offenders.join(" | ") || "none found"}`,
  ).toBeLessThanOrEqual(320);
  await page.screenshot({ path: "docs/evidence/header-320.png" });
});
