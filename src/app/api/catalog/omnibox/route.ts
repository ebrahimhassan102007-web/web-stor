import { getOmniboxIndex } from "@/lib/catalog";
import { handleUnexpected, jsonOk } from "@/lib/http";

/**
 * Public read-only search index for the header omnibox (Wave 6).
 *
 * GET only — nothing mutates, nothing is per-user, and the response carries
 * the same `private, no-store` + `Vary: Cookie` contract as every other API
 * response. The catalogue itself stays behind `src/lib/catalog.ts`, which owns
 * the preview fallback when the database is empty or unreachable.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(await getOmniboxIndex());
  } catch (error) {
    return handleUnexpected("catalog:omnibox", error);
  }
}
