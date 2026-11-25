import "server-only";
import { eq } from "drizzle-orm";
import { db, userTotp } from "@/lib/db";
import { getCurrentAccountUser, type AccountUser } from "@/lib/security/account-session";
import { evaluateSellerGates, type SellerGateResult, type SellerStatus } from "@/lib/marketplace/seller-gate";
import { findSellerByUserId, type SellerProfileRow } from "@/lib/marketplace/seller-store";

/**
 * Resolve the authenticated merchant context for `/seller` and `/api/seller/**`.
 *
 * Three facts are read fresh from the database on every request — never from a
 * cookie, a JWT claim or a request body:
 *   - the signed-in account (`users.id`);
 *   - whether TOTP 2FA is both enabled and verified;
 *   - the seller profile (and its `status`) owned by that account.
 */
export type SellerContext = {
  user: AccountUser;
  seller: SellerProfileRow | undefined;
  twoFactorEnabled: boolean;
  gates: SellerGateResult;
};

export async function isTwoFactorEnabledForUser(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ enabledAt: userTotp.enabledAt, verifiedAt: userTotp.verifiedAt })
    .from(userTotp)
    .where(eq(userTotp.userId, userId))
    .limit(1);
  return Boolean(row?.enabledAt && row.verifiedAt);
}

export async function loadSellerContext(): Promise<SellerContext | null> {
  const user = await getCurrentAccountUser();
  if (!user) return null;

  const [twoFactorEnabled, seller] = await Promise.all([
    isTwoFactorEnabledForUser(user.id),
    findSellerByUserId(db, user.id),
  ]);
  const gates = evaluateSellerGates({
    emailVerified: user.emailVerifiedAt !== null,
    twoFactorEnabled,
    sellerStatus: (seller?.status ?? null) as SellerStatus,
  });

  return { user, seller, twoFactorEnabled, gates };
}
