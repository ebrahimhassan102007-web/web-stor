import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readNavigation(file: string) {
  return readFile(path.join(process.cwd(), file), "utf8");
}

async function assertLinksResolve(source: string, componentName: string) {
  const hrefs = [...source.matchAll(/href:\s*"(\/[^"?]+)"/g)].map((match) => match[1]);
  assert.ok(hrefs.length > 0, `${componentName} should expose navigation destinations`);

  for (const href of hrefs) {
    const page = path.join(process.cwd(), "src/app", href.replace(/^\//, ""), "page.tsx");
    await access(page).catch(() => {
      throw new Error(`${componentName} links to ${href}, but ${page} does not exist`);
    });
  }
}

test("account navigation links resolve to existing storefront pages", async () => {
  await assertLinksResolve(await readNavigation("src/components/account-nav.tsx"), "Account navigation");
});

test("every balance tab links to an existing wallet page", async () => {
  await assertLinksResolve(await readNavigation("src/components/wallet-nav.tsx"), "Balance navigation");
});
