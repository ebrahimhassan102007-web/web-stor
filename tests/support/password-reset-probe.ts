/**
 * Child-process probe for SEC-02.
 *
 * `src/lib/security/password-reset.ts` imports the `server-only` marker, so it
 * is exercised here the way Next.js loads it. No DATABASE_URL is provided and
 * the no-network tripwire is preloaded: a malformed token must be rejected
 * from its shape alone, without any database connection attempt (let alone a
 * scrypt run).
 */
import { isConsumablePasswordReset } from "@/lib/security/password-reset";

async function main(): Promise<void> {
  const results = {
    empty: await isConsumablePasswordReset(""),
    tooShort: await isConsumablePasswordReset("abc"),
    wrongAlphabet: await isConsumablePasswordReset("!".repeat(43)),
    wrongLength: await isConsumablePasswordReset("a".repeat(42)),
    tooLong: await isConsumablePasswordReset("a".repeat(44)),
  };
  process.stdout.write(JSON.stringify(results));
}

main().catch((error: unknown) => {
  process.stderr.write(`probe failed: ${String(error)}\n`);
  process.exitCode = 1;
});
