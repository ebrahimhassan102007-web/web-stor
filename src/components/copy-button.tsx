"use client";

import { useState } from "react";
import { useI18n } from "./locale-provider";

/** Small "Copy code" button for delivered digital keys. */
export function CopyButton({ code }: { code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard API unavailable (non-secure context) — select-and-copy fallback.
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // Give up silently; the code stays visible for manual copying.
      }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
        copied
          ? "border-success/50 bg-success/10 text-success"
          : "border-edge bg-[var(--input-bg)] hover:border-champagne/40 hover:text-champagne"
      }`}
    >
      {copied ? t.success.copied : `📋 ${t.success.copy}`}
    </button>
  );
}
