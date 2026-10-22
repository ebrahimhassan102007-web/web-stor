import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/checkout/route";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) throw new Error("SESSION_SECRET is required for this probe");

const cartId = "123e4567-e89b-12d3-a456-426614174000";
const signature = createHmac("sha256", sessionSecret)
  .update(cartId)
  .digest("hex");
const cartCookie = `${cartId}.${signature}`;

async function main(): Promise<void> {
  const response = await POST(
    new NextRequest("https://store.test/api/checkout", {
      method: "POST",
      headers: {
        origin: "https://store.test",
        cookie: `evora_cart=${cartCookie}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        customerName: "Production Safety Test",
        email: "safety@example.invalid",
      }),
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
