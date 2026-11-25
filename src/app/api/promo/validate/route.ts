import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, promoCodes, promoRedemptions } from "@/lib/db";
import { jsonError, jsonOk, handleUnexpected } from "@/lib/http";
import { guardMutatingRequest } from "@/lib/security/request-guard";
import { recordThreat } from "@/lib/security/threat-shield";
import { clientKey, enforceRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody, JSON_BODY_STATUS } from "@/lib/security/read-json";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { normalizePromoCode, calculatePromoDiscount } from "@/lib/wallet-math";
import { z } from "zod";

export const dynamic = "force-dynamic";
const payloadSchema = z.object({ code: z.string().min(1).max(64), subtotalCents: z.number().int().min(0).max(2_147_483_647) });

export async function POST(req: NextRequest) {
  try {
    const guard = await guardMutatingRequest(req);
  if (guard) return guard;
    if (!(await enforceRateLimit("promo-validate", [clientKey(req)], 6, 60_000))) {
      await recordThreat(req, "rate_limit_abuse", { detail: "promo-validate" });
      return jsonError("RATE_LIMITED", 429);
    }
    const raw = await readJsonBody(req, 4096);
    if (!raw.ok) return jsonError("INVALID_BODY", JSON_BODY_STATUS[raw.reason]);
    const parsed = payloadSchema.safeParse(raw.value);
    if (!parsed.success) return jsonError("INVALID_INPUT", 400);
    const code = normalizePromoCode(parsed.data.code);
    if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code)) return jsonError("PROMO_INVALID", 400);
    const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
    const now = new Date();
    if (!promo || !promo.isActive || promo.startsAt > now || (promo.expiresAt && promo.expiresAt <= now)) return jsonError("PROMO_UNAVAILABLE", 400);
    if (promo.maxRedemptions !== null) {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(promoRedemptions).where(eq(promoRedemptions.promoCodeId, promo.id));
      if (count >= promo.maxRedemptions) return jsonError("PROMO_LIMIT_REACHED", 400);
    }
    const user = await getCurrentAccountUser().catch(() => null);
    if (user) {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(promoRedemptions).where(and(eq(promoRedemptions.promoCodeId, promo.id), eq(promoRedemptions.userId, user.id)));
      if (count >= promo.perUserLimit) return jsonError("PROMO_LIMIT_REACHED", 400);
    }
    const discountCents = calculatePromoDiscount({ discountType: promo.discountType as "percentage" | "fixed_cents", discountValue: promo.discountValue, minSubtotalCents: promo.minSubtotalCents, maxDiscountCents: promo.maxDiscountCents, subtotalCents: parsed.data.subtotalCents });
    if (discountCents <= 0) return jsonError("PROMO_MINIMUM_NOT_MET", 400);
    return jsonOk({ code, discountCents, totalCents: parsed.data.subtotalCents - discountCents }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleUnexpected("promo:validate", error); }
}
