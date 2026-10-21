import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { orderExistsByNumber } from "@/lib/catalog";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.successTitle };
}

type SearchParams = Promise<{ order?: string | string[] }>;

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
        <div className="relative px-6 py-10 sm:px-10 text-center border-b border-edge">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(30rem_12rem_at_50%_-20%,rgba(34,197,94,0.14),transparent_70%)]"
          />
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-success/40 bg-success/10 text-3xl">
            ✓
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">
            {t.success.title}{" "}
            <span className="text-success">{t.success.titleAccent}</span> 🎉
          </h1>
          <p className="mt-2 text-sm text-muted">{t.success.thanksLine}</p>
          <p className="mt-4 inline-block rounded-lg border border-edge bg-raised/60 px-4 py-2 font-mono text-sm" dir="ltr">
            {orderNumber}
          </p>
        </div>

        <div className="px-6 py-8 sm:px-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            🎟️ {t.success.yourCodes}
          </h2>
          <p className="mt-4 text-sm text-muted">{t.success.saveNote}</p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
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
