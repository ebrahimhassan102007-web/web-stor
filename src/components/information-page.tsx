import Link from "next/link";
import type { ReactNode } from "react";
import type { InformationPageCopy } from "@/lib/i18n/static-pages";

export function InformationPage({
  page,
  children,
}: {
  page: InformationPageCopy;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <nav aria-label={page.backHome} className="mb-6">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4 rtl:-scale-x-100"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 18 9 12l6-6" />
          </svg>
          {page.backHome}
        </Link>
      </nav>

      <header className="glass-card relative isolate overflow-hidden p-7 sm:p-10 lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(45rem_20rem_at_90%_0%,var(--glow-red),transparent_65%)]"
        />
        <span className="badge-green">{page.eyebrow}</span>
        <h1 className="mt-5 max-w-4xl text-balance text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
          {page.title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted sm:text-lg">
          {page.lead}
        </p>
      </header>

      {page.sections.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {page.sections.map((section, index) => (
            <section
              key={section.heading}
              className="glass-card p-5 sm:p-7"
              aria-labelledby={`info-section-${index}`}
            >
              <h2
                id={`info-section-${index}`}
                className="text-lg font-bold tracking-tight sm:text-xl"
              >
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-muted sm:text-base">
                {section.paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex}>{paragraph}</p>
                ))}
              </div>
              {section.bullets && section.bullets.length > 0 && (
                <ul className="mt-4 space-y-2.5">
                  {section.bullets.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-foreground">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {children}

      <p className="mt-8 border-s-2 border-primary/50 py-1 ps-4 text-xs leading-6 text-muted">
        {page.closingNote}
      </p>
    </div>
  );
}
