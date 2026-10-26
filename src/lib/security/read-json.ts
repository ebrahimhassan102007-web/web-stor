/**
 * Shared bounded JSON body reader for every JSON API route (S-07).
 *
 * Guarantees, including for chunked transfer encoding:
 *  - `Content-Type: application/json` is required (else `unsupported-media` → 415)
 *  - the body can never exceed `maxBytes` in memory (else `too-large` → 413)
 *  - malformed JSON yields `invalid` (→ 400), never a thrown stack
 * Prototype-polluting keys are harmless here: callers must still validate
 * with zod `.strict()`/explicit schemas before use (defense in depth).
 */
export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too-large" | "unsupported-media" | "invalid" };

export const JSON_BODY_STATUS = {
  "too-large": 413,
  "unsupported-media": 415,
  invalid: 400,
} as const;

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<JsonBodyResult> {
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return { ok: false, reason: "unsupported-media" };
  }

  const announced = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(announced) && announced > maxBytes) {
    return { ok: false, reason: "too-large" };
  }
  if (!request.body) return { ok: false, reason: "invalid" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
