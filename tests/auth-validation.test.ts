import assert from "node:assert/strict";
import test from "node:test";
import { emailVerificationSchema } from "../src/lib/security/auth-validation";

test("verification input accepts Arabic-Indic digits and normalizes them to ASCII", () => {
  const easternArabicIndic = emailVerificationSchema.safeParse({
    email: " USER@example.com ",
    code: "٠١٢٣٤٥",
  });
  const arabicIndic = emailVerificationSchema.safeParse({
    email: "user@example.com",
    code: "۰۱۲۳۴۵",
  });

  assert.equal(easternArabicIndic.success, true);
  assert.equal(arabicIndic.success, true);
  if (easternArabicIndic.success && arabicIndic.success) {
    assert.equal(easternArabicIndic.data.email, "user@example.com");
    assert.equal(easternArabicIndic.data.code, "012345");
    assert.equal(arabicIndic.data.code, "012345");
  }
  assert.equal(
    emailVerificationSchema.safeParse({
      email: "user@example.com",
      code: "٠١٢٣٤",
    }).success,
    false,
  );
});
