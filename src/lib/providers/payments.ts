import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Payment provider abstraction.
 *
 * Contract:
 *  - `createPayment` returns a URL the customer is redirected to.
 *  - Payment success is ONLY ever established server-side through
 *    `verifyWebhookSignature` + the payment_events idempotency ledger.
 *  - The browser can never assert "paid".
 *
 * Providers:
 *  - MockPaymentProvider — development/testing only. Simulates a hosted
 *    payment page and a signed webhook. It is the ONLY provider available
 *    until real credentials are configured, and it refuses to run in
 *    production builds.
 *  - Stripe (production path, NOT yet enabled): implement StripeProvider
 *    with Payment Intents + webhook signature verification using
 *    STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET. See SECURITY.md.
 */
export type PaymentSession = { redirectUrl: string };

export interface PaymentProvider {
  readonly name: string;
  createPayment(order: {
    id: string;
    orderNumber: string;
    totalCents: number;
  }): Promise<PaymentSession>;
  /** Verifies a webhook payload signature. Constant-time. */
  verifySignature(payload: string, signature: string): boolean;
}

function webhookKey(): Buffer {
  const secret =
    process.env.PAYMENT_WEBHOOK_SECRET ?? process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("PAYMENT_WEBHOOK_SECRET is not configured");
  }
  return Buffer.from(secret, "utf8");
}

export function signPayload(payload: string): string {
  return createHmac("sha256", webhookKey()).update(payload).digest("hex");
}

class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createPayment(order: {
    id: string;
    orderNumber: string;
    totalCents: number;
  }): Promise<PaymentSession> {
    // Signed reference so the mock payment page cannot be pointed at
    // arbitrary orders.
    const sig = signPayload(`pay:${order.orderNumber}`);
    return {
      redirectUrl: `/pay/mock?order=${encodeURIComponent(order.orderNumber)}&sig=${sig}`,
    };
  }

  verifySignature(payload: string, signature: string): boolean {
    const expected = Buffer.from(signPayload(payload), "hex");
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, "hex");
    } catch {
      return false;
    }
    return (
      expected.length === provided.length && timingSafeEqual(expected, provided)
    );
  }
}

export function getPaymentProvider(): PaymentProvider {
  const configured = process.env.PAYMENT_PROVIDER ?? "mock";

  if (configured === "mock") {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_MOCK_PAYMENTS !== "true"
    ) {
      // Fail closed: production must configure a real provider explicitly.
      throw new Error(
        "Mock payments are disabled in production. Configure a real PAYMENT_PROVIDER.",
      );
    }
    return new MockPaymentProvider();
  }

  throw new Error(`Unknown payment provider: ${configured}`);
}
