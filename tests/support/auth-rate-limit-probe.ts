/**
 * Child-process probe for SEC-01.
 *
 * Runs the real `enforceAuthRateLimit` for an identity-less auth route with NO
 * forwarding headers and an unreachable bucket store. A fail-closed limiter
 * must reject (it cannot know the client is under the limit); the previous
 * implementation returned "allowed" without touching any bucket at all.
 */
import { enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";

async function main(): Promise<void> {
  try {
    const allowed = await enforceAuthRateLimit(
      new Request("http://localhost:3000/api/auth/email/reset", { method: "POST" }),
      "sec-01-probe",
      undefined,
      { windowMs: 15 * 60_000, ipLimit: 20 },
    );
    process.stdout.write(JSON.stringify({ outcome: "resolved", allowed }));
  } catch {
    process.stdout.write(JSON.stringify({ outcome: "rejected" }));
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`probe failed: ${String(error)}\n`);
  process.exitCode = 1;
});
