import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { AccountNav } from "@/components/account-nav";
import { getWallet } from "@/lib/wallet-query";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "المحفظة والإيداع" : "Wallet & deposits", robots: { index: false, follow: false } };
}
export default async function WalletPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [{ locale }, user, params] = await Promise.all([getI18n(), getCurrentAccountUser(), searchParams]);
  if (!user) redirect("/login?next=%2Faccount%2Fwallet");
  const page = /^\d{1,4}$/.test(params.page ?? "") ? Number(params.page) : 1;
  const wallet = await getWallet(user.id, page);
  const ar = locale === "ar";
  const methods = ar ? ["فودافون كاش", "InstaPay", "البطاقات البنكية"] : ["Vodafone Cash", "InstaPay", "Bank cards"];
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
    <p className="eyebrow">E‑VORA / WALLET</p>
    <h1 className="title-luxe mt-2 text-3xl">{ar ? "المحفظة والإيداع" : "Wallet & deposits"}</h1>
    <p className="mt-2 text-sm text-muted">{ar ? "تابع رصيدك وطرق إضافة الأموال من مكان واحد." : "View your balance and available funding options in one place."}</p>
    <div className="mt-7"><AccountNav locale={locale} active="/account/wallet" /></div>
    <section className="dawn-panel p-6 text-white sm:p-9">
      <div aria-hidden className="absolute -end-12 -top-16 h-52 w-52 rounded-full bg-[#ecd9b4]/20 blur-3xl" />
      <p className="relative text-sm text-white/70">{ar ? "الرصيد الحالي" : "Current balance"}</p>
      <p className="relative mt-3 text-4xl font-black tabular-nums">{formatCents(wallet.balanceCents, locale)}</p>
      <span className="relative mt-4 inline-flex badge-champagne">{ar ? "الرصيد بدولار أمريكي" : "USD wallet balance"}</span>
    </section>
    <section className="mt-7">
      <h2 className="title-luxe text-xl">{ar ? "طرق الإيداع" : "Deposit methods"}</h2>
      <p className="mt-1 text-sm text-muted">{ar ? "دي طرق مقترحة للواجهة، ولسه مش مفعّلة." : "These are planned interface options and are not active yet."}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{methods.map((method, i) => <div key={method} className="glass-card lift flex items-center gap-3 p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-xl">{["📱","⚡","💳"][i]}</span><div><p className="font-bold">{method}</p><p className="mt-1 text-xs text-muted">{ar ? "قريباً · غير متاح حالياً" : "Coming soon · unavailable"}</p></div></div>)}</div>
    </section>
    <section className="mt-8">
      <h2 className="title-luxe text-xl">{ar ? "سجل المحفظة" : "Wallet history"}</h2>
      <p className="mt-1 text-sm text-muted">{ar ? "سجل ثابت للعمليات الأخيرة." : "Immutable record of recent wallet activity."}</p>
      <div className="glass-card mt-4 divide-y divide-edge">
        {wallet.history.length ? wallet.history.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="font-semibold">{entry.description || (entry.entryType === "debit_order" ? (ar ? "شراء" : "Order purchase") : (ar ? "إضافة رصيد" : "Wallet credit"))}</p><p className="text-xs text-muted">{new Intl.DateTimeFormat(ar ? "ar-EG" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(entry.createdAt)}{entry.orderId ? ` · ${entry.orderId}` : ""}</p></div>
          <span className={`font-bold tabular-nums ${entry.direction === "credit" ? "text-success" : "text-foreground"}`}>{entry.direction === "credit" ? "+" : "−"}{formatCents(entry.amountCents, locale)}</span>
        </div>) : <p className="p-5 text-sm text-muted">{ar ? "لا توجد عمليات بعد." : "No wallet activity yet."}</p>}
      </div>
      <div className="mt-3 flex justify-between text-sm">{page > 1 ? <Link className="text-primary" href={`/account/wallet?page=${page - 1}`}>{ar ? "الأحدث" : "Newer"}</Link> : <span />}{wallet.history.length === wallet.pageSize ? <Link className="text-primary" href={`/account/wallet?page=${page + 1}`}>{ar ? "الأقدم" : "Older"}</Link> : null}</div>
    </section>
    <div className="surface mt-7 border-primary/20 bg-primary/[0.04] p-5">
      <h2 className="font-bold">{ar ? "الإيداع غير مفعّل في المعاينة" : "Deposits are not enabled in this preview"}</h2>
      <p className="mt-2 text-sm leading-7 text-muted">{ar ? "مش هنطلب منك تحويل فلوس أو بيانات بطاقة هنا. تفعيل الإيداع محتاج ربط بوابة دفع آمنة ومراجعة الطلبات قبل استقبال أي مبالغ." : "Do not transfer money or enter card details here. Deposits require a secure payment gateway and verified transaction handling before funds can be accepted."}</p>
      <Link href="/contact" className="mt-4 inline-flex text-sm font-bold text-primary">{ar ? "تواصل معانا" : "Contact support"} ←</Link>
    </div>
  </div>;
}
