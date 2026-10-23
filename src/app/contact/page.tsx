import type { Metadata } from "next";
import Link from "next/link";
import { InformationPage } from "@/components/information-page";
import { getI18n } from "@/lib/i18n/server";
import { staticPages } from "@/lib/i18n/static-pages";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  const page = staticPages[locale].contact;
  return { title: page.title, description: page.lead };
}

export default async function ContactPage() {
  const { locale } = await getI18n();
  const page = staticPages[locale].contact;
  const candidate = process.env.SUPPORT_EMAIL?.trim() ?? "";
  const supportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
    ? candidate
    : null;

  const cards = [
    {
      href: "/faq",
      mark: "?",
      title: page.faqCardTitle,
      text: page.faqCardText,
      action: page.faqCardLink,
    },
    {
      href: "/account",
      mark: "◎",
      title: page.accountCardTitle,
      text: page.accountCardText,
      action: page.accountCardLink,
    },
    {
      href: "/products",
      mark: "⌕",
      title: page.catalogueCardTitle,
      text: page.catalogueCardText,
      action: page.catalogueCardLink,
    },
  ];

  return (
    <InformationPage page={page}>
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="glass-card group flex min-h-full flex-col p-5 transition-transform hover:-translate-y-1 hover:border-primary/40 sm:p-6"
          >
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-xl font-bold text-primary"
            >
              {card.mark}
            </span>
            <h2 className="mt-4 text-lg font-bold">{card.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted">{card.text}</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              {card.action}
              <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
            </span>
          </Link>
        ))}
      </section>

      <section className="glass-card mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">
            {supportEmail ? page.emailCardTitle : page.emailNotConfiguredTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            {supportEmail ? page.emailCardText : page.emailNotConfiguredText}
          </p>
          {supportEmail && (
            <p className="mt-2 break-all text-sm font-medium text-foreground">
              {supportEmail}
            </p>
          )}
        </div>
        {supportEmail ? (
          <a href={`mailto:${supportEmail}`} className="btn-primary min-h-11 shrink-0 px-5">
            {page.emailConfiguredLabel}
          </a>
        ) : (
          <Link href="/faq" className="btn-ghost min-h-11 shrink-0 px-5">
            {page.faqCardLink}
          </Link>
        )}
      </section>
    </InformationPage>
  );
}
