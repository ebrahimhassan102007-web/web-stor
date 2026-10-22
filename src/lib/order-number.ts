import { randomBytes } from "node:crypto";

/**
 * Order reference generation.
 *
 * Format: `WS-` followed by 12 characters drawn uniformly from a 30-character
 * Crockford-style alphabet (no I, L, O, U, 0 or 1, so references are easy to
 * read back over the phone).
 *
 * Entropy: 12 × log2(30) ≈ 58.88 bits. The earlier implementation reduced a
 * random byte with `% 30`, which biased the first 16 characters of the
 * alphabet, and used only 10 characters (≈ 49 bits) while documents claimed
 * 58+ bits. This module fixes both: characters are sampled by rejection and
 * the length matches the documented entropy.
 *
 * References are identifiers, never authorisation: the public receipt only
 * uses them to confirm that an order exists.
 */
export const ORDER_REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const ORDER_REFERENCE_LENGTH = 12;
export const ORDER_REFERENCE_PREFIX = "WS-";

/** log2(alphabetSize ** length) — exported so docs/tests share one source. */
export const ORDER_REFERENCE_ENTROPY_BITS =
  ORDER_REFERENCE_LENGTH * Math.log2(ORDER_REFERENCE_ALPHABET.length);

type RandomBytes = (size: number) => Buffer;

/**
 * Returns `count` uniformly sampled alphabet characters.
 *
 * Bytes at or above the largest multiple of the alphabet size (240) are
 * discarded and redrawn, so every alphabet character has probability 1/30.
 */
export function randomReferenceChars(
  count: number,
  random: RandomBytes = randomBytes,
): string {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("count must be a positive integer");
  }

  const alphabetSize = ORDER_REFERENCE_ALPHABET.length;
  const unbiasedLimit = 256 - (256 % alphabetSize); // 240
  let result = "";

  while (result.length < count) {
    const bytes = random(Math.max(16, count - result.length));
    for (const byte of bytes) {
      if (byte >= unbiasedLimit) continue; // rejection sampling
      result += ORDER_REFERENCE_ALPHABET[byte % alphabetSize];
      if (result.length === count) break;
    }
  }

  return result;
}

/** Generates a new order reference, e.g. `WS-7K3M9QF2XTV4`. */
export function newOrderNumber(random?: RandomBytes): string {
  return `${ORDER_REFERENCE_PREFIX}${randomReferenceChars(
    ORDER_REFERENCE_LENGTH,
    random,
  )}`;
}
