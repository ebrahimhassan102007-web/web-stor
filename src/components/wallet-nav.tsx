import Link from "next/link";
import type { Locale } from "@/lib/i18n/dictionary";

const walletItems = {
  en: [
    { href: "/account/wallet", label: "Overview" },
    { href: "/account/wallet/add-funds", label: "Add funds" },
    { href: "/account/wallet/transactions", label: "Activity" },
    { href: "/account/wallet/methods", label: "Payment methods" },
  ],
  ar: [
    { href: "/account/wallet", label: "نظرة عامة" },
    { href: "/account/wallet/add-funds", label: "إضافة رصيد" },
    { href: "/account/wallet/transactions", label: "سجل الحركات" },
    { href: "/account/wallet/methods", label: "طرق الدفع" },
  ],
};

export function WalletNav({ locale, active }: { locale: Locale; active: string }) {
  return (
    <nav aria-label={locale === "ar" ? "أقسام الرصيد" : "Balance sections"} className="wallet-tabs">
      {walletItems[locale].map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active === item.href ? "page" : undefined}
          className={`wallet-tab ${active === item.href ? "is-active" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
