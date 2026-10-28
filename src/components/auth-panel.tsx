"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fill } from "@/lib/i18n/dictionary";
import { useI18n } from "@/components/locale-provider";
import { normalizeVerificationDigits } from "@/lib/security/digits";

type AuthPanelProps = {
  initialEmail?: string;
  initialError?: string;
  nextPath?: string;
};

type ApiBody = {
  ok?: boolean;
  error?: string;
  data?: { authenticated?: boolean; verificationRequired?: boolean };
};

type AuthErrorDictionary = ReturnType<typeof useI18n>["t"]["auth"]["errors"];

function localizeAuthError(code: string | undefined, errors: AuthErrorDictionary) {
  if (!code) return errors.generic;
  const mapping: Record<string, string> = {
    INVALID_BODY: errors.invalidInput,
    INVALID_INPUT: errors.invalidInput,
    REQUEST_REJECTED: errors.requestRejected,
    INVALID_CREDENTIALS: errors.invalidCredentials,
    RATE_LIMITED: errors.rateLimited,
    rate_limited: errors.rateLimited,
    AUTH_NOT_CONFIGURED: errors.authNotConfigured,
    auth_config: errors.authNotConfigured,
    EMAIL_NOT_CONFIGURED: errors.emailNotConfigured,
    EMAIL_DELIVERY_FAILED: errors.emailDeliveryFailed,
    AUTH_UNAVAILABLE: errors.authUnavailable,
    CODE_INVALID: errors.codeInvalid,
    CODE_EXPIRED: errors.codeExpired,
    CODE_LOCKED: errors.codeLocked,
    AUTH_REQUIRED: errors.authRequired,
    google_config: errors.googleConfig,
    google_unavailable: errors.googleUnavailable,
    google_cancelled: errors.googleCancelled,
    google_failed: errors.googleFailed,
  };
  return mapping[code] ?? errors.generic;
}

function destinationPath(path: string | undefined) {
  return path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : "/account";
}

export function AuthPanel({
  initialEmail = "",
  initialError,
  nextPath = "/account",
}: AuthPanelProps) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [stage, setStage] = useState<"credentials" | "verification">("credentials");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errorCode, setErrorCode] = useState(initialError ?? "");
  const [notice, setNotice] = useState<"verification" | "verified" | "">("");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function finishSignIn() {
    router.replace(destinationPath(nextPath));
    router.refresh();
  }

  async function submitCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrorCode("");
    setNotice("");

    const endpoint = mode === "signup" ? "/api/auth/email/register" : "/api/auth/email/login";
    const payload = {
      ...(mode === "signup" ? { displayName } : {}),
      email,
      password,
      locale,
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as ApiBody | null;
      if (!response.ok || !body?.ok) {
        setErrorCode(body?.error ?? "UNKNOWN");
        setBusy(false);
        return;
      }

      if (body.data?.authenticated) {
        finishSignIn();
        return;
      }

      setPassword("");
      setStage("verification");
      setCode(["", "", "", "", "", ""]);
      setCooldown(60);
      setNotice("verification");
    } catch {
      setErrorCode("UNKNOWN");
    }
    setBusy(false);
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !code.every(Boolean)) return;
    setBusy(true);
    setErrorCode("");
    setNotice("");

    try {
      const response = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: code.join("") }),
      });
      const body = (await response.json().catch(() => null)) as ApiBody | null;
      if (!response.ok || !body?.ok) {
        setErrorCode(body?.error ?? "UNKNOWN");
        setBusy(false);
        return;
      }
      setNotice("verified");
      finishSignIn();
    } catch {
      setErrorCode("UNKNOWN");
      setBusy(false);
    }
  }

  async function resendCode() {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setErrorCode("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      const body = (await response.json().catch(() => null)) as ApiBody | null;
      if (!response.ok || !body?.ok) {
        setErrorCode(body?.error ?? "UNKNOWN");
        setBusy(false);
        return;
      }
      setCooldown(60);
      setNotice("verification");
    } catch {
      setErrorCode("UNKNOWN");
    }
    setBusy(false);
  }

  function updateCode(index: number, rawValue: string) {
    const digits = normalizeVerificationDigits(rawValue)
      .replace(/\D/g, "")
      .slice(0, 6 - index);
    setCode((current) => {
      const next = [...current];
      if (!digits) {
        next[index] = "";
        return next;
      }
      [...digits].forEach((digit, offset) => {
        next[index + offset] = digit;
      });
      return next;
    });
    if (digits) inputRefs.current[Math.min(index + digits.length, 5)]?.focus();
  }

  function pasteCode(event: React.ClipboardEvent<HTMLDivElement>) {
    const pasted = normalizeVerificationDigits(event.clipboardData.getData("text"))
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setCode(Array.from({ length: 6 }, (_, index) => pasted[index] ?? ""));
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  function handleCodeKey(event: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-12rem)] max-w-5xl items-stretch gap-5 px-4 py-10 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:gap-7">
      <aside className="relative hidden min-h-[620px] overflow-hidden rounded-[2rem] border border-[#ecd9b4]/20 bg-[linear-gradient(160deg,#171320_0%,#221726_55%,#100c16_100%)] p-10 text-white shadow-[0_40px_90px_-50px_rgba(0,0,0,0.95)] lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#ecd9b4]/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 top-1/3 h-64 w-64 rounded-full bg-[#f0a8a0]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-[#b3a6f0]/15 blur-3xl" />
        <div className="relative z-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-[#ecd9b4] shadow-[0_18px_40px_-24px_rgba(236,217,180,0.9)]">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8.5h16l-1.2 11H5.2L4 8.5Z" />
              <path d="M8.5 9V6a3.5 3.5 0 0 1 7 0v3" />
              <path d="m9 14 2 2 4-4" />
            </svg>
          </div>
          <p className="eyebrow mt-8">E-Vora Store</p>
          <h2 className="mt-4 max-w-sm text-4xl font-black leading-[1.15]">
            {locale === "ar" ? "كل عالمك الرقمي في مكان واحد" : "Your digital world, all in one place."}
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">
            {locale === "ar"
              ? "ادخل إلى حسابك وتابع منتجاتك وتجربتك في E‑Vora بسهولة وأمان."
              : "Sign in to explore your account and keep your digital essentials close."}
          </p>
        </div>
        <div className="relative z-10 space-y-3">
          {[
            locale === "ar" ? "شحن ألعاب وبطاقات رقمية" : "Game top-ups and digital gift cards",
            locale === "ar" ? "تجربة تسوق بسيطة وواضحة" : "A clean, straightforward store experience",
            locale === "ar" ? "حسابك وبياناتك في أمان" : "Your account, protected",
          ].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-200 backdrop-blur">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-300/15 text-cyan-300">✓</span>
              {item}
            </div>
          ))}
          <p className="pt-5 text-xs text-slate-500">© E‑Vora</p>
        </div>
      </aside>
      <section className="glass-card relative w-full self-center overflow-hidden rounded-[2rem] p-6 shadow-2xl sm:p-9 lg:p-10">
        <div className="auth-orbit" aria-hidden="true">
          <span className="auth-orbit-core">E</span>
          <span className="auth-orbit-dot" />
        </div>

        <div className="relative z-10 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary lg:hidden">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8.5h16l-1.2 11H5.2L4 8.5Z" />
              <path d="M8.5 9V6a3.5 3.5 0 0 1 7 0v3" />
            </svg>
          </div>
          <p className="eyebrow">E-Vora · Store</p>
          <h1 className="title-luxe mt-2 text-2xl sm:text-3xl">
            {stage === "verification"
              ? t.auth.verificationTitle
              : mode === "signin"
                ? t.auth.signInTitle
                : t.auth.signUpTitle}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            {stage === "verification"
              ? fill(t.auth.verificationSubtitle, { email })
              : mode === "signin"
                ? t.auth.signInSubtitle
                : t.auth.signUpSubtitle}
          </p>
        </div>

        {errorCode && (
          <p role="alert" className="mt-6 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
            {localizeAuthError(errorCode, t.auth.errors)}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-6 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            {notice === "verified" ? t.auth.successVerify : t.auth.checkInbox}
          </p>
        )}

        {stage === "credentials" ? (
          <>
            <div className="mt-7 grid grid-cols-2 rounded-xl border border-edge bg-raised/50 p-1" role="tablist" aria-label={t.auth.signInTab}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signin"}
                onClick={() => {
                  setMode("signin");
                  setErrorCode("");
                  setNotice("");
                }}
                className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${mode === "signin" ? "bg-primary text-white shadow-[0_10px_22px_-14px_rgba(239,68,68,0.9)]" : "text-muted hover:text-foreground"}`}
              >
                {t.auth.signInTab}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signup"}
                onClick={() => {
                  setMode("signup");
                  setErrorCode("");
                  setNotice("");
                }}
                className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${mode === "signup" ? "bg-primary text-white shadow-[0_10px_22px_-14px_rgba(239,68,68,0.9)]" : "text-muted hover:text-foreground"}`}
              >
                {t.auth.signUpTab}
              </button>
            </div>

            <a
              href={`/api/auth/google/start?next=${encodeURIComponent(destinationPath(nextPath))}`}
              className="btn-ghost mt-5 w-full py-3"
            >
              <GoogleMark />
              {t.auth.googleButton}
            </a>

            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-edge" />
              <span>{t.auth.divider}</span>
              <span className="h-px flex-1 bg-edge" />
            </div>

            <form onSubmit={submitCredentials} className="space-y-4" noValidate>
              {mode === "signup" && (
                <div>
                  <label htmlFor="auth-name" className="mb-1.5 block text-sm font-medium">
                    {t.auth.fullName}
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={128}
                    placeholder={t.auth.namePlaceholder}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="input-dark"
                  />
                </div>
              )}
              <div>
                <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium">
                  {t.auth.email}
                </label>
                <input
                  id="auth-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder={t.auth.emailPlaceholder}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  dir="ltr"
                  className="input-dark"
                />
              </div>
              <div>
                <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium">
                  {t.auth.password}
                </label>
                <input
                  id="auth-password"
                  type="password"
                  name="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={mode === "signup" ? 12 : 1}
                  maxLength={128}
                  placeholder={t.auth.passwordPlaceholder}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  dir="ltr"
                  className="input-dark"
                />
                {mode === "signup" && (
                  <p className="mt-1.5 text-xs text-muted">{t.auth.passwordHint}</p>
                )}
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full py-3 text-base">
                {busy
                  ? t.auth.working
                  : mode === "signup"
                    ? t.auth.signUpButton
                    : t.auth.signInButton}
              </button>
            </form>
          </>
        ) : (
          <>
            <form onSubmit={submitCode} className="mt-7" noValidate>
              <fieldset>
                <legend className="mb-3 text-center text-sm font-semibold">{t.auth.codeLabel}</legend>
                <div className="otp-inputs" onPaste={pasteCode} dir="ltr">
                  {Array.from({ length: 6 }, (_, index) => (
                    <input
                      // Six stable, individually accessible one-time-code cells.
                      key={index}
                      ref={(element) => {
                        inputRefs.current[index] = element;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      pattern="[0-9]*"
                      maxLength={1}
                      value={code[index] ?? ""}
                      aria-label={fill(t.auth.digitLabel, { index: index + 1 })}
                      onChange={(event) => updateCode(index, event.target.value)}
                      onKeyDown={(event) => handleCodeKey(event, index)}
                      onFocus={(event) => event.currentTarget.select()}
                      className="otp-cell"
                    />
                  ))}
                </div>
              </fieldset>
              <button type="submit" disabled={busy || !code.every(Boolean)} className="btn-primary mt-6 w-full py-3 text-base">
                {busy ? t.auth.verifying : t.auth.verifyButton}
              </button>
            </form>

            <button
              type="button"
              onClick={resendCode}
              disabled={busy || cooldown > 0}
              className="btn-ghost mt-3 w-full"
            >
              {cooldown > 0
                ? fill(t.auth.resendCountdown, { seconds: cooldown })
                : t.auth.resendButton}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage("credentials");
                setMode("signin");
                setCode(["", "", "", "", "", ""]);
                setErrorCode("");
                setNotice("");
                setCooldown(0);
              }}
              className="mt-5 w-full text-center text-sm font-medium text-muted hover:text-foreground"
            >
              {t.auth.changeEmail}
            </button>
          </>
        )}

        <p className="mt-7 text-center text-xs text-muted">
          <Link href="/" className="hover:text-primary">E-Vora</Link>
        </p>
      </section>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
      <path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.9 6.1-14.9Z" />
      <path fill="#FF3D00" d="M24 44c5.5 0 10.2-1.8 13.6-4.8l-6.6-5c-1.8 1.2-4.1 1.9-7 1.9-5.3 0-9.8-3.6-11.4-8.5H5.8v5.2A20 20 0 0 0 24 44Z" />
      <path fill="#4CAF50" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6l6.8-5.2Z" />
      <path fill="#1976D2" d="M24 12c3 0 5.6 1 7.7 3.1l5.8-5.8C34 5.9 29.4 4 24 4A20 20 0 0 0 5.8 15.2l6.8 5.2C14.2 15.5 18.7 12 24 12Z" />
    </svg>
  );
}
