"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useI18n } from "@/components/locale-provider";

export function AccountPasswordForm({ enabled }: { enabled: boolean }) {
  const { locale } = useI18n(); const ar = locale === "ar";
  const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [busy, setBusy] = useState(false); const [status, setStatus] = useState<"done" | "error" | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setStatus(null);
    try { const response = await csrfFetch("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) }); if (!response.ok) throw new Error(); setCurrentPassword(""); setNewPassword(""); setStatus("done"); }
    catch { setStatus("error"); } finally { setBusy(false); }
  }
  if (!enabled) return null;
  return <form onSubmit={submit} className="mt-6 rounded-2xl border border-edge bg-raised/40 p-5">
    <h3 className="font-bold">{ar ? "تغيير كلمة المرور" : "Change password"}</h3>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">{ar ? "كلمة المرور الحالية" : "Current password"}<input type="password" autoComplete="current-password" required className="input-dark mt-1" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
      <label className="text-sm">{ar ? "كلمة المرور الجديدة (12 حرفاً على الأقل)" : "New password (at least 12 characters)"}<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="input-dark mt-1" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
    </div>
    {status && <p role={status === "error" ? "alert" : "status"} className={`mt-3 text-sm ${status === "error" ? "text-danger" : "text-success"}`}>{status === "error" ? (ar ? "تعذر تغيير كلمة المرور. تحقق من كلمة المرور الحالية والسياسة." : "Could not change password. Check the current password and policy.") : (ar ? "تم تغيير كلمة المرور وإنهاء الجلسات الأخرى." : "Password changed; other sessions were revoked.")}</p>}
    <button disabled={busy} className="btn-ghost mt-4 px-4 py-2.5">{busy ? (ar ? "جارٍ التحديث…" : "Updating…") : (ar ? "تحديث كلمة المرور" : "Update password")}</button>
  </form>;
}
