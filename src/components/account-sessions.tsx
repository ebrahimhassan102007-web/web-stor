"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/locale-provider";

type SessionRow = {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string;
  current: boolean;
};

/** Session list + "sign out of all devices" (S-09). */
export function AccountSessions() {
  const { locale } = useI18n();
  const router = useRouter();
  const ar = locale === "ar";
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/sessions", { headers: { accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setSessions(body?.data?.sessions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOutEverywhere() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/auth/sessions", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error("revoke-failed");
      router.replace("/");
      router.refresh();
    } catch {
      setBusy(false);
      setError(true);
    }
  }

  const fmt = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section aria-label={ar ? "الجلسات النشطة" : "Active sessions"} className="mt-6 border-t border-edge pt-5">
      <h2 className="font-bold">{ar ? "الجلسات النشطة" : "Active sessions"}</h2>
      {sessions === null ? (
        <p className="mt-2 text-sm text-muted">{ar ? "بنحمّل الجلسات…" : "Loading sessions…"}</p>
      ) : sessions.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{ar ? "مفيش جلسات نشطة ظاهرة." : "No active sessions to show."}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-edge bg-card px-4 py-3 text-sm">
              <span>
                {ar ? "آخر نشاط: " : "Last used: "}
                <time dateTime={s.lastUsedAt}>{fmt.format(new Date(s.lastUsedAt))}</time>
              </span>
              {s.current ? (
                <span className="badge-neutral">{ar ? "الجهاز الحالي" : "This device"}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-primary">
          {ar ? "حصلت مشكلة، جرّب تاني." : "Something went wrong. Please try again."}
        </p>
      ) : null}
      <button type="button" onClick={signOutEverywhere} disabled={busy} className="btn-ghost mt-4">
        {busy
          ? ar
            ? "بنخرج من كل الأجهزة…"
            : "Signing out everywhere…"
          : ar
            ? "تسجيل الخروج من كل الأجهزة"
            : "Sign out of all devices"}
      </button>
    </section>
  );
}
