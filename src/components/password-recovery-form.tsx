"use client";

import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useI18n } from "@/components/locale-provider";
import { HoneypotField } from "@/components/honeypot-field";
import { HONEYPOT_FIELD } from "@/lib/security/honeypot";

export function ForgotPasswordForm() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [email, setEmail] = useState(""); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  // S-25 honeypot (invisible, zero layout impact).
  const [honeypot, setHoneypot] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(false);
    try { const res = await csrfFetch("/api/auth/email/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, locale, [HONEYPOT_FIELD]: honeypot }) }); if (!res.ok) throw new Error(); setDone(true); }
    catch { setError(true); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="glass-card mx-auto w-full max-w-md space-y-4 p-6 sm:p-8">
    <HoneypotField value={honeypot} onChange={setHoneypot} />
    <h1 className="title-luxe text-2xl">{ar ? "نسيت كلمة المرور؟" : "Forgot your password?"}</h1>
    <p className="text-sm leading-6 text-muted">{done ? (ar ? "إذا كان البريد مرتبطاً بحساب موثّق، ستصلك تعليمات إعادة التعيين." : "If the address belongs to a verified account, reset instructions will arrive by email.") : (ar ? "أدخل بريدك الإلكتروني وسنرسل رابطاً آمناً لإعادة التعيين." : "Enter your email and we’ll send a secure reset link.")}</p>
    {!done && <><label className="block text-sm">{ar ? "البريد الإلكتروني" : "Email address"}<input required type="email" maxLength={254} autoComplete="email" dir="ltr" className="input-dark mt-1" value={email} onChange={(e) => setEmail(e.target.value)} /></label>{error && <p role="alert" className="text-sm text-danger">{ar ? "تعذر إكمال الطلب الآن. حاول لاحقاً." : "Could not complete the request. Try again later."}</p>}<button disabled={busy} className="btn-primary w-full">{busy ? (ar ? "جارٍ الإرسال…" : "Sending…") : (ar ? "إرسال الرابط" : "Send reset link")}</button></>}
  </form>;
}

export function ResetPasswordForm() {
  const { locale } = useI18n(); const ar = locale === "ar";
  const [token, setToken] = useState(""); const [password, setPassword] = useState(""); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const candidate = fragment.get("token") ?? "";
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    const timer = window.setTimeout(() => setToken(candidate), 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(false);
    try { const res = await csrfFetch("/api/auth/email/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) }); if (!res.ok) throw new Error(); setDone(true); }
    catch { setError(true); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="glass-card mx-auto w-full max-w-md space-y-4 p-6 sm:p-8">
    <h1 className="title-luxe text-2xl">{ar ? "تعيين كلمة مرور جديدة" : "Choose a new password"}</h1>
    {done ? <p role="status" className="text-sm text-success">{ar ? "تم تحديث كلمة المرور. سجل الدخول من جديد." : "Password updated. Sign in with your new password."}</p> : <>
      {!token && <p className="text-sm text-muted">{ar ? "افتح الرابط الذي أرسلناه إلى بريدك." : "Open the reset link from your email."}</p>}
      <label className="block text-sm">{ar ? "كلمة المرور الجديدة" : "New password"}<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" dir="ltr" className="input-dark mt-1" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-danger">{ar ? "الرابط غير صالح أو منتهي الصلاحية، أو كلمة المرور غير مقبولة." : "The link is invalid/expired or the password does not meet policy."}</p>}
      <button disabled={busy || !token} className="btn-primary w-full">{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ كلمة المرور" : "Save password")}</button>
    </>}
  </form>;
}
