"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useI18n } from "@/components/locale-provider";
import { DISPUTE_REASONS, DISPUTE_REASON_COPY, type DisputeReason } from "@/lib/marketplace/dispute-copy";

/**
 * Buyer-side vault actions (S-26):
 *  - destroy a revealed secret permanently (burn-after-reveal);
 *  - open a delivery dispute, which freezes the seller's payout for the order.
 *
 * The controls are only rendered for eligible orders; the API re-validates
 * ownership, order status and the one-open-dispute rule regardless.
 */
type ApiBody = { ok?: boolean; error?: string; data?: Record<string, unknown> };

export function VaultShredButton({ orderId }: { orderId: string }) {
  const { locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(false);
  const ar = locale === "ar";

  async function shred() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await csrfFetch(`/api/account/orders/${encodeURIComponent(orderId)}/shred`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as ApiBody | null;
      if (!response.ok || !body?.ok) {
        setError(true);
        setBusy(false);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError(true);
    }
    setBusy(false);
  }

  if (done) {
    return (
      <p role="status" className="text-xs text-success">
        {ar ? "تم حذف الكود نهائياً من الخزنة." : "The code was permanently destroyed in the vault."}
      </p>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="btn-ghost px-3 py-2 text-xs">
          {ar ? "حذف الكود نهائياً" : "Destroy code permanently"}
        </button>
      ) : (
        <>
          <span className="text-xs text-muted">
            {ar ? "لا يمكن التراجع. تأكيد؟" : "This cannot be undone. Confirm?"}
          </span>
          <button
            type="button"
            onClick={shred}
            disabled={busy}
            className="btn-primary px-3 py-2 text-xs"
          >
            {busy ? (ar ? "جارٍ الحذف…" : "Destroying…") : ar ? "تأكيد الحذف" : "Yes, destroy"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="btn-ghost px-3 py-2 text-xs"
          >
            {ar ? "إلغاء" : "Cancel"}
          </button>
        </>
      )}
      {error && (
        <span role="alert" className="text-xs text-primary">
          {ar ? "تعذر إتمام العملية." : "That action could not be completed."}
        </span>
      )}
    </span>
  );
}

export function OrderDisputeForm({
  orderId,
  openDispute,
}: {
  orderId: string;
  openDispute: boolean;
}) {
  const { locale } = useI18n();
  const router = useRouter();
  const ar = locale === "ar";
  const [reason, setReason] = useState<DisputeReason>("not_received");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (openDispute) {
    return (
      <p className="mt-2 text-xs text-amber-500">
        {ar
          ? "فيه نزاع مفتوح على الطلب ده، وأرباح التاجر محتجزة لحد ما المالك يرد."
          : "A dispute is open on this order and the seller's payout is frozen until the owner resolves it."}
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className="mt-2 text-xs text-success">
        {ar ? "تم فتح النزاع، وفريق E‑Vora هيراجعه." : "Dispute opened. The E-Vora owner will review it."}
      </p>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await csrfFetch(`/api/account/orders/${encodeURIComponent(orderId)}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details }),
      });
      const body = (await response.json().catch(() => null)) as ApiBody | null;
      if (!response.ok || !body?.ok) {
        setError(
          body?.error === "RATE_LIMITED"
            ? ar
              ? "محاولات كتير، جرّب بعد شوية."
              : "Too many attempts. Please try again later."
            : body?.error === "DISPUTE_ALREADY_OPEN"
              ? ar
                ? "فيه نزاع مفتوح بالفعل."
                : "A dispute is already open."
              : ar
                ? "تعذر فتح النزاع."
                : "The dispute could not be opened.",
        );
        setBusy(false);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError(ar ? "تعذر فتح النزاع." : "The dispute could not be opened.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2" noValidate>
      <label className="text-xs text-muted">
        <span className="mb-1 block">{ar ? "سبب النزاع" : "Dispute reason"}</span>
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as DisputeReason)}
          className="input-dark px-2 py-2 text-xs"
        >
          {DISPUTE_REASONS.map((value) => (
            <option key={value} value={value}>
              {ar ? DISPUTE_REASON_COPY[value].ar : DISPUTE_REASON_COPY[value].en}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-[12rem] flex-1 text-xs text-muted">
        <span className="mb-1 block">{ar ? "تفاصيل (اختياري)" : "Details (optional)"}</span>
        <input
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={1000}
          className="input-dark px-2 py-2 text-xs"
        />
      </label>
      <button type="submit" disabled={busy} className="btn-ghost px-3 py-2 text-xs">
        {busy ? (ar ? "جارٍ الإرسال…" : "Sending…") : ar ? "فتح نزاع" : "Open dispute"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-primary">
          {error}
        </span>
      )}
    </form>
  );
}
