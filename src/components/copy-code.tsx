"use client";

import { useState } from "react";

/** Renders a delivered digital code with reveal + copy controls. */
export function CopyCode({ code }: { code: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — user can select the revealed text manually.
      setRevealed(true);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code
        dir="ltr"
        className="rounded-lg border border-success/30 bg-success/10 px-3 py-1.5 font-mono text-sm font-bold tracking-wider text-success select-all"
      >
        {revealed ? code : "•".repeat(Math.min(code.length, 16))}
      </code>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="btn-ghost px-3 py-1.5 text-xs"
      >
        {revealed ? "إخفاء" : "إظهار"}
      </button>
      <button type="button" onClick={copy} className="btn-ghost px-3 py-1.5 text-xs">
        {copied ? "✓ تم النسخ" : "نسخ"}
      </button>
    </div>
  );
}
