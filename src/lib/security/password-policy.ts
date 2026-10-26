/**
 * Password policy (S-20). Length-only composition (12–128, per NIST SP
 * 800-63B) plus an offline denylist of widely-breached passwords and
 * trivial patterns. The full k-anonymity HIBP range check can be layered
 * on later behind an env flag; this check never sends password material
 * anywhere and works offline.
 */
const BREACHED_COMMON = new Set([
  "123456789012", "1234567890ab", "password1234", "password123!", "qwerty123456",
  "qwertyuiop12", "111111111111", "123123123123", "abc123456789", "letmein12345",
  "iloveyou1234", "admin1234567", "welcome12345", "monkey123456", "dragon123456",
  "football1234", "sunshine1234", "princess1234", "superman1234", "trustno12345",
  "000000000000", "987654321098", "1q2w3e4r5t6y", "q1w2e3r4t5y6", "p@ssw0rd1234",
  "passw0rd1234", "changeme1234", "secret123456", "master123456", "hello1234567",
]);

export function isAcceptablePassword(password: string): boolean {
  if (password.length < 12 || password.length > 128) return false;
  const lower = password.toLowerCase();
  if (BREACHED_COMMON.has(lower)) return false;
  // Trivial patterns: one repeated char, or a short repeating unit.
  if (/^(.)\1+$/.test(password)) return false;
  if (/^(.{1,4})\1{3,}$/.test(password)) return false;
  return true;
}
