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
