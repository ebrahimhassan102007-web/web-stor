import { randomBytes } from "node:crypto";

/** 30 easy-to-read characters, excluding I, L, O, U, 0 and 1. */
export const ORDER_REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const ORDER_REFERENCE_LENGTH = 12;
/** Keep the current E-Vora order prefix; WS- remains accepted for old orders. */
export const ORDER_REFERENCE_PREFIX = "EV-";
export const ORDER_REFERENCE_ENTROPY_BITS =
  ORDER_REFERENCE_LENGTH * Math.log2(ORDER_REFERENCE_ALPHABET.length);

type RandomBytes = (size: number) => Buffer;

/** Uniformly sample the alphabet with rejection sampling (no modulo bias). */
export function randomReferenceChars(
  count: number,
  random: RandomBytes = randomBytes,
): string {
  if (!Number.isInteger(count) || count <= 0 || count > 256) {
    throw new Error("count must be an integer between 1 and 256");
  }

  const alphabetSize = ORDER_REFERENCE_ALPHABET.length;
  const unbiasedLimit = 256 - (256 % alphabetSize);
  let result = "";
  while (result.length < count) {
    const bytes = random(Math.max(16, count - result.length));
    for (const byte of bytes) {
      if (byte >= unbiasedLimit) continue;
      result += ORDER_REFERENCE_ALPHABET[byte % alphabetSize];
      if (result.length === count) break;
    }
  }
  return result;
}

export function newOrderNumber(random?: RandomBytes): string {
  return `${ORDER_REFERENCE_PREFIX}${randomReferenceChars(
    ORDER_REFERENCE_LENGTH,
    random,
  )}`;
}
