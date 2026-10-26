import "server-only";
import { readJsonBody } from "@/lib/security/read-json";

const MAX_AUTH_BODY_BYTES = 8 * 1024;

export type BodyResult = { ok: true; value: unknown } | { ok: false };

/**
 * Read small auth JSON bodies with a hard byte cap, including chunked bodies.
 * Delegates to the shared bounded reader (S-07) so auth and commerce routes
 * enforce identical Content-Type/size rules.
 */
export async function readAuthJson(request: Request): Promise<BodyResult> {
  const result = await readJsonBody(request, MAX_AUTH_BODY_BYTES);
  return result.ok ? { ok: true, value: result.value } : { ok: false };
}
