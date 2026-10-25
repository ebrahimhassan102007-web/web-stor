import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { WalletSubpageLayout } from "@/components/wallet-subpage-layout";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "سجل حركات الرصيد" : "Balance activity", robots: { index: false, follow: false } };
}

export default async function WalletTransactionsPage() {
  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentAccountUser()]);
  if (!user) redirect("/login?next=%2Faccount%2Fwallet%2Ftransactions");
  const ar = locale === "ar";

  return (
    <WalletSubpageLayout
      locale={locale}
      active="/account/wallet/transactions"
      eyebrow={ar ? "سجل الحركات" : "ACTIVITY"}
      title={ar ? "حركات الرصيد" : "Balance activity"}
      description={ar ? "سجل واضح لأي حركة مالية مرتبطة بمحفظتك." : "A clear history of financial activity associated with your wallet."}
    >
      <section className="wallet-empty-panel">
        <span className="wallet-empty-rule" aria-hidden="true" />
        <span className="wallet-card-label">{ar ? "لا توجد معاملات" : "NO TRANSACTIONS"}</span>
        <h2>{ar ? "سجل الحركات فارغ" : "Your activity is clear"}</h2>
        <p>{ar ? "لا توجد معاملات رصيد مسجلة. طلبات المتجر التجريبية منفصلة عن المحفظة ولا تمثل مدفوعات فعلية." : "There are no balance transactions on record. Demo store orders are separate from the wallet and are not real payments."}</p>
        <Link href="/account/orders" className="wallet-text-link">{ar ? "عرض سجل الطلبات" : "View order history"}<span aria-hidden="true">{ar ? "←" : "→"}</span></Link>
      </section>
    </WalletSubpageLayout>
  );
}
