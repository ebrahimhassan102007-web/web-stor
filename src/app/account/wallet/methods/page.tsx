import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { WalletSubpageLayout } from "@/components/wallet-subpage-layout";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "طرق الدفع" : "Payment methods", robots: { index: false, follow: false } };
}

export default async function WalletMethodsPage() {
  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentAccountUser()]);
  if (!user) redirect("/login?next=%2Faccount%2Fwallet%2Fmethods");
  const ar = locale === "ar";

  return (
    <WalletSubpageLayout
      locale={locale}
      active="/account/wallet/methods"
      eyebrow={ar ? "طرق الدفع" : "PAYMENT METHODS"}
      title={ar ? "إعدادات دفع آمنة وواضحة" : "Payment settings, handled with care"}
      description={ar ? "إدارة وسائل الدفع لا تتوفر إلا بعد ربط مزود دفع متوافق وآمن." : "Payment methods can only be managed after a secure, supported provider is connected."}
    >
      <section className="wallet-empty-panel wallet-methods-empty">
        <span className="wallet-card-label">{ar ? "لا توجد وسائل دفع محفوظة" : "NO SAVED PAYMENT METHODS"}</span>
        <h2>{ar ? "بياناتك المالية غير مخزنة هنا" : "Your payment details are not stored here"}</h2>
        <p>{ar ? "المتجر لا يقبل بيانات بطاقات ولا يحتفظ بأرقام حسابات. عند تفعيل الدفع، ستتم معالجته عبر مزود آمن بدلًا من تخزينه مباشرة." : "The store does not accept card details or keep account numbers. If payments are enabled later, they should be handled by a secure provider rather than stored directly."}</p>
        <div className="wallet-security-points"><span>{ar ? "لا توجد بطاقات محفوظة" : "No cards on file"}</span><span>{ar ? "لا يوجد دفع مباشر" : "No direct payment"}</span><span>{ar ? "لا توجد بيانات حساسة مخزنة" : "No sensitive data stored"}</span></div>
        <Link href="/account/wallet/add-funds" className="wallet-text-link">{ar ? "عرض خيارات الإيداع" : "Review funding options"}<span aria-hidden="true">{ar ? "←" : "→"}</span></Link>
      </section>
    </WalletSubpageLayout>
  );
}
