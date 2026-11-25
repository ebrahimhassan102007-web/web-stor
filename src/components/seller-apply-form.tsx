"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useI18n } from "@/components/locale-provider";

type ApplyResponse = { ok?: boolean; error?: string };

/**
 * Customer → Merchant application (S-26).
 *
 * Rendered on `/seller` for any signed-in customer who has no seller profile
 * yet, including Google-only accounts. The application always lands `pending`.
 */
export function SellerApplyForm() {
  const { t } = useI18n();
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await csrfFetch("/api/seller/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName,
          storeSlug,
          storeDescription,
          phone,
          country,
          termsAccepted: terms,
        }),
      });
      const body = (await response.json().catch(() => null)) as ApplyResponse | null;
      if (!response.ok || !body?.ok) {
        setError(
          body?.error === "SELLER_SLUG_TAKEN"
            ? t.seller.errors.slugTaken
            : body?.error === "SELLER_ALREADY_REGISTERED"
              ? t.seller.errors.alreadyRegistered
              : body?.error === "RATE_LIMITED"
                ? t.seller.errors.rateLimited
                : t.seller.errors.generic,
        );
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError(t.seller.errors.generic);
    }
    setBusy(false);
  }

  if (done) {
    return (
      <p role="status" className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
        {t.seller.applied}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="seller-store-name" className="mb-1.5 block text-sm font-medium">
          {t.seller.storeName}
        </label>
        <input
          id="seller-store-name"
          type="text"
          required
          minLength={2}
          maxLength={120}
          value={storeName}
          onChange={(event) => setStoreName(event.target.value)}
          className="input-dark"
        />
      </div>
      <div>
        <label htmlFor="seller-store-slug" className="mb-1.5 block text-sm font-medium">
          {t.seller.storeSlug}
        </label>
        <input
          id="seller-store-slug"
          type="text"
          required
          minLength={3}
          maxLength={60}
          pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
          value={storeSlug}
          onChange={(event) => setStoreSlug(event.target.value)}
          dir="ltr"
          className="input-dark"
        />
        <p className="mt-1.5 text-xs text-muted">{t.seller.storeSlugHint}</p>
      </div>
      <div>
        <label htmlFor="seller-store-description" className="mb-1.5 block text-sm font-medium">
          {t.seller.storeDescription}
        </label>
        <textarea
          id="seller-store-description"
          rows={3}
          maxLength={600}
          value={storeDescription}
          onChange={(event) => setStoreDescription(event.target.value)}
          className="input-dark"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="seller-phone" className="mb-1.5 block text-sm font-medium">
            {t.seller.phone}
          </label>
          <input
            id="seller-phone"
            type="tel"
            required
            maxLength={32}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            dir="ltr"
            className="input-dark"
          />
        </div>
        <div>
          <label htmlFor="seller-country" className="mb-1.5 block text-sm font-medium">
            {t.seller.country}
          </label>
          <input
            id="seller-country"
            type="text"
            required
            minLength={2}
            maxLength={2}
            value={country}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
            dir="ltr"
            className="input-dark"
          />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={terms}
          onChange={(event) => setTerms(event.target.checked)}
          required
          className="mt-1"
        />
        <span>{t.seller.terms}</span>
      </label>
      {error && (
        <p role="alert" className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !terms} className="btn-primary w-full py-3">
        {busy ? t.seller.applying : t.seller.applyButton}
      </button>
    </form>
  );
}
