export type CartApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

/**
 * Loads the current cart summary and rejects every failure mode:
 *  - network / HTTP errors (`!response.ok`),
 *  - a JSON body with `{ ok: false }` (which the API returns with a non-2xx
 *    status, but is also handled defensively if a proxy rewrites it),
 *  - a 2xx response with a missing/`undefined` `data` payload,
 *  - a non-JSON body.
 *
 * The fetcher is injectable so the behaviour can be unit tested without a
 * browser or server.
 */
export async function fetchCartSummary<T>(
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher("/api/cart", { cache: "no-store" });
  const body = (await response
    .json()
    .catch(() => null)) as CartApiResponse<T> | null;

  if (!response.ok || !body?.ok || body.data === undefined) {
    throw new Error(body?.error || "Unable to load cart");
  }

  return body.data;
}
