import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { AccountNav } from "@/components/account-nav";
import { formatDemoEgp, formatDemoUsd } from "@/lib/wallet";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "المحفظة والإيداع" : "Wallet & deposits", robots: { index: false, follow: false } };
}
export default async function WalletPage() {
  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentAccountUser()]);
  if (!user) redirect("/login?next=%2Faccount%2Fwallet");
  const ar = locale === "ar";
  const methods = ar ? ["فودافون كاش", "InstaPay", "البطاقات البنكية"] : ["Vodafone Cash", "InstaPay", "Bank cards"];
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
    <p className="eyebrow">E‑VORA / WALLET</p>
    <h1 className="title-luxe mt-2 text-3xl">{ar ? "المحفظة والإيداع" : "Wallet & deposits"}</h1>
    <p className="mt-2 text-sm text-muted">{ar ? "تابع رصيدك وطرق إضافة الأموال من مكان واحد." : "View your balance and available funding options in one place."}</p>
    <div className="mt-7"><AccountNav locale={locale} active="/account/wallet" /></div>
    <section className="relative overflow-hidden rounded-3xl border border-champagne/25 bg-gradient-to-br from-[#181422] via-[#231a24] to-[#0f0c14] p-6 text-white shadow-[0_30px_70px_-44px_rgba(0,0,0,0.95)] sm:p-9">
      <div aria-hidden className="absolute -end-12 -top-16 h-52 w-52 rounded-full bg-[#ecd9b4]/20 blur-3xl" />
      <p className="relative text-sm text-white/70">{ar ? "الرصيد الحالي · تجريبي" : "Current balance · demo"}</p>
      <p className="relative mt-3 text-4xl font-black tabular-nums">{formatDemoUsd()}</p>
      <p className="relative mt-1 text-lg font-semibold text-white/70">{formatDemoEgp()}</p>
      <span className="relative mt-4 inline-flex badge-champagne">{ar ? "لا توجد أموال حقيقية محفوظة" : "No real funds are stored"}</span>
    </section>
    <section className="mt-7">
      <h2 className="title-luxe text-xl">{ar ? "طرق الإيداع" : "Deposit methods"}</h2>
      <p className="mt-1 text-sm text-muted">{ar ? "دي طرق مقترحة للواجهة، ولسه مش مفعّلة." : "These are planned interface options and are not active yet."}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{methods.map((method, i) => <div key={method} className="glass-card lift flex items-center gap-3 p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-xl">{["📱","⚡","💳"][i]}</span><div><p className="font-bold">{method}</p><p className="mt-1 text-xs text-muted">{ar ? "قريباً · غير متاح حالياً" : "Coming soon · unavailable"}</p></div></div>)}</div>
    </section>
    <div className="surface mt-7 border-primary/20 bg-primary/[0.04] p-5">
      <h2 className="font-bold">{ar ? "الإيداع غير مفعّل في المعاينة" : "Deposits are not enabled in this preview"}</h2>
      <p className="mt-2 text-sm leading-7 text-muted">{ar ? "مش هنطلب منك تحويل فلوس أو بيانات بطاقة هنا. تفعيل الإيداع محتاج ربط بوابة دفع آمنة ومراجعة الطلبات قبل استقبال أي مبالغ." : "Do not transfer money or enter card details here. Deposits require a secure payment gateway and verified transaction handling before funds can be accepted."}</p>
      <Link href="/contact" className="mt-4 inline-flex text-sm font-bold text-primary">{ar ? "تواصل معانا" : "Contact support"} ←</Link>
    </div>
  </div>;
}
