import "server-only";

const MAX_AUTH_BODY_BYTES = 8 * 1024;

export type BodyResult = { ok: true; value: unknown } | { ok: false };

/** Read small auth JSON bodies with a hard byte cap, including chunked bodies. */
export async function readAuthJson(request: Request): Promise<BodyResult> {
  const announcedLength = Number(request.headers.get("content-length") ?? 0);
  if (announcedLength > MAX_AUTH_BODY_BYTES) return { ok: false };
  if (!request.body) return { ok: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AUTH_BODY_BYTES) {
        await reader.cancel();
        return { ok: false };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false };
  } finally {
    reader.releaseLock();
  }
}
