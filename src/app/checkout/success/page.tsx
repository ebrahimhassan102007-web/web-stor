import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByNumber } from "@/lib/catalog";
import { formatCents } from "@/lib/money";
import { CopyButton } from "@/components/copy-button";
import { getI18n } from "@/lib/i18n/server";
import {
  fill,
  REGION_CODES,
  type Dict,
  type RegionCode,
} from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.successTitle };
}

type SearchParams = Promise<{ order?: string | string[] }>;

/** Renders the stored "type:value" delivery target, localized. */
function deliveryTarget(info: string | null, t: Dict): string | null {
  if (!info) return null;
  const sep = info.indexOf(":");
  if (sep < 0) return info;
  const type = info.slice(0, sep);
  const value = info.slice(sep + 1);
  if (type === "player-id") return `🎮 ${t.success.playerIdLabel} ${value}`;
  if (type === "region") {
    const label = REGION_CODES.includes(value as RegionCode)
      ? t.regions[value as RegionCode]
      : value;
    return `🌐 ${t.success.regionLabel} ${label}`;
  }
  return value;
}

export default async function OrderSuccessPage(props: {
  searchParams: SearchParams;
}) {
  const { order: rawOrder } = await props.searchParams;
  const orderNumber = Array.isArray(rawOrder) ? rawOrder[0] : rawOrder;
  if (!orderNumber) notFound();

  const [{ locale, t }, result] = await Promise.all([
    getI18n(),
    getOrderByNumber(orderNumber),
  ]);
  if (!result) notFound();

  const { order, items } = result;

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
          <p className="mt-2 text-sm text-muted">
            {fill(t.success.thanksLine, {
              name: order.customerName,
              email: order.email,
            })}
          </p>
          <p className="mt-4 inline-block rounded-lg border border-edge bg-raised/60 px-4 py-2 font-mono text-sm" dir="ltr">
            {order.orderNumber}
          </p>
        </div>

        <div className="px-6 py-8 sm:px-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            🎟️ {t.success.yourCodes}
          </h2>

          <div className="mt-4 space-y-5">
            {items.map((item) => {
              const codes = item.deliveryCode
                ? item.deliveryCode.split("\n").filter(Boolean)
                : [];
              const target = deliveryTarget(item.deliveryInfo, t);
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-edge bg-raised/40 p-4"
                >
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-semibold">
                      {locale === "ar" && item.productNameAr
                        ? item.productNameAr
                        : item.productName}{" "}
                      <span className="text-muted font-normal">×{item.quantity}</span>
                    </span>
                    <span className="font-medium tabular-nums shrink-0">
                      {formatCents(item.unitPriceCents * item.quantity, locale)}
                    </span>
                  </div>

                  {target && (
                    <p className="mt-1.5 text-xs text-success font-medium">{target}</p>
                  )}

                  {codes.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {codes.map((code) => (
                        <li
                          key={code}
                          className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 px-3.5 py-2.5"
                        >
                          <code
                            dir="ltr"
                            className="font-mono text-sm sm:text-base font-bold tracking-wider text-success select-all break-all"
                          >
                            {code}
                          </code>
                          <CopyButton code={code} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-muted">{t.success.saveNote}</p>

          <dl className="mt-6 space-y-2 border-t border-edge pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t.success.subtotal}</dt>
              <dd className="tabular-nums">{formatCents(order.subtotalCents, locale)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t.success.delivery}</dt>
              <dd className="text-success font-medium">{t.success.instantFree}</dd>
            </div>
            <div className="flex justify-between pt-2 text-base font-bold">
              <dt>{t.success.total}</dt>
              <dd className="tabular-nums">{formatCents(order.totalCents, locale)}</dd>
            </div>
          </dl>

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
