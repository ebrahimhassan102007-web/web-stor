"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/components/store-provider";

/** Only same-origin relative paths are honoured — prevents open redirects. */
function safeNext(raw: string | null): string {
  if (!raw) return "/account";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/account";
  }
  return raw;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { refreshUser, refreshCart } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";
  const next = safeNext(params.get("next"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/auth/${isLogin ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isLogin ? { email, password } : { name, email, password },
        ),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        await Promise.all([refreshUser(), refreshCart()]);
        router.push(next);
        router.refresh();
        return;
      }
      setError(body?.error ?? "حدث خطأ. حاول مرة أخرى.");
      setBusy(false);
    } catch {
      setError("خطأ في الاتصال. حاول مرة أخرى.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <div className="glass-card p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {isLogin ? (
            <>تسجيل <span className="text-primary">الدخول</span></>
          ) : (
            <>إنشاء <span className="text-primary">حساب جديد</span></>
          )}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {isLogin
            ? "مرحباً بعودتك إلى خدمتك ستور."
            : "دقيقة واحدة وتصبح جاهزاً للشراء."}
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
            {error}
          </p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          {!isLogin && (
            <div>
              <label htmlFor="auth-name" className="mb-1.5 block text-sm font-semibold">
                الاسم
              </label>
              <input
                id="auth-name"
                type="text"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-dark"
                placeholder="اسمك الكامل"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="mb-1.5 block text-sm font-semibold">
              البريد الإلكتروني
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-dark text-left"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-1.5 block text-sm font-semibold">
              كلمة المرور
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={isLogin ? 1 : 10}
              maxLength={200}
              autoComplete={isLogin ? "current-password" : "new-password"}
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-dark text-left"
              placeholder="••••••••••"
            />
            {!isLogin && (
              <p className="mt-1.5 text-xs text-muted">10 أحرف على الأقل.</p>
            )}
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy
              ? "لحظة من فضلك…"
              : isLogin
                ? "تسجيل الدخول"
                : "إنشاء الحساب"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {isLogin ? (
            <>
              ليس لديك حساب؟{" "}
              <Link
                href={`/register?next=${encodeURIComponent(next)}`}
                className="font-semibold text-primary hover:underline"
              >
                أنشئ حساباً
              </Link>
            </>
          ) : (
            <>
              لديك حساب بالفعل؟{" "}
              <Link
                href={`/login?next=${encodeURIComponent(next)}`}
                className="font-semibold text-primary hover:underline"
              >
                سجّل الدخول
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
