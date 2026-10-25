import type { ReactNode } from "react";
import { AccountNav } from "@/components/account-nav";
import { WalletNav } from "@/components/wallet-nav";
import type { Locale } from "@/lib/i18n/dictionary";

export function WalletSubpageLayout({
  locale,
  active,
  eyebrow,
  title,
  description,
  children,
}: {
  locale: Locale;
  active: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="account-page-enter mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="account-page-heading">
        <div><p className="account-eyebrow">E‑VORA / {eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
        <span className="wallet-preview-pill">{locale === "ar" ? "معاينة فقط" : "PREVIEW ONLY"}</span>
      </header>
      <AccountNav locale={locale} active="/account/wallet" />
      <WalletNav locale={locale} active={active} />
      {children}
    </div>
  );
}
