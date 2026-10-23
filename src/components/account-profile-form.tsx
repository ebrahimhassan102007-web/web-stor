"use client";

import { useState } from "react";
import { useI18n } from "@/components/locale-provider";

export function AccountProfileForm({
  initialName,
  email,
  emailVerified,
  googleLinked,
  passwordLoginEnabled,
}: {
  initialName: string;
  email: string;
  emailVerified: boolean;
  googleLinked: boolean;
  passwordLoginEnabled: boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [messageStatus, setMessageStatus] = useState<"saved" | "error" | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessageStatus(null);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error("profile-update-failed");
      setName(body.data.displayName);
      setMessageStatus("saved");
    } catch {
      setMessageStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="account-name" className="mb-1.5 block text-sm font-medium">
          {t.auth.profileName}
        </label>
        <input
          id="account-name"
          name="displayName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          minLength={2}
          maxLength={128}
          required
          className="input-dark"
        />
      </div>

      <div>
        <label htmlFor="account-email" className="mb-1.5 block text-sm font-medium">
          {t.auth.profileEmail}
        </label>
        <input
          id="account-email"
          type="email"
          value={email}
          readOnly
          dir="ltr"
          className="input-dark opacity-75"
        />
        <p className={`mt-2 text-xs ${emailVerified ? "text-success" : "text-primary"}`}>
          {emailVerified ? t.auth.emailVerified : t.auth.emailNotVerified}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {passwordLoginEnabled && <span className="badge-neutral">{t.auth.emailSignIn}</span>}
        {googleLinked && <span className="badge-neutral">{t.auth.googleConnected}</span>}
      </div>

      {messageStatus && (
        <p role={messageStatus === "error" ? "alert" : "status"} className={`text-sm ${messageStatus === "error" ? "text-primary" : "text-success"}`}>
          {messageStatus === "error" ? t.auth.profileError : t.auth.profileSaved}
        </p>
      )}

      <button type="submit" disabled={saving} className="btn-primary min-w-40">
        {saving ? t.auth.savingProfile : t.auth.saveProfile}
      </button>
    </form>
  );
}
