"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n/dictionary";

export function CopyIdeaButton({ text, locale }: { text: string; locale: Locale }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const ar = locale === "ar";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      window.setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("error");
      window.setTimeout(() => setState("idle"), 2200);
    }
  }

  return (
    <button type="button" onClick={copy} className="admin-copy-button" aria-live="polite">
      <span aria-hidden="true">{state === "copied" ? "✓" : state === "error" ? "!" : "⧉"}</span>
      {state === "copied" ? (ar ? "اتنسخ" : "Copied") : state === "error" ? (ar ? "انسخ يدويًا" : "Copy manually") : (ar ? "نسخ النص" : "Copy text")}
    </button>
  );
}
