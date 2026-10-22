"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/locale-provider";

export function SignOutButton() {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error("sign-out-failed");
      router.replace("/");
      router.refresh();
    } catch {
      setBusy(false);
      setError(true);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <p role="alert" className="text-xs text-primary">{t.auth.errors.generic}</p>}
      <button type="button" onClick={signOut} disabled={busy} className="btn-ghost">
        {busy ? t.auth.signingOut : t.auth.signOut}
      </button>
    </div>
  );
}
