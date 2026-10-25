import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { WalletSubpageLayout } from "@/components/wallet-subpage-layout";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "إضافة رصيد" : "Add funds", robots: { index: false, follow: false } };
}

export default async function AddFundsPage() {
  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentAccountUser()]);
  if (!user) redirect("/login?next=%2Faccount%2Fwallet%2Fadd-funds");
  const ar = locale === "ar";
  const methods = ar ? [
    { name: "فودافون كاش", description: "مخطط لها بعد تفعيل مزود دفع موثوق." },
    { name: "InstaPay", description: "غير متاح حتى تكتمل المراجعة والربط الآمن." },
    { name: "البطاقات البنكية", description: "لا يتم جمع أو تخزين بيانات البطاقات هنا." },
  ] : [
    { name: "Vodafone Cash", description: "Planned after a trusted payment provider is enabled." },
    { name: "InstaPay", description: "Unavailable until secure integration and review are complete." },
    { name: "Bank cards", description: "Card details are not collected or stored here." },
  ];

  return (
    <WalletSubpageLayout
      locale={locale}
      active="/account/wallet/add-funds"
      eyebrow={ar ? "إضافة رصيد" : "ADD FUNDS"}
      title={ar ? "إيداع آمن، لما يكون متاحًا" : "Funding, when it is ready"}
      description={ar ? "صفحة معلوماتية فقط؛ لا توجد عملية تحويل أو دفع مفعّلة حاليًا." : "An informational page only. No transfer or payment flow is enabled."}
    >
      <section className="wallet-status-panel">
        <div><span className="wallet-card-label">{ar ? "حالة الإيداع" : "FUNDING STATUS"}</span><h2>{ar ? "غير متاح حاليًا" : "Unavailable right now"}</h2><p>{ar ? "لم يتم ربط بوابة دفع معتمدة، لذلك لن نطلب منك تحويل أموال أو إدخال بيانات بطاقة." : "No approved payment gateway is connected, so we will not ask you to transfer money or enter card details."}</p></div>
        <span className="wallet-disabled-badge">{ar ? "غير مفعّل" : "NOT ENABLED"}</span>
      </section>

      <section className="mt-8">
        <div className="mb-4"><p className="account-eyebrow">{ar ? "طرق مقترحة" : "PLANNED OPTIONS"}</p><h2 className="mt-1 text-xl font-extrabold">{ar ? "وسائل الإيداع" : "Funding options"}</h2></div>
        <div className="wallet-method-grid">{methods.map((method) => <article key={method.name} className="wallet-method-card"><div className="wallet-method-heading"><h3>{method.name}</h3><span>{ar ? "مخطط" : "PLANNED"}</span></div><p>{method.description}</p></article>)}</div>
      </section>

      <div className="wallet-page-footer"><p>{ar ? "لن نفعّل الإيداعات قبل اختبار مزود الدفع وسياسة الاسترداد وحماية بيانات العملاء." : "Deposits will remain disabled until the provider, refund policy, and customer-data safeguards are reviewed."}</p><Link href="/contact" className="wallet-text-link">{ar ? "تواصل مع الدعم" : "Contact support"}<span aria-hidden="true">{ar ? "←" : "→"}</span></Link></div>
    </WalletSubpageLayout>
  );
}
