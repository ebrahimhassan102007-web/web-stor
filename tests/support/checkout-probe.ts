/**
 * Child-process probe used by tests/checkout-safety.test.ts.
 *
 * Imports the real checkout Route Handler and issues one POST, then prints the
 * status and body as JSON. It is intentionally *not* a `*.test.ts` file: the
 * parent test controls its environment (NODE_ENV, DATABASE_URL, APP_ORIGIN).
 *
 * `NODE_OPTIONS=--require tests/support/stub-server-only.cjs` makes the
 * `server-only` marker importable outside a React Server Component.
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/checkout/route";

const validBody = {
  customerName: "Demo Customer",
  email: "demo@example.invalid",
  addressLine1: "1 Demo Street",
  city: "Demoville",
  postalCode: "DE1 1MO",
  country: "Demo",
};

async function main(): Promise<void> {
  const response = await POST(
    new NextRequest("https://store.test/api/checkout", {
      method: "POST",
      headers: {
        origin: process.env.APP_ORIGIN ?? "https://store.test",
        "content-type": "application/json",
      },
      body: JSON.stringify(validBody),
    }),
  );
  process.stdout.write(
    JSON.stringify({ status: response.status, body: await response.text() }),
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`probe failed: ${String(error)}\n`);
  process.exitCode = 1;
});
