"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useI18n } from "@/components/locale-provider";
import { CopyButton } from "@/components/copy-button";

type RevealResponse = { ok?: boolean; data?: { codes?: string[] } };

export function OrderDeliveryReveal({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function reveal() {
    if (busy || codes.length) return;
    setBusy(true);
    setError(false);
    try {
      const response = await csrfFetch(`/api/account/orders/${encodeURIComponent(orderId)}/reveal`, { method: "POST" });
      const body = await response.json() as RevealResponse;
      if (!response.ok || !body.ok || !body.data?.codes?.length) throw new Error("reveal failed");
      setCodes(body.data.codes);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-edge bg-raised/50 p-4">
      <p className="text-xs leading-5 text-muted">{t.success.revealHint}</p>
      {!codes.length && <button type="button" disabled={busy} onClick={() => void reveal()} className="btn-primary mt-3 px-4 py-2.5">
        {busy ? t.success.revealingCodes : t.success.revealCodes}
      </button>}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{t.success.revealFailed}</p>}
      {!!codes.length && <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label={t.success.yourCodes}>
        {codes.map((code, index) => <li key={`${index}-${code}`} className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-card p-3 font-mono text-sm" dir="ltr">
          <code className="break-all">{code}</code><CopyButton code={code} />
        </li>)}
      </ul>}
    </div>
  );
}
