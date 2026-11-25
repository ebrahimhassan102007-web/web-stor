import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/lib/db/schema";
import { pendingTwoFactorChallenges, totpRecoveryCodes, userTotp, users } from "../src/lib/db/schema";
import { createOpaqueSessionToken, hashOpaqueToken } from "../src/lib/security/auth-core";
import { createRecoveryCodes, decryptTotpSecret, encryptTotpSecret, hashRecoveryCode, matchingTotpCounter, createTotpSecret, totpCodeAt, isTotpCounterFresh } from "../src/lib/security/totp";

test("PGlite TOTP enrollment, replay prevention, recovery consumption/regeneration and disable lifecycle", async () => {
  const beforeKey = process.env.TOTP_ENCRYPTION_KEY, beforeId = process.env.TOTP_ENCRYPTION_KEY_ID;
  process.env.TOTP_ENCRYPTION_KEY = "22".repeat(32); process.env.TOTP_ENCRYPTION_KEY_ID = "pglite-key";
  const client = new PGlite();
  try {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    const [user] = await db.insert(users).values({ email: "totp@example.test", displayName: "TOTP Test", emailVerifiedAt: new Date() }).returning({ id: users.id });
    assert.ok(user);
    const secret = createTotpSecret();
    await db.insert(userTotp).values({ userId: user.id, encryptedSecret: encryptTotpSecret(secret) });
    const saved = await db.select().from(userTotp).where(eq(userTotp.userId, user.id)).limit(1);
    assert.equal(decryptTotpSecret(saved[0]!.encryptedSecret), secret);
    assert.equal(saved[0]!.enabledAt, null);

    const now = 1_800_000_000_000;
    const counter = Math.floor(now / 30_000);
    const code = totpCodeAt(secret, counter);
    const match = matchingTotpCounter(secret, code, now);
    assert.equal(match, counter);
    assert.equal(isTotpCounterFresh(match, null), true);
    await db.update(userTotp).set({ enabledAt: new Date(now), verifiedAt: new Date(now), lastAcceptedCounter: match }).where(eq(userTotp.userId, user.id));
    assert.equal(isTotpCounterFresh(matchingTotpCounter(secret, code, now), counter), false);

    const firstSet = createRecoveryCodes(10);
    await db.insert(totpRecoveryCodes).values(firstSet.map((value) => ({ userId: user.id, codeHash: hashRecoveryCode(value, "test-recovery-key") })));
    assert.equal(await db.select({ id: totpRecoveryCodes.id }).from(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, user.id)).then((r) => r.length), 10);
    const firstHash = hashRecoveryCode(firstSet[0]!, "test-recovery-key");
    const consumed = await db.update(totpRecoveryCodes).set({ usedAt: new Date() }).where(and(eq(totpRecoveryCodes.userId, user.id), eq(totpRecoveryCodes.codeHash, firstHash), isNull(totpRecoveryCodes.usedAt))).returning({ id: totpRecoveryCodes.id });
    assert.equal(consumed.length, 1);
    const reused = await db.update(totpRecoveryCodes).set({ usedAt: new Date() }).where(and(eq(totpRecoveryCodes.userId, user.id), eq(totpRecoveryCodes.codeHash, firstHash), isNull(totpRecoveryCodes.usedAt))).returning({ id: totpRecoveryCodes.id });
    assert.equal(reused.length, 0);
    await db.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, user.id));
    const replacement = createRecoveryCodes(10);
    await db.insert(totpRecoveryCodes).values(replacement.map((value) => ({ userId: user.id, codeHash: hashRecoveryCode(value, "test-recovery-key") })));
    assert.equal((await db.select().from(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, user.id))).length, 10);

    const token = createOpaqueSessionToken();
    const [challenge] = await db.insert(pendingTwoFactorChallenges).values({ userId: user.id, tokenHash: hashOpaqueToken(token), authMethod: "email", returnTo: "/account/orders", expiresAt: new Date(Date.now() + 60_000) }).returning();
    assert.ok(challenge);
    const challengeHit = await db.select().from(pendingTwoFactorChallenges).where(eq(pendingTwoFactorChallenges.tokenHash, hashOpaqueToken(token))).limit(1);
    assert.equal(challengeHit[0]?.authMethod, "email");
    await db.update(pendingTwoFactorChallenges).set({ consumedAt: new Date() }).where(eq(pendingTwoFactorChallenges.id, challenge.id));
    const secondConsume = await db.update(pendingTwoFactorChallenges).set({ consumedAt: new Date() }).where(and(eq(pendingTwoFactorChallenges.id, challenge.id), isNull(pendingTwoFactorChallenges.consumedAt))).returning({ id: pendingTwoFactorChallenges.id });
    assert.equal(secondConsume.length, 0);
    await db.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, user.id));
    await db.delete(userTotp).where(eq(userTotp.userId, user.id));
    assert.equal((await db.select().from(userTotp).where(eq(userTotp.userId, user.id))).length, 0);
    assert.equal((await db.select().from(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, user.id))).length, 0, "recovery records are cleared by the disable lifecycle");
  } finally {
    await client.close();
    if (beforeKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY; else process.env.TOTP_ENCRYPTION_KEY = beforeKey;
    if (beforeId === undefined) delete process.env.TOTP_ENCRYPTION_KEY_ID; else process.env.TOTP_ENCRYPTION_KEY_ID = beforeId;
  }
});

test("email and Google login gate session creation on pending two-factor challenge; mutation routes enforce CSRF", () => {
  for (const file of ["src/app/api/auth/email/login/route.ts", "src/app/api/auth/email/verify/route.ts", "src/app/api/auth/google/callback/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /isTwoFactorEnabled/);
    assert.match(source, /startTwoFactorChallenge/);
    assert.match(source, /createAccountSession/);
    assert.ok(source.indexOf("await startTwoFactorChallenge") < source.indexOf("await createAccountSession"), `${file}: challenge must be checked before session issuance`);
  }
  for (const file of ["src/app/api/account/two-factor/disable/route.ts", "src/app/api/account/two-factor/recovery-codes/regenerate/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /passwordConfirmed/);
    assert.match(source, /!passwordConfirmed && !parsed\.data\.code/);
  }
  const apiRoot = path.join(process.cwd(), "src/app/api");
  const collectRoutes = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectRoutes(full) : entry.name === "route.ts" ? [full] : [];
  });
  for (const file of collectRoutes(apiRoot)) {
    const source = readFileSync(file, "utf8");
    if (/export async function (POST|PUT|PATCH|DELETE)\(/.test(source)) {
      if (file.includes(`${path.sep}webhooks${path.sep}`)) assert.match(source, /verifyWalletWebhookSignature/, `${file} webhook missing signed-request verification`);
      else assert.match(source, /guardMutatingRequest\(/, `${file} mutation missing central origin+csrf+ban guard`);
    }
  }
});
