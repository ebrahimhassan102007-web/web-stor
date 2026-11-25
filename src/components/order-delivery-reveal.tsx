"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useI18n } from "@/components/locale-provider";
import { CopyButton } from "@/components/copy-button";

type RevealResponse = { ok?: boolean; data?: { codes?: string[] } };

/**
 * Encrypted code vault card (Wave 6).
 *
 * Sealed state: a locked plate with a slow scan-line (decorative, CSS-only,
 * disabled under reduced motion). Revealed state: the codes rise into view with
 * the one-shot `vault-unseal` transition and each row gets a copy button that
 * flips to a green confirmation badge.
 *
 * The reveal itself is still the S-26 endpoint: owner-scoped, one-time, and it
 * is the only way a ciphertext ever becomes plaintext in the browser.
 */
export function OrderDeliveryReveal({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const revealed = codes.length > 0;

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
    <section
      aria-label={t.ordersHub.vaultTitle}
      data-vault-state={revealed ? "revealed" : "sealed"}
      className="command-panel relative mt-4 overflow-hidden p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-xs font-bold">
          <span aria-hidden="true">🔐</span>
          {t.ordersHub.vaultTitle}
        </p>
        <span className={revealed ? "badge-green" : "badge-neutral"}>
          {revealed ? t.ordersHub.revealed : t.ordersHub.sealed}
        </span>
      </div>

      {!revealed && (
        <div className="relative mt-3 overflow-hidden rounded-xl border border-edge bg-raised/50 p-3">
          <p className="text-xs leading-5 text-muted">{t.success.revealHint}</p>
          <p className="mt-1 text-[0.68rem] leading-5 text-muted">{t.ordersHub.vaultHint}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void reveal()}
            className="btn-primary mt-3 min-h-11 px-4 py-2.5"
          >
            {busy ? t.success.revealingCodes : t.success.revealCodes}
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-primary">{t.success.revealFailed}</p>}

      {revealed && (
        <ul className="vault-unseal mt-3 grid gap-2 sm:grid-cols-2" aria-label={t.success.yourCodes}>
          {codes.map((code, index) => (
            <li
              key={`${index}-${code}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-success/[0.06] p-3 font-mono text-sm"
              dir="ltr"
            >
              <code className="break-all">{code}</code>
              <CopyButton code={code} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
