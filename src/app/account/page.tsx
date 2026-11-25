import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountProfileForm } from "@/components/account-profile-form";
import { AccountNav } from "@/components/account-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { AccountSessions } from "@/components/account-sessions";
import { AccountPasswordForm } from "@/components/account-password-form";
import { TwoFactorCard } from "@/components/two-factor-card";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { fill } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.accountTitle, description: t.meta.accountDescription, robots: { index: false, follow: false } };
}

/**
 * Customer Account Command Hub (Wave 6).
 *
 * Amazon's "Your Account" pattern: a command tile grid answers "where do I go?"
 * in one glance (orders/vault, wallet, security, devices, seller), then the
 * profile and security cards below do the actual work. Every card is the same
 * component as before — presentation changed, behaviour did not.
 */
export default async function AccountPage() {
  const [{ locale, t }, user] = await Promise.all([getI18n(), getCurrentAccountUser()]);
  if (!user) redirect("/login?next=%2Faccount");
  const ar = locale === "ar";
  const createdDate = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-US", { year: "numeric", month: "long" }).format(user.createdAt);

  const tiles = [
    { href: "/account/orders", icon: "▤", title: t.hub.orders, text: t.hub.ordersText, tone: "border-champagne/25" },
    { href: "/account/wallet", icon: "▣", title: t.hub.wallet, text: t.hub.walletText, tone: "border-success/25" },
    { href: "#security", icon: "🛡️", title: t.hub.security, text: t.hub.securityText, tone: "border-primary/25" },
    { href: "#devices", icon: "💻", title: t.hub.devices, text: t.hub.devicesText, tone: "border-edge" },
    { href: "/seller", icon: "◈", title: t.hub.seller, text: t.hub.sellerText, tone: "border-champagne/20" },
  ] as const;

  return (
    <div className="shell py-8 sm:py-10">
      <div className="command-panel relative overflow-hidden p-6 sm:p-9">
        <div aria-hidden="true" className="pointer-events-none absolute -end-10 -top-16 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
        <p className="eyebrow">{t.hub.eyebrow}</p>
        <h1 className="title-luxe mt-3 text-3xl sm:text-4xl">
          {ar ? `أهلاً، ${user.displayName.split(" ")[0]}` : `Welcome, ${user.displayName.split(" ")[0]}`}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">{t.hub.subtitle}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link href="/account/orders" className="btn-primary min-h-11 px-5 py-3 text-sm">
            {t.hub.orders}
            <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
          </Link>
          <Link href="/account/wallet" className="btn-ghost min-h-11 px-5 py-3 text-sm">{t.hub.wallet}</Link>
          <span className={user.emailVerifiedAt ? "badge-green" : "badge-red"}>
            {user.emailVerifiedAt ? (ar ? "البريد موثّق" : "Email verified") : (ar ? "البريد غير موثّق" : "Email unverified")}
          </span>
        </div>
      </div>

      {/* Command tile grid — the "where do I go" layer. */}
      <section aria-label={t.hub.title} className="stagger mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        {tiles.map((tile, index) => (
          <Link
            key={tile.href}
            href={tile.href}
            className={`tactile group flex min-h-28 flex-col justify-between rounded-xl border bg-card/70 p-3.5 ${tile.tone}`}
            style={{ "--i": index } as React.CSSProperties}
          >
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg border border-edge bg-raised/50 text-base">
              {tile.icon}
            </span>
            <span className="mt-2 block">
              <span className="block text-[0.8rem] font-bold leading-tight transition-colors group-hover:text-champagne">
                {tile.title}
              </span>
              <span className="mt-1 line-clamp-2 block text-[0.68rem] leading-4 text-muted">{tile.text}</span>
            </span>
          </Link>
        ))}
      </section>

      <div className="mt-6">
        <AccountNav locale={locale} active="/account" />
      </div>

      {/* Wallet + status at a glance. */}
      <section className="dawn-panel mb-6 p-6 text-white sm:p-8">
        <div aria-hidden="true" className="absolute -end-12 -top-20 h-64 w-64 rounded-full bg-[#ecd9b4]/20 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-24 start-1/4 h-56 w-56 rounded-full bg-rose-500/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-semibold text-white/70">{ar ? "رصيد محفظتك" : "Your wallet balance"}</p>
            <p className="mt-2 text-4xl font-black tabular-nums sm:text-5xl">$0.00</p>
            <p className="mt-2 text-sm text-white/60">≈ EGP 0 · {ar ? "رصيد تجريبي" : "Demo balance"}</p>
            <p className="mt-3 max-w-xl text-xs leading-6 text-white/55">
              {ar
                ? "رصيد تجريبي للعرض فقط، لا يمثل أموالاً حقيقية ولا يمكن سحبه أو استخدامه للشراء."
                : "Demo balance only. It is not real money and cannot be withdrawn or used for purchases."}
            </p>
          </div>
          <Link href="/account/wallet" className="btn-primary min-h-11 px-5 py-3 text-sm">
            {ar ? "تفاصيل المحفظة" : "Wallet details"} <span className="ms-2">→</span>
          </Link>
        </div>
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <section className="glass-card p-5">
          <div className="flex items-center justify-between"><p className="text-sm text-muted">{ar ? "الطلبات" : "Orders"}</p><span aria-hidden className="text-xl">▤</span></div>
          <p className="mt-3 text-3xl font-extrabold tabular-nums">0</p>
          <p className="mt-2 text-sm text-muted">{ar ? "لا توجد طلبات بعد" : "No orders yet"}</p>
          <Link href="/account/orders" className="mt-4 inline-flex text-sm font-semibold text-primary">{ar ? "متابعة الطلبات" : "Track orders"} <span aria-hidden className="ms-1 rtl:-scale-x-100">→</span></Link>
        </section>
        <section className="glass-card p-5">
          <div className="flex items-center justify-between"><p className="text-sm text-muted">{ar ? "حالة الحساب" : "Account status"}</p><span aria-hidden className="text-xl">◈</span></div>
          <p className="mt-3 text-lg font-bold">{user.emailVerifiedAt ? (ar ? "البريد الإلكتروني موثّق" : "Email verified") : (ar ? "البريد الإلكتروني غير موثّق" : "Email not verified")}</p>
          <p className="mt-2 truncate text-sm text-muted">{user.email}</p>
          <span className={`mt-4 inline-flex ${user.emailVerifiedAt ? "badge-green" : "badge-red"}`}>{user.emailVerifiedAt ? (ar ? "آمن" : "Verified") : (ar ? "يحتاج تأكيد" : "Action needed")}</span>
        </section>
        <section className="glass-card p-5 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between"><p className="text-sm text-muted">{t.hub.seller}</p><span aria-hidden className="text-xl">◈</span></div>
          <p className="mt-3 text-sm leading-6 text-muted">{t.hub.sellerText}</p>
          <Link href="/seller" className="mt-4 inline-flex text-sm font-semibold text-primary">{t.hub.open} <span aria-hidden className="ms-1 rtl:-scale-x-100">→</span></Link>
        </section>
      </div>

      <div className="mb-6 rounded-2xl border border-edge bg-raised/40 px-4 py-3 text-xs leading-6 text-muted">
        ⓘ {ar
          ? "القيمة المعروضة بالجنيه المصري تقريبية، ولا يوجد رصيد مالي فعلي في هذه المعاينة."
          : "EGP values are indicative only. This preview does not hold real money or accept deposits."}
      </div>

      <section id="security" className="glass-card card-glow-green scroll-mt-32 p-5 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{ar ? "بيانات الحساب" : "Account details"}</h2>
            <p className="mt-1 text-sm text-muted">{ar ? "حدّث بياناتك وطرق تسجيل الدخول." : "Manage your personal details and sign-in methods."}</p>
          </div>
          <span className="badge-neutral">{fill(t.auth.memberSince, { date: createdDate })}</span>
        </div>
        <AccountProfileForm initialName={user.displayName} email={user.email} emailVerified={Boolean(user.emailVerifiedAt)} googleLinked={user.googleLinked} passwordLoginEnabled={user.passwordLoginEnabled} />
        <AccountPasswordForm enabled={user.passwordLoginEnabled} />
        <TwoFactorCard />
        <div id="devices" className="scroll-mt-32">
          <AccountSessions />
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-edge pt-5">
          <p className="text-xs text-muted">{fill(t.auth.memberSince, { date: createdDate })}</p>
          <SignOutButton />
        </div>
      </section>
    </div>
  );
}
