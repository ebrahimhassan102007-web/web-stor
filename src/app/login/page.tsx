import Link from "next/link";
import { configuredOrigin } from "@/lib/security/origin";

type Props = { searchParams: Promise<{ error?: string | string[] }> };
const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured for this preview yet.",
  oauth_state: "Your sign-in session expired or could not be verified. Please start again.",
  google_failed: "Google could not complete sign-in. Please try again.",
};
export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const code = typeof params.error === "string" ? params.error : "";
  const ready = Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && configuredOrigin());
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:py-20">
      <section className="hidden lg:block">
        <span className="badge-green">Secure customer access</span>
        <h1 className="mt-6 text-5xl font-extrabold leading-tight tracking-tight">Your tech.<br />Your <span className="text-primary">account.</span></h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted">Sign in once to keep your customer details together and make your next visit simpler.</p>
        <div className="mt-8 grid max-w-md gap-3 sm:grid-cols-2">
          <div className="glass-card p-4"><p className="text-sm font-semibold">One-tap sign-in</p><p className="mt-1 text-xs leading-relaxed text-muted">Use your verified Google account. No new password to remember.</p></div>
          <div className="glass-card p-4"><p className="text-sm font-semibold">Details in one place</p><p className="mt-1 text-xs leading-relaxed text-muted">Save your phone number and shipping address for later.</p></div>
        </div>
      </section>
      <section className="glass-card mx-auto w-full max-w-md p-6 sm:p-8">
        <Link href="/" className="text-sm text-muted transition-colors hover:text-foreground">← Back to shop</Link>
        <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-xl font-bold text-primary" aria-hidden="true">W</div>
        <h2 className="mt-5 text-2xl font-bold tracking-tight">Welcome back</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">Sign in securely with Google to create your customer profile.</p>
        {ERRORS[code] && <p role="alert" className="mt-5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">{ERRORS[code]}</p>}
        {ready ? (
          <Link href="/api/auth/google" className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl border border-edge bg-white px-4 py-3.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.5H5.8v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.5a12 12 0 0 1 0-7V15H5.8a20 20 0 0 0 0 18Z"/><path fill="#EA4335" d="M24 12.1c3 0 5.7 1 7.8 3l5.8-5.8A19.5 19.5 0 0 0 24 4 20 20 0 0 0 5.8 15l6.8 5.5c1.6-4.9 6.1-8.4 11.4-8.4Z"/></svg>
            Continue with Google
          </Link>
        ) : (
          <div className="mt-7 rounded-xl border border-edge bg-raised/60 p-4">
            <p className="text-sm font-semibold">Google sign-in setup required</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">The code is ready, but this Preview needs Google OAuth credentials before sign-in can be enabled.</p>
          </div>
        )}
        <p className="mt-5 text-center text-xs leading-relaxed text-muted">We request your Google profile and verified email only. Your Google password is never shared with this store.</p>
      </section>
    </main>
  );
}
