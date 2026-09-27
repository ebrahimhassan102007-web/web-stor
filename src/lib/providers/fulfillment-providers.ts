import "server-only";
import { randomBytes } from "node:crypto";
import { logEvent } from "@/lib/log";

/**
 * Game top-up & mobile recharge provider abstractions.
 *
 * The mock providers exist ONLY so the full order → payment → fulfillment
 * pipeline can be exercised in development. They:
 *   - never claim to be real (references are prefixed DEV-),
 *   - refuse to run in production unless explicitly allowed,
 *   - are swapped for real implementations by configuring
 *     TOPUP_PROVIDER / RECHARGE_PROVIDER plus provider credentials.
 *
 * Real integrations required for production:
 *   - Game top-up: an authorized distributor API (e.g. official PUBG/Free
 *     Fire reseller endpoints) with server-side credentials.
 *   - Mobile recharge: an authorized telecom aggregator API.
 * Never report success unless the provider confirms it.
 */
export type ProviderResult =
  | { ok: true; reference: string }
  | { ok: false; error: string };

export interface GameTopupProvider {
  readonly name: string;
  topup(input: {
    productSlug: string;
    playerId: string;
    quantity: number;
  }): Promise<ProviderResult>;
}

export interface RechargeProvider {
  readonly name: string;
  recharge(input: {
    productSlug: string;
    phone: string;
    quantity: number;
  }): Promise<ProviderResult>;
}

function assertMockAllowed(kind: string): void {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_MOCK_PROVIDERS !== "true"
  ) {
    throw new Error(
      `Mock ${kind} provider is disabled in production. Configure a real provider.`,
    );
  }
}

class MockGameTopupProvider implements GameTopupProvider {
  readonly name = "mock";
  async topup(input: {
    productSlug: string;
    playerId: string;
    quantity: number;
  }): Promise<ProviderResult> {
    assertMockAllowed("game top-up");
    logEvent("info", "provider.mock.topup", {
      product: input.productSlug,
      quantity: input.quantity,
      // player id is customer data — log only its length
      playerIdLength: input.playerId.length,
    });
    return { ok: true, reference: `DEV-TOPUP-${randomBytes(6).toString("hex").toUpperCase()}` };
  }
}

class MockRechargeProvider implements RechargeProvider {
  readonly name = "mock";
  async recharge(input: {
    productSlug: string;
    phone: string;
    quantity: number;
  }): Promise<ProviderResult> {
    assertMockAllowed("recharge");
    logEvent("info", "provider.mock.recharge", {
      product: input.productSlug,
      quantity: input.quantity,
      phoneSuffix: input.phone.slice(-3),
    });
    return { ok: true, reference: `DEV-RCHG-${randomBytes(6).toString("hex").toUpperCase()}` };
  }
}

export function getTopupProvider(): GameTopupProvider {
  const configured = process.env.TOPUP_PROVIDER ?? "mock";
  if (configured === "mock") return new MockGameTopupProvider();
  throw new Error(`Unknown top-up provider: ${configured}`);
}

export function getRechargeProvider(): RechargeProvider {
  const configured = process.env.RECHARGE_PROVIDER ?? "mock";
  if (configured === "mock") return new MockRechargeProvider();
  throw new Error(`Unknown recharge provider: ${configured}`);
}
