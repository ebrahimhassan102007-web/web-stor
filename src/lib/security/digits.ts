/** Convert Arabic-Indic and Eastern Arabic-Indic numerals to ASCII digits. */
export function normalizeVerificationDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
    const codePoint = digit.charCodeAt(0);
    const asciiCodePoint =
      codePoint >= 0x06f0
        ? codePoint - 0x06f0 + 0x30
        : codePoint - 0x0660 + 0x30;
    return String.fromCharCode(asciiCodePoint);
  });
}

// C0/C1 controls, zero-width formatting characters, and bidi overrides/isolate
// controls can make identifiers visually misleading or bypass text policies.
const INVISIBLE_OR_BIDI =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g;

/** Normalize user-visible identifiers/text before validation and rate-limiting. */
export function normalizeSecurityInput(value: string): string {
  return normalizeVerificationDigits(value.normalize("NFKC"))
    .replace(INVISIBLE_OR_BIDI, "")
    .trim();
}
