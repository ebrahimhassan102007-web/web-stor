"use client";
import { useState } from "react";
export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) { setError("Could not sign out. Please try again."); setBusy(false); return; }
      window.location.assign("/");
    } catch { setError("Network error. Please try again."); setBusy(false); }
  }
  return <div className="flex flex-col items-start gap-2 sm:items-end"><button type="button" disabled={busy} onClick={() => void signOut()} className="btn-ghost px-4 py-2.5">{busy ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="text-xs text-primary">{error}</p>}</div>;
}
