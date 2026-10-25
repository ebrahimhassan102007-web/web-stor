import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { AccountNav } from "@/components/account-nav";
import { WalletNav } from "@/components/wallet-nav";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "الرصيد والمحفظة" : "Balance and wallet", robots: { index: false, follow: false } };
}

export default async function WalletPage() {
  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentAccountUser()]);
  if (!user) redirect("/login?next=%2Faccount%2Fwallet");
  const ar = locale === "ar";

  const shortcuts = ar ? [
    { href: "/account/wallet/add-funds", eyebrow: "الإيداع", title: "إضافة رصيد", text: "تعرف على خيارات الإيداع المخطط لها، من غير إدخال بيانات دفع." },
    { href: "/account/wallet/transactions", eyebrow: "النشاط", title: "سجل الحركات", text: "راجع حالة سجل المحفظة. لا توجد معاملات مالية حقيقية في المعاينة." },
    { href: "/account/wallet/methods", eyebrow: "إعدادات الدفع", title: "طرق الدفع", text: "تعرف على حالة ربط وسائل الدفع الآمنة بالمتجر." },
  ] : [
    { href: "/account/wallet/add-funds", eyebrow: "FUNDING", title: "Add funds", text: "Review planned funding options without entering payment details." },
    { href: "/account/wallet/transactions", eyebrow: "ACTIVITY", title: "Activity history", text: "Review wallet activity. This preview stores no real financial transactions." },
    { href: "/account/wallet/methods", eyebrow: "PAYMENT SETTINGS", title: "Payment methods", text: "See the current status of secure payment integrations." },
  ];

  return (
    <div className="account-page-enter mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="account-page-heading">
        <div><p className="account-eyebrow">E‑VORA / {ar ? "الرصيد" : "BALANCE"}</p><h1>{ar ? "رصيدك في مكان واحد" : "Your balance, at a glance"}</h1><p>{ar ? "إدارة واضحة للرصيد والنشاط المالي وإعدادات الدفع." : "A clear home for your balance, wallet activity, and payment settings."}</p></div>
        <span className="wallet-preview-pill">{ar ? "معاينة فقط" : "PREVIEW ONLY"}</span>
      </header>

      <AccountNav locale={locale} active="/account/wallet" />

      <section className="wallet-hero-panel">
        <div className="wallet-hero-copy">
          <p className="wallet-hero-kicker">{ar ? "الرصيد المتاح" : "AVAILABLE BALANCE"}</p>
          <h2>{ar ? "غير مفعّل" : "Not active"}</h2>
          <p>{ar ? "لا توجد أموال حقيقية محفوظة في حسابك. لن نعرض رصيدًا وهميًا أو نطلب تحويلًا." : "No real funds are held on this account. We will not display a fabricated balance or request a transfer."}</p>
        </div>
        <span className="wallet-hero-orbit" aria-hidden="true" />
        <Link href="/account/wallet/add-funds" className="wallet-hero-link">{ar ? "خيارات الإيداع" : "Funding options"}<span aria-hidden="true">{ar ? "←" : "→"}</span></Link>
      </section>

      <WalletNav locale={locale} active="/account/wallet" />

      <div className="wallet-overview-grid">
        <article className="wallet-overview-card">
          <span className="wallet-card-label">{ar ? "حالة المحفظة" : "WALLET STATUS"}</span>
          <strong>{ar ? "غير مفعّلة" : "Not enabled"}</strong>
          <p>{ar ? "الإيداع والسحب غير متاحين في النسخة الحالية." : "Deposits and withdrawals are unavailable in this version."}</p>
        </article>
        <article className="wallet-overview-card">
          <span className="wallet-card-label">{ar ? "المعاملات" : "TRANSACTIONS"}</span>
          <strong>{ar ? "لا يوجد سجل" : "No activity"}</strong>
          <p>{ar ? "لا توجد حركات مالية مرتبطة بهذا الحساب." : "No financial activity is associated with this account."}</p>
        </article>
        <article className="wallet-overview-card">
          <span className="wallet-card-label">{ar ? "وسائل الدفع" : "PAYMENT METHODS"}</span>
          <strong>{ar ? "غير مرتبطة" : "Not connected"}</strong>
          <p>{ar ? "لم يتم ربط مزود دفع أو حفظ بيانات بطاقة." : "No payment provider is connected and no card data is stored."}</p>
        </article>
      </div>

      <section className="mt-9">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="account-eyebrow">{ar ? "أدوات المحفظة" : "WALLET TOOLS"}</p><h2 className="mt-1 text-xl font-extrabold">{ar ? "اختار الصفحة اللي محتاجها" : "Choose where you want to go"}</h2></div><span className="text-xs text-muted">{ar ? "كل الصفحات للعرض فقط" : "Every page is read-only"}</span></div>
        <div className="wallet-shortcut-grid">
          {shortcuts.map((item) => <Link key={item.href} href={item.href} className="wallet-shortcut-card"><span>{item.eyebrow}</span><h3>{item.title}</h3><p>{item.text}</p><span className="wallet-shortcut-arrow" aria-hidden="true">{ar ? "←" : "→"}</span></Link>)}
        </div>
      </section>

      <p className="wallet-safety-note"><span>{ar ? "معلومة مهمة" : "IMPORTANT"}</span>{ar ? "قبل تفعيل أي رصيد، يحتاج المتجر إلى بوابة دفع آمنة، تحقق من العمليات، وسياسة واضحة للاسترداد. لا تحول أموالًا بناءً على هذه المعاينة." : "Before enabling balances, the store needs a secure gateway, transaction verification, and a clear refund policy. Do not transfer money based on this preview."}</p>
    </div>
  );
}
