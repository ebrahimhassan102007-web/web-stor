import Link from "next/link";
import type { Locale } from "@/lib/i18n/dictionary";

const items = {
  en: [
    { href: "/account", label: "Overview" },
    { href: "/account/wallet", label: "Balance" },
    { href: "/account/orders", label: "Order history" },
    { href: "/products", label: "Browse products" },
  ],
  ar: [
    { href: "/account", label: "نظرة عامة" },
    { href: "/account/wallet", label: "الرصيد" },
    { href: "/account/orders", label: "الطلبات" },
    { href: "/products", label: "المنتجات" },
  ],
};

export function AccountNav({ locale, active }: { locale: Locale; active: string }) {
  return (
    <nav aria-label={locale === "ar" ? "أقسام حسابك" : "Account sections"} className="account-tabs">
      {items[locale].map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active === item.href ? "page" : undefined}
          className={`account-tab ${active === item.href ? "is-active" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
