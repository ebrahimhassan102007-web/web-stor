import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { dictionaries } from "../src/lib/i18n/dictionary";
import { staticPages } from "../src/lib/i18n/static-pages";

const routeFiles = [
  ["about", "src/app/about/page.tsx"],
  ["faq", "src/app/faq/page.tsx"],
  ["contact", "src/app/contact/page.tsx"],
  ["privacy", "src/app/policies/privacy/page.tsx"],
  ["terms", "src/app/policies/terms/page.tsx"],
  ["delivery and refunds", "src/app/policies/delivery-refunds/page.tsx"],
] as const;

test("all informational pages have complete English and Arabic copy", () => {
  for (const locale of ["en", "ar"] as const) {
    const copy = staticPages[locale];

    for (const key of ["about", "faq", "contact", "privacy", "terms", "deliveryRefunds"] as const) {
      const page = copy[key];
      assert.ok(page.eyebrow.trim(), `${locale} ${key} eyebrow`);
      assert.ok(page.title.trim(), `${locale} ${key} title`);
      assert.ok(page.lead.trim(), `${locale} ${key} lead`);
      assert.ok(page.backHome.trim(), `${locale} ${key} home link`);
      assert.ok(page.closingNote.trim(), `${locale} ${key} closing note`);
      for (const section of page.sections) {
        assert.ok(section.heading.trim(), `${locale} ${key} section heading`);
        assert.ok(section.paragraphs.length > 0, `${locale} ${key} section paragraphs`);
        assert.ok(section.paragraphs.every((paragraph) => paragraph.trim()), `${locale} ${key} paragraph copy`);
      }
    }

    assert.ok(copy.faq.items.length >= 8, `${locale} FAQ should cover common issues`);
    assert.ok(copy.faq.items.every((item) => item.question.trim() && item.answer.trim()));
    for (const [key, label] of Object.entries(copy.footerLinks)) {
      assert.ok(label.trim(), `${locale} footer link ${key}`);
    }
  }
});

test("every footer information link has a matching App Router page", async () => {
  for (const [name, file] of routeFiles) {
    await access(path.join(process.cwd(), file)).catch((error: unknown) => {
      throw new Error(`Missing route for ${name}: ${file}; ${String(error)}`);
    });
  }

  const footer = await readFile(path.join(process.cwd(), "src/components/footer.tsx"), "utf8");
  for (const href of [
    "/about",
    "/faq",
    "/contact",
    "/policies/privacy",
    "/policies/terms",
    "/policies/delivery-refunds",
  ]) {
    assert.ok(footer.includes(`href="${href}"`), `Footer must link to ${href}`);
  }
});

test("home page copy does not promise real payments or instant delivery in the preview", () => {
  assert.match(dictionaries.en.hero.sub, /preview.*no real payment/i);
  assert.match(dictionaries.ar.hero.sub, /لا تُعالج دفعات حقيقية/);
  assert.match(dictionaries.en.checkout.demoNote, /demo-only|demo/i);
  assert.match(dictionaries.ar.checkout.demoNote, /تجريبي/);
  assert.match(staticPages.en.deliveryRefunds.lead, /preview/i);
  assert.match(staticPages.ar.deliveryRefunds.lead, /معاينة/);
});
