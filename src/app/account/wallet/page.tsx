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

/**
 * Wallet hub (Wave 6).
 *
 * A balance hero card plus a scannable, colour-coded ledger. The colour map is
 * derived from the immutable `entry_type` column — `credit_topup` (green),
 * `debit_order` (neutral ink), `credit_refund` (champagne) — so a refund is
 * instantly distinguishable from a top-up without reading the amount sign.
 */
export default async function WalletPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [{ locale, t }, user, params] = await Promise.all([getI18n(), getCurrentAccountUser(), searchParams]);
  if (!user) redirect("/login?next=%2Faccount%2Fwallet");
  const page = /^\d{1,4}$/.test(params.page ?? "") ? Number(params.page) : 1;
  const wallet = await getWallet(user.id, page);
  const ar = locale === "ar";
  const methods = ar ? ["فودافون كاش", "InstaPay", "البطاقات البنكية"] : ["Vodafone Cash", "InstaPay", "Bank cards"];

  const entryLabel = (entry: { entryType: string; direction: string }) => {
    switch (entry.entryType) {
      case "credit_topup":
        return t.walletHub.creditTopup;
      case "debit_order":
        return t.walletHub.debitOrder;
      case "credit_refund":
        return t.walletHub.creditRefund;
      default:
        return entry.direction === "credit" ? t.walletHub.creditOther : t.walletHub.debitOther;
    }
  };
  const entryTone = (entryType: string) =>
    entryType === "credit_refund"
      ? { chip: "badge-champagne", amount: "text-champagne" }
      : entryType === "credit_topup"
        ? { chip: "badge-green", amount: "text-success" }
        : { chip: "badge-neutral", amount: "text-foreground" };

  return (
    <div className="shell py-8 sm:py-10">
      <p className="eyebrow">E-VORA / WALLET</p>
      <h1 className="title-luxe mt-2 text-3xl">{ar ? "المحفظة والإيداع" : "Wallet & deposits"}</h1>
      <p className="mt-2 text-sm text-muted">
        {ar ? "تابع رصيدك وطرق إضافة الأموال من مكان واحد." : "View your balance and available funding options in one place."}
      </p>
      <div className="mt-6"><AccountNav locale={locale} active="/account/wallet" /></div>

      {/* Balance hero */}
      <section className="dawn-panel p-6 text-white sm:p-9">
        <div aria-hidden className="absolute -end-12 -top-16 h-52 w-52 rounded-full bg-[#ecd9b4]/20 blur-3xl" />
        <div aria-hidden className="absolute -bottom-20 start-1/4 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm text-white/70">{t.walletHub.heroLabel}</p>
            <p className="mt-3 text-4xl font-black tabular-nums sm:text-5xl">{formatCents(wallet.balanceCents, locale)}</p>
            <p className="mt-2 text-xs leading-6 text-white/60">{t.walletHub.heroNote}</p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <span className="badge-champagne">{ar ? "الرصيد بدولار أمريكي" : "USD wallet balance"}</span>
            <span className="text-xs text-white/55" dir="ltr">{wallet.currency}</span>
          </div>
        </div>
      </section>

      {/* Deposit methods */}
      <section className="mt-7">
        <h2 className="title-luxe text-xl">{ar ? "طرق الإيداع" : "Deposit methods"}</h2>
        <p className="mt-1 text-sm text-muted">
          {ar ? "دي طرق مقترحة للواجهة، ولسه مش مفعّلة." : "These are planned interface options and are not active yet."}
        </p>
        <div className="stagger mt-4 grid gap-3 sm:grid-cols-3">
          {methods.map((method, i) => (
            <div key={method} className="glass-card tactile flex items-center gap-3 p-5" style={{ "--i": i } as React.CSSProperties}>
              <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-xl">
                {["📱", "⚡", "💳"][i]}
              </span>
              <div>
                <p className="font-bold">{method}</p>
                <p className="mt-1 text-xs text-muted">{ar ? "قريباً · غير متاح حالياً" : "Coming soon · unavailable"}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Immutable ledger */}
      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="title-luxe text-xl">{t.walletHub.ledgerTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.walletHub.ledgerNote}</p>
          </div>
          <span className="badge-neutral">{wallet.history.length} {ar ? "قيد" : "rows"}</span>
        </div>

        <div className="command-panel mt-4 divide-y divide-edge">
          {wallet.history.length ? (
            wallet.history.map((entry) => {
              const tone = entryTone(entry.entryType);
              return (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-hover/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-edge text-sm ${entry.direction === "credit" ? "bg-success/10" : "bg-raised/60"}`}>
                      {entry.entryType === "credit_refund" ? "↩" : entry.direction === "credit" ? "↓" : "↑"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {entryLabel(entry)}
                        {entry.description ? <span className="ms-2 font-normal text-muted">{entry.description}</span> : null}
                      </p>
                      <p className="mt-0.5 text-[0.7rem] text-muted">
                        {new Intl.DateTimeFormat(ar ? "ar-EG" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(entry.createdAt)}
                        {entry.orderId ? <span dir="ltr"> · {entry.orderId}</span> : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className={`hidden sm:inline-flex ${tone.chip}`}>{entry.entryType === "debit_order" ? (ar ? "خصم" : "debit") : (ar ? "دائن" : "credit")}</span>
                    <span className={`font-bold tabular-nums ${tone.amount}`}>
                      {entry.direction === "credit" ? "+" : "−"}
                      {formatCents(entry.amountCents, locale)}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="p-5 text-sm text-muted">{t.walletHub.empty}</p>
          )}
        </div>

        <div className="mt-3 flex justify-between text-sm">
          {page > 1 ? <Link className="text-primary" href={`/account/wallet?page=${page - 1}`}>{ar ? "الأحدث" : "Newer"}</Link> : <span />}
          {wallet.history.length === wallet.pageSize ? <Link className="text-primary" href={`/account/wallet?page=${page + 1}`}>{ar ? "الأقدم" : "Older"}</Link> : null}
        </div>
      </section>

      <div className="surface mt-7 border-primary/20 bg-primary/[0.04] p-5">
        <h2 className="font-bold">{ar ? "الإيداع غير مفعّل في المعاينة" : "Deposits are not enabled in this preview"}</h2>
        <p className="mt-2 text-sm leading-7 text-muted">
          {ar
            ? "مش هنطلب منك تحويل فلوس أو بيانات بطاقة هنا. تفعيل الإيداع محتاج ربط بوابة دفع آمنة ومراجعة الطلبات قبل استقبال أي مبالغ."
            : "Do not transfer money or enter card details here. Deposits require a secure payment gateway and verified transaction handling before funds can be accepted."}
        </p>
        <Link href="/contact" className="mt-4 inline-flex text-sm font-bold text-primary">{ar ? "تواصل معانا" : "Contact support"} ←</Link>
      </div>
    </div>
  );
}
