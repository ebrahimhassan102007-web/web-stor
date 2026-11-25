import assert from "node:assert/strict";
import test from "node:test";
import { createCsrfToken, isValidCsrfToken, verifyDoubleSubmitCsrf } from "../src/lib/security/csrf-token";
import { createRecoveryCodes, decryptTotpSecret, encryptTotpSecret, hashRecoveryCode, isTotpCounterFresh, matchingTotpCounter, totpCodeAt, verifyRecoveryCode } from "../src/lib/security/totp";

const key = "unit-test-auth-secret-material-at-least-32-bytes";

test("signed double-submit CSRF rejects missing, forged and mismatched values", () => {
  const token = createCsrfToken(key);
  assert.equal(isValidCsrfToken(token, key), true);
  assert.equal(verifyDoubleSubmitCsrf(undefined, token, key), false);
  assert.equal(verifyDoubleSubmitCsrf(token, null, key), false);
  assert.equal(verifyDoubleSubmitCsrf(token, `${token}x`, key), false);
  assert.equal(verifyDoubleSubmitCsrf(`${token.slice(0, -1)}0`, token, key), false);
  assert.equal(verifyDoubleSubmitCsrf(token, token, key), true);
  assert.equal(isValidCsrfToken(token, `${key}-wrong`), false);
});

test("TOTP has RFC 6238-compatible values and accepts a counter once only", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totpCodeAt(secret, 1), "287082"); // t=59s / 30s
  const now = 59_000;
  const counter = matchingTotpCounter(secret, totpCodeAt(secret, 1), now);
  assert.equal(counter, 1);
  assert.equal(isTotpCounterFresh(counter, 0), true);
  assert.equal(isTotpCounterFresh(counter, 1), false, "persisted counter rejects replay");
  assert.equal(matchingTotpCounter(secret, "000000", now), null);
});

test("TOTP encryption authenticates ciphertext and key id; recovery codes are one-time candidates", () => {
  const oldKey = process.env.TOTP_ENCRYPTION_KEY;
  const oldId = process.env.TOTP_ENCRYPTION_KEY_ID;
  process.env.TOTP_ENCRYPTION_KEY = "11".repeat(32);
  process.env.TOTP_ENCRYPTION_KEY_ID = "wave2-test-key";
  try {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const envelope = encryptTotpSecret(secret);
    assert.equal(decryptTotpSecret(envelope), secret);
    assert.throws(() => decryptTotpSecret(`${envelope.slice(0, -1)}x`));
    process.env.TOTP_ENCRYPTION_KEY_ID = "rotated-key";
    assert.throws(() => decryptTotpSecret(envelope));
  } finally {
    if (oldKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY; else process.env.TOTP_ENCRYPTION_KEY = oldKey;
    if (oldId === undefined) delete process.env.TOTP_ENCRYPTION_KEY_ID; else process.env.TOTP_ENCRYPTION_KEY_ID = oldId;
  }
  const codes = createRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  const digest = hashRecoveryCode(codes[0]!, key);
  assert.equal(verifyRecoveryCode(codes[0]!, digest, key), true);
  assert.equal(verifyRecoveryCode(codes[0]!, digest, `${key}!`), false);
});
