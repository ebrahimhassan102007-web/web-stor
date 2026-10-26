/** Session lifetime policy (S-09), pure and unit-testable. */
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

/** A session is live only inside BOTH its absolute TTL and the idle window. */
export function isSessionLive(
  session: { expiresAt: Date; lastUsedAt: Date },
  now: Date,
): boolean {
  return (
    session.expiresAt.getTime() > now.getTime() &&
    now.getTime() - session.lastUsedAt.getTime() <= SESSION_IDLE_MS
  );
}
