import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, walletAccounts, walletLedger } from "@/lib/db";
import { verifyWalletWebhookSignature } from "@/lib/wallet-webhook";
import { recordSecurityEvent } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const announcedLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(announcedLength) && announcedLength > 8192) return NextResponse.json({ ok: false, error: "BODY_TOO_LARGE" }, { status: 413 });
  const reader = req.body?.getReader();
  if (!reader) return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > 8192) { await reader.cancel(); return NextResponse.json({ ok: false, error: "BODY_TOO_LARGE" }, { status: 413 }); }
    chunks.push(value);
  }
  let rawBody: string;
  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch { return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 }); }
  const validSignature = verifyWalletWebhookSignature({
    secret: process.env.WALLET_TOPUP_WEBHOOK_SECRET,
    timestamp: req.headers.get("x-wallet-timestamp"),
    signature: req.headers.get("x-wallet-signature"),
    rawBody,
  });
  if (!validSignature) {
    await recordSecurityEvent("wallet_topup_rejected", null, "signature_or_timestamp_invalid");
    return NextResponse.json({ ok: false, error: "REQUEST_REJECTED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  let event: unknown;
  try { event = JSON.parse(rawBody); } catch {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }
  if (!event || typeof event !== "object") return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  const body = event as Record<string, unknown>;
  const userId = typeof body.userId === "string" ? body.userId : "";
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const amountCents = body.amountCents;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || !/^[A-Za-z0-9._:-]{1,120}$/.test(eventId) || !Number.isSafeInteger(amountCents) || (amountCents as number) < 1 || (amountCents as number) > 2_147_483_647) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }
  try {
    const accepted = await db.transaction(async (tx) => {
      await tx.insert(walletAccounts).values({ userId, balanceCents: 0 }).onConflictDoNothing();
      await tx.select({ userId: walletAccounts.userId }).from(walletAccounts).where(eq(walletAccounts.userId, userId)).for("update").limit(1);
      const [entry] = await tx.insert(walletLedger).values({
        userId, entryType: "credit_topup", direction: "credit", amountCents: amountCents as number,
        currency: "USD", idempotencyKey: `topup:${eventId}`, description: "Wallet top-up",
      }).onConflictDoNothing({ target: walletLedger.idempotencyKey }).returning({ id: walletLedger.id });
      if (!entry) return false;
      await tx.update(walletAccounts).set({ balanceCents: sql`${walletAccounts.balanceCents} + ${amountCents as number}`, updatedAt: new Date() }).where(eq(walletAccounts.userId, userId));
      return true;
    });
    if (accepted) await recordSecurityEvent("wallet_topup_accepted", userId, "signed_topup_credited");
    return NextResponse.json({ ok: true, accepted }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await recordSecurityEvent("wallet_topup_rejected", userId, "topup_transaction_failed");
    return NextResponse.json({ ok: false, error: "TOPUP_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
