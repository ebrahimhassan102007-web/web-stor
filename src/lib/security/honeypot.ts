/**
 * Invisible honeypot field (S-25).
 *
 * A hidden, off-screen input that no human can see or focus. Every form that
 * creates an account, spends money or triggers email includes it; a non-empty
 * value means automation, and the route answers `403` while banning the actor.
 *
 * The field is intentionally:
 *  - `aria-hidden` and removed from the tab order (`tabIndex={-1}`),
 *  - `autoComplete="off"` so browser autofill never fills it,
 *  - positioned far off-screen with zero size, so it causes **no layout shift**
 *    and no visual change whatsoever,
 *  - named like a plausible profile field, which is what makes bots fill it.
 */

export const HONEYPOT_FIELD = "company_website";

/** True when the honeypot field is present and not empty. */
export function isHoneypotTripped(body: unknown): boolean {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return false;
  if (!Object.prototype.hasOwnProperty.call(body, HONEYPOT_FIELD)) return false;
  try {
    const value = (body as Record<string, unknown>)[HONEYPOT_FIELD];
    if (value === null || value === undefined) return false;
    return typeof value === "string" ? value.trim() !== "" : true;
  } catch {
    return true;
  }
}
