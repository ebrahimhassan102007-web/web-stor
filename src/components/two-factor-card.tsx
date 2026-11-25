"use client";

import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useI18n } from "@/components/locale-provider";
import { CopyButton } from "@/components/copy-button";

type Api<T> = { ok?: boolean; data?: T };
type Setup = { secret: string; uri: string };

export function TwoFactorCard() {
  const { t } = useI18n();
  const copy = t.auth.twoFactor;
  const [enabled, setEnabled] = useState(false);
  const [passwordLogin, setPasswordLogin] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void csrfFetch("/api/account/two-factor", { cache: "no-store" })
      .then((r) => r.json() as Promise<Api<{ enabled: boolean; passwordLoginEnabled: boolean }>>)
      .then((body) => { if (active && body.data) { setEnabled(body.data.enabled); setPasswordLogin(body.data.passwordLoginEnabled); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  async function action(path: string, payload: Record<string, string>) {
    setBusy(true); setError(false); setNotice("");
    try {
      const response = await csrfFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as Api<{ secret?: string; uri?: string; enabled?: boolean; disabled?: boolean; recoveryCodes?: string[] }>;
      if (!response.ok || !body.ok || !body.data) throw new Error("action failed");
      if (body.data.secret && body.data.uri) setSetup({ secret: body.data.secret, uri: body.data.uri });
      if (body.data.enabled) { setEnabled(true); setSetup(null); setCodes(body.data.recoveryCodes ?? []); setNotice(copy.enabledMessage); }
      if (body.data.disabled) { setEnabled(false); setSetup(null); setCodes([]); setNotice(copy.disabled); }
      if (body.data.recoveryCodes && !body.data.enabled) setCodes(body.data.recoveryCodes);
      setCode(""); setPassword("");
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  return <section className="mt-6 rounded-2xl border border-edge bg-raised/40 p-5 sm:p-6" aria-labelledby="two-factor-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 id="two-factor-title" className="text-lg font-bold">{copy.title}</h3><p className="mt-1 max-w-xl text-sm text-muted">{copy.description}</p></div>
      <span className={enabled ? "badge-green" : "badge-neutral"}>{enabled ? copy.enabled : copy.disabled}</span>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{copy.error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-success">{notice}</p>}
    {!enabled && !setup && <div className="mt-4 flex flex-wrap items-end gap-3">
      {passwordLogin && <label className="min-w-56 flex-1 text-sm">{copy.confirmPassword}<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-dark mt-1 w-full" /></label>}
      <button type="button" disabled={busy} onClick={() => void action("/api/account/two-factor/setup", { ...(password ? { password } : {}) })} className="btn-primary px-4 py-2.5">{busy ? t.auth.working : copy.setup}</button>
    </div>}
    {setup && <div className="mt-4 space-y-3 rounded-xl border border-edge bg-card p-4">
      <p className="text-sm text-muted">{copy.setupHint}</p>
      <label className="block text-xs font-semibold text-muted">{copy.manualKey}<div className="mt-1 flex items-center justify-between gap-2 rounded-lg bg-raised p-3 font-mono text-sm"><code dir="ltr" className="break-all">{setup.secret}</code><CopyButton code={setup.secret} /></div></label>
      <label className="block text-xs font-semibold text-muted">otpauth URI<div className="mt-1 break-all rounded-lg bg-raised p-3 font-mono text-xs" dir="ltr">{setup.uri}</div></label>
      <div className="flex flex-wrap items-end gap-3"><label className="min-w-44 flex-1 text-sm">{copy.code}<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} className="input-dark mt-1 w-full" dir="ltr" /></label>
        <button type="button" disabled={busy || code.length !== 6} onClick={() => void action("/api/account/two-factor/enable", { code })} className="btn-primary px-4 py-2.5">{copy.enable}</button></div>
    </div>}
    {enabled && <div className="mt-4 space-y-3">
      <p className="text-sm text-muted">{copy.confirmationChoice}</p>
      <label className="block text-sm">{copy.code}<input inputMode="text" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="input-dark mt-1 w-full sm:max-w-sm" dir="ltr" /></label>
      {passwordLogin && <label className="block text-sm">{copy.confirmPassword}<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-dark mt-1 w-full sm:max-w-sm" /></label>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || (!code && !password)} onClick={() => void action("/api/account/two-factor/recovery-codes/regenerate", { ...(code ? { code } : {}), ...(password ? { password } : {}) })} className="btn-ghost px-4 py-2.5">{copy.regenerate}</button>
        <button type="button" disabled={busy || (!code && !password)} onClick={() => { if (window.confirm(copy.disable)) void action("/api/account/two-factor/disable", { ...(code ? { code } : {}), ...(password ? { password } : {}) }); }} className="btn-ghost px-4 py-2.5 text-danger">{copy.disable}</button></div>
    </div>}
    {codes.length > 0 && <div className="mt-4 rounded-xl border border-warning/40 bg-warning/5 p-4"><h4 className="font-bold">{copy.recoveryTitle}</h4><p className="mt-1 text-sm text-muted">{copy.recoveryHint}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{codes.map((value) => <div key={value} className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-card p-2 font-mono text-sm" dir="ltr"><code>{value}</code><CopyButton code={value} /></div>)}</div></div>}
  </section>;
}
