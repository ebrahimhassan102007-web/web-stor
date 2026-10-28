import Link from "next/link";
import type { Locale } from "@/lib/i18n/dictionary";

const items = {
  en: [
    { href: "/account", label: "Overview", icon: "⌂" },
    { href: "/account/wallet", label: "Wallet & deposits", icon: "▣" },
    { href: "/account/orders", label: "My orders", icon: "▤" },
    { href: "/products", label: "Browse products", icon: "✦" },
  ],
  ar: [
    { href: "/account", label: "نظرة عامة", icon: "⌂" },
    { href: "/account/wallet", label: "المحفظة والإيداع", icon: "▣" },
    { href: "/account/orders", label: "طلباتي", icon: "▤" },
    { href: "/products", label: "تصفح المنتجات", icon: "✦" },
  ],
};

export function AccountNav({ locale, active }: { locale: Locale; active: string }) {
  return (
    <nav aria-label={locale === "ar" ? "أقسام حسابك" : "Account sections"} className="mb-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items[locale].map((item) => (
        <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined}
          className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.99] ${
            active === item.href
              ? "border-champagne/40 bg-champagne/10 text-champagne"
              : "border-edge bg-card/60 text-muted hover:-translate-y-0.5 hover:border-champagne/30 hover:text-foreground"
          }`}>
          <span aria-hidden className="text-base">{item.icon}</span><span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
