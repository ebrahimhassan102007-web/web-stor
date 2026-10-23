import type { Metadata } from "next";
import { InformationPage } from "@/components/information-page";
import { getI18n } from "@/lib/i18n/server";
import { staticPages } from "@/lib/i18n/static-pages";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  const page = staticPages[locale].faq;
  return { title: page.title, description: page.lead };
}

export default async function FaqPage() {
  const { locale } = await getI18n();
  const page = staticPages[locale].faq;

  return (
    <InformationPage page={page}>
      <section className="mt-6" aria-label={page.itemsHeading}>
        <h2 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">
          {page.itemsHeading}
        </h2>
        <div className="space-y-3">
          {page.items.map((item, index) => (
            <details key={item.question} className="glass-card group p-5 sm:p-6">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 font-semibold leading-6 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-edge text-lg text-primary transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-4 border-t border-edge pt-4 text-sm leading-7 text-muted sm:text-base">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </section>
    </InformationPage>
  );
}
