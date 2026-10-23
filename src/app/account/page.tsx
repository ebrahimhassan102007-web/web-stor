import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountProfileForm } from "@/components/account-profile-form";
import { AccountNav } from "@/components/account-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { fill } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.accountTitle, description: t.meta.accountDescription, robots: { index: false, follow: false } };
}

export default async function AccountPage() {
  const [{ locale, t }, user] = await Promise.all([getI18n(), getCurrentAccountUser()]);
  if (!user) redirect("/login?next=%2Faccount");
  const ar = locale === "ar";
  const createdDate = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-US", { year: "numeric", month: "long" }).format(user.createdAt);
  const words = ar ? {
    welcome: "أهلاً بيك في E‑Vora", subtitle: "كل مشترياتك وخدماتك الرقمية في مكان واحد.",
    wallet: "رصيد المحفظة", demo: "رصيد تجريبي", orders: "الطلبات", ordersValue: "لا توجد طلبات بعد",
    security: "حالة الحساب", verified: "البريد الإلكتروني موثّق", unverified: "البريد الإلكتروني غير موثّق",
    shop: "اكتشف المنتجات", deposit: "إيداع رصيد", history: "متابعة الطلبات",
    profile: "بيانات الحساب", profileSub: "حدّث بياناتك وطرق تسجيل الدخول.",
    currency: "القيمة المعروضة بالجنيه المصري تقريبية، ولا يوجد رصيد مالي فعلي في هذه المعاينة."
  } : {
    welcome: "Welcome to E‑Vora", subtitle: "Your digital purchases and account tools, all in one place.",
    wallet: "Wallet balance", demo: "Demo balance", orders: "Orders", ordersValue: "No orders yet",
    security: "Account status", verified: "Email verified", unverified: "Email not verified",
    shop: "Explore products", deposit: "Add funds", history: "Track orders",
    profile: "Account details", profileSub: "Manage your personal details and sign-in methods.",
    currency: "EGP values are indicative only. This preview does not hold real money or accept deposits."
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-7 overflow-hidden rounded-[1.7rem] border border-edge bg-card/80 p-6 sm:p-9">
        <div aria-hidden className="pointer-events-none float-end -mt-12 -me-10 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">E‑VORA / CUSTOMER SPACE</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{words.welcome}, {user.displayName.split(" ")[0]}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">{words.subtitle}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/products" className="btn-primary px-5 py-3 text-sm">{words.shop} <span aria-hidden>→</span></Link>
          <Link href="/account/wallet" className="btn-ghost px-5 py-3 text-sm">{words.deposit}</Link>
        </div>
      </div>

      <AccountNav locale={locale} active="/account" />

      <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <section className="glass-card card-glow-green p-5">
          <div className="flex items-center justify-between"><p className="text-sm text-muted">{words.wallet}</p><span className="text-xl">▣</span></div>
          <p className="mt-3 text-3xl font-extrabold tabular-nums">$0.00</p>
          <p className="mt-1 text-sm font-semibold text-muted">≈ EGP 0</p>
          <span className="mt-4 inline-flex badge-neutral">{words.demo}</span>
        </section>
        <section className="glass-card p-5">
          <div className="flex items-center justify-between"><p className="text-sm text-muted">{words.orders}</p><span className="text-xl">▤</span></div>
          <p className="mt-3 text-3xl font-extrabold tabular-nums">0</p>
          <p className="mt-2 text-sm text-muted">{words.ordersValue}</p>
          <Link href="/account/orders" className="mt-4 inline-flex text-sm font-semibold text-primary">{words.history} ←</Link>
        </section>
        <section className="glass-card p-5">
          <div className="flex items-center justify-between"><p className="text-sm text-muted">{words.security}</p><span className="text-xl">◈</span></div>
          <p className="mt-3 text-lg font-bold">{user.emailVerifiedAt ? words.verified : words.unverified}</p>
          <p className="mt-2 truncate text-sm text-muted">{user.email}</p>
          <span className={`mt-4 inline-flex ${user.emailVerifiedAt ? "badge-green" : "badge-red"}`}>{user.emailVerifiedAt ? (ar ? "آمن" : "Verified") : (ar ? "يحتاج تأكيد" : "Action needed")}</span>
        </section>
      </div>

      <div className="mb-7 rounded-2xl border border-edge bg-raised/40 px-4 py-3 text-xs leading-6 text-muted">ⓘ {words.currency}</div>

      <section className="glass-card card-glow-green p-5 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-bold">{words.profile}</h2><p className="mt-1 text-sm text-muted">{words.profileSub}</p></div>
          <span className="badge-neutral">{fill(t.auth.memberSince, { date: createdDate })}</span>
        </div>
        <AccountProfileForm initialName={user.displayName} email={user.email} emailVerified={Boolean(user.emailVerifiedAt)} googleLinked={user.googleLinked} passwordLoginEnabled={user.passwordLoginEnabled} />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-edge pt-5"><p className="text-xs text-muted">{fill(t.auth.memberSince, { date: createdDate })}</p><SignOutButton /></div>
      </section>
    </div>
  );
}
