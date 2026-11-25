/**
 * Shared bounded JSON body reader for every JSON API route (S-07).
 *
 * Rejects oversized streamed bodies before parsing, enforces a shallow
 * structural limit, and strips prototype-mutating keys. Callers must still
 * validate values with route-specific schemas.
 */
export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too-large" | "unsupported-media" | "invalid" | "too-deep" };

export const JSON_BODY_STATUS = {
  "too-large": 413,
  "unsupported-media": 415,
  invalid: 400,
  "too-deep": 400,
} as const;

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Count JSON containers without being confused by braces in quoted strings. */
function exceedsNestingDepth(text: string, maxDepth: number): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") {
      depth += 1;
      if (depth > maxDepth) return true;
    } else if (char === "}" || char === "]") {
      depth -= 1;
    }
  }
  return false;
}

/** Build safe, ordinary objects while omitting dangerous property names. */
function stripDangerousKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDangerousKeys);
  if (value === null || typeof value !== "object") return value;
  const safe: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!BLOCKED_KEYS.has(key)) safe[key] = stripDangerousKeys(child);
  }
  return safe;
}

export async function readJsonBody(
  request: Request,
  maxBytes = 16 * 1024,
  maxDepth = 32,
): Promise<JsonBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 1024 * 1024) {
    throw new RangeError("maxBytes must be an integer between 1 and 1048576");
  }
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 256) {
    throw new RangeError("maxDepth must be an integer between 1 and 256");
  }

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
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (exceedsNestingDepth(text, maxDepth)) return { ok: false, reason: "too-deep" };
    return { ok: true, value: stripDangerousKeys(JSON.parse(text) as unknown) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
