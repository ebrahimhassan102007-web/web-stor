import assert from "node:assert/strict";
import test from "node:test";
import {
  newOrderNumber,
  ORDER_REFERENCE_ALPHABET,
  ORDER_REFERENCE_ENTROPY_BITS,
  ORDER_REFERENCE_LENGTH,
  randomReferenceChars,
} from "../src/lib/order-number";

test("E-Vora order references retain the EV prefix and have unbiased 58+ bit suffixes", () => {
  assert.equal(ORDER_REFERENCE_LENGTH, 12);
  assert.ok(ORDER_REFERENCE_ENTROPY_BITS > 58);
  for (let index = 0; index < 100; index += 1) {
    assert.match(newOrderNumber(), /^EV-[A-Z0-9]{12}$/);
    const suffix = randomReferenceChars(ORDER_REFERENCE_LENGTH);
    assert.equal(suffix.length, ORDER_REFERENCE_LENGTH);
    for (const character of suffix) {
      assert.ok(ORDER_REFERENCE_ALPHABET.includes(character));
    }
  }
});

test("order reference sampling rejects out-of-range bytes instead of applying modulo bias", () => {
  assert.equal(
    randomReferenceChars(1, () => Buffer.from([240, 0])),
    ORDER_REFERENCE_ALPHABET[0],
  );
  assert.equal(
    newOrderNumber((size) => Buffer.alloc(size, 0)),
    `EV-${ORDER_REFERENCE_ALPHABET[0]?.repeat(ORDER_REFERENCE_LENGTH)}`,
  );
  assert.throws(() => randomReferenceChars(0), /between 1 and 256/);
});
