import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpaqueSessionToken,
  createVerificationCode,
  hashOpaqueToken,
  hashPassword,
  hashVerificationCode,
  isOpaqueToken,
  safeReturnPath,
  verifyPassword,
  verifyVerificationCode,
} from "../src/lib/security/auth-core";

test("email verification codes are six decimal digits and HMAC-bound to the account", () => {
  for (let i = 0; i < 100; i += 1) {
    assert.match(createVerificationCode(), /^\d{6}$/);
  }

  const userId = "account-1";
  const secret = "unit-test-auth-secret-that-is-at-least-32-characters";
  const code = "004209";
  const digest = hashVerificationCode(userId, code, secret);
  assert.equal(digest.length, 64);
  assert.equal(verifyVerificationCode(userId, code, digest, secret), true);
  assert.equal(verifyVerificationCode("account-2", code, digest, secret), false);
  assert.equal(verifyVerificationCode(userId, "004208", digest, secret), false);
  assert.equal(verifyVerificationCode(userId, "4209", digest, secret), false);
});

test("session cookies use unpredictable opaque tokens and only their digest is stable", () => {
  const first = createOpaqueSessionToken();
  const second = createOpaqueSessionToken();
  assert.notEqual(first, second);
  assert.equal(isOpaqueToken(first), true);
  assert.equal(isOpaqueToken("not-a-token"), false);
  assert.equal(hashOpaqueToken(first), hashOpaqueToken(first));
  assert.notEqual(hashOpaqueToken(first), hashOpaqueToken(second));
});

test("password hashes use per-password salts and verify without storing plaintext", async () => {
  const password = "a-long-and-unique-password!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$16384\$8\$1\$/);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("incorrect-password", first), false);
  assert.equal(await verifyPassword(password, null), false);
});

test("OAuth return paths reject external and protocol-relative redirects", () => {
  assert.equal(safeReturnPath("/account?tab=profile"), "/account?tab=profile");
  assert.equal(safeReturnPath("https://evil.example"), "/account");
  assert.equal(safeReturnPath("//evil.example/path"), "/account");
  assert.equal(safeReturnPath("/\\\\evil.example"), "/account");
  assert.equal(safeReturnPath("/account\nhttps://evil.example"), "/account");
  assert.equal(safeReturnPath(undefined), "/account");
});
