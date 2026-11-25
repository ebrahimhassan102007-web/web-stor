"use client";

import { HONEYPOT_FIELD } from "@/lib/security/honeypot";

/**
 * Invisible honeypot input (S-25).
 *
 * Deliberately renders **no visible pixels and no layout shift**: it is a
 * zero-size, absolutely positioned node pushed far off-screen (`-left-[9999px]`),
 * hidden from assistive technology, removed from the tab order and exempt from
 * autofill. A human never sees, focuses or fills it; form-filling bots do.
 *
 * Existing storefront markup and selectors are untouched — the node is a
 * sibling of the real fields, not a wrapper around them.
 */
export function HoneypotField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `hp-${HONEYPOT_FIELD}`;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-auto -left-[9999px] h-px w-px overflow-hidden"
    >
      <label htmlFor={id}>Company website</label>
      <input
        id={id}
        name={HONEYPOT_FIELD}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-hidden="true"
      />
    </div>
  );
}
