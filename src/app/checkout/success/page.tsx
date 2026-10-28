import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { orderExistsByNumber } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.meta.successTitle,
    robots: { index: false, follow: false },
  };
}

type SearchParams = Promise<{ order?: string | string[] }>;

/** The public receipt confirms only that a demo-order reference exists. */
export default async function OrderSuccessPage(props: {
  searchParams: SearchParams;
}) {
  const { order: rawOrder } = await props.searchParams;
  const orderNumber = Array.isArray(rawOrder) ? rawOrder[0] : rawOrder;
  if (!orderNumber || !(await orderExistsByNumber(orderNumber))) notFound();

  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <div className="glass-card card-glow-green overflow-hidden">
        <div className="relative px-6 py-10 text-center sm:px-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(30rem_12rem_at_50%_-20%,rgba(34,197,94,0.14),transparent_70%)]"
          />
          <span
            aria-hidden="true"
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-success/40 bg-success/10 text-3xl shadow-[0_0_50px_-16px_color-mix(in_srgb,var(--accent-green)_55%,transparent)]"
          >
            ✓
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">
            {t.success.title}{" "}
            <span className="text-success">{t.success.titleAccent}</span>
          </h1>
          <p role="status" className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
            {t.success.thanksLine}
          </p>
          <p
            className="mt-5 inline-block rounded-lg border border-edge bg-raised/60 px-4 py-2 font-mono text-sm"
            dir="ltr"
          >
            {orderNumber}
          </p>
        </div>

        <div className="border-t border-edge px-6 py-8 sm:px-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {t.success.privacyTitle}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {t.success.privacyText}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/products" className="btn-primary flex-1">
              {t.success.continueShopping}
            </Link>
            <Link href="/" className="btn-ghost flex-1">
              {t.success.backHome}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
