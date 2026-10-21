export type CartApiResponse<T> = { ok?: boolean; data?: T; error?: string };

/** Fetch and validate the API envelope so an HTTP-200 `{ ok: false }` fails too. */
export async function fetchCartSummary<T>(fetcher: typeof fetch = fetch): Promise<T> {
  const response = await fetcher("/api/cart", { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as CartApiResponse<T> | null;
  if (!response.ok || !body?.ok || body.data === undefined) {
    throw new Error(body?.error || "Unable to load cart");
  }
  return body.data;
}
