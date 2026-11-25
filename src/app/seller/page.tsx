import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db, categories } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { formatCents } from "@/lib/money";
import { sellerPayoutLedger } from "@/lib/marketplace/payout-policy";
import { loadSellerContext } from "@/lib/marketplace/seller-session";
import { listSellerProducts, loadSellerPayoutOrders } from "@/lib/marketplace/seller-store";
import { SellerApplyForm } from "@/components/seller-apply-form";
import { SellerWorkspace } from "@/components/seller-workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.seller.title,
    description: t.seller.subtitle,
    robots: { index: false, follow: false },
  };
}

/**
 * Isolated merchant portal (S-26).
 *
 * Server-rendered, per-user, never cached (`/seller` is in the proxy's private
 * prefix list, so it always answers `Cache-Control: private, no-store`).
 *
 * The page shows the bilingual readiness checklist first — verified email,
 * TOTP 2FA, owner-approved profile — and only renders the workspace (listings,
 * stock import, money summary) for a fully gated seller. Even then every write
 * is re-checked server-side in `/api/seller/**`.
 */
export default async function SellerPage() {
  const [{ locale, t }, context] = await Promise.all([getI18n(), loadSellerContext()]);
  if (!context) redirect("/login?next=%2Fseller");
  const ar = locale === "ar";
  const { seller, gates } = context;

  const statusLabel = !seller
    ? ""
    : seller.status === "approved"
      ? t.seller.statusApproved
      : seller.status === "pending"
        ? t.seller.statusPending
        : seller.status === "rejected"
          ? t.seller.statusRejected
          : t.seller.statusSuspended;

  let products: Awaited<ReturnType<typeof listSellerProducts>> = [];
  let categoryRows: { id: number; name: string; nameAr: string }[] = [];
  let ledger: ReturnType<typeof sellerPayoutLedger> | null = null;

  if (seller) {
    const [productRows, payoutOrders, allCategories] = await Promise.all([
      listSellerProducts(db, seller.id),
      loadSellerPayoutOrders(db, seller.id),
      db
        .select({ id: categories.id, name: categories.name, nameAr: categories.nameAr })
        .from(categories)
        .orderBy(asc(categories.id)),
    ]);
    products = productRows;
    categoryRows = allCategories;
    ledger = sellerPayoutLedger(payoutOrders);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <p className="eyebrow">E‑VORA / MERCHANT</p>
      <h1 className="title-luxe mt-2 text-3xl">{t.seller.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t.seller.subtitle}</p>
      <p className="mt-1 text-xs text-muted">{t.seller.privateNote}</p>

      <section className="glass-card mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{t.seller.checklistTitle}</h2>
          {seller && <span className="badge-neutral">{statusLabel}</span>}
        </div>
        <ul className="mt-4 space-y-2">
          {gates.checks.map((check) => (
            <li key={check.key} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${
                  check.ok ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
                }`}
              >
                {check.ok ? "✓" : "✕"}
              </span>
              <span>{ar ? check.ar : check.en}</span>
              <span className="sr-only">{check.ok ? "OK" : "TODO"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-amber-500/[.07] px-3 py-2 text-xs leading-6 text-muted">
          {gates.ready ? t.seller.ready : t.seller.notReady}
        </p>
        {!gates.ready && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-primary">
              {ar ? gates.blockerAr : gates.blockerEn}
            </span>
            <Link href="/account" className="text-primary underline">
              {t.seller.goTwoFactor}
            </Link>
          </div>
        )}
        {seller && (
          <p className="mt-3 text-xs text-muted" dir="ltr">
            {seller.storeSlug}
          </p>
        )}
      </section>

      {!seller ? (
        <section className="glass-card mt-6 p-5 sm:p-6">
          <h2 className="text-lg font-bold">{t.seller.applyTitle}</h2>
          <p className="mt-2 text-sm text-muted">{t.seller.applySubtitle}</p>
          <div className="mt-5">
            <SellerApplyForm />
          </div>
        </section>
      ) : (
        <>
          {ledger && seller.status === "approved" && (
            <section className="glass-card mt-6 p-5 sm:p-6">
              <h2 className="text-lg font-bold">{t.seller.summaryTitle}</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: t.seller.gross, value: ledger.grossSalesCents },
                  { label: t.seller.commission, value: ledger.commissionCents },
                  { label: t.seller.escrow, value: ledger.escrowHeldCents },
                  { label: t.seller.eligible, value: ledger.payoutEligibleCents },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-edge bg-raised/40 p-4">
                    <dt className="text-xs text-muted">{item.label}</dt>
                    <dd className="mt-1 text-lg font-extrabold tabular-nums">
                      {formatCents(item.value, locale)}
                    </dd>
                  </div>
                ))}
              </dl>
              {ledger.grossSalesCents === 0 && (
                <p className="mt-3 text-xs text-muted">{t.seller.noSales}</p>
              )}
              {seller.payoutBlockedAt !== null && (
                <p className="mt-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                  {t.seller.payoutBlocked}
                </p>
              )}
            </section>
          )}

          {gates.ready ? (
            <SellerWorkspace
              products={products.map((product) => ({
                id: product.id,
                name: ar && product.nameAr ? product.nameAr : product.name,
                priceCents: product.priceCents,
                stock: product.stock,
                isActive: product.isActive,
              }))}
              categories={categoryRows.map((category) => ({
                id: category.id,
                name: ar && category.nameAr ? category.nameAr : category.name,
              }))}
              canPublish
            />
          ) : (
            <p className="mt-6 rounded-xl border border-edge bg-raised/40 px-4 py-3 text-sm text-muted">
              {t.seller.notReady}
            </p>
          )}
        </>
      )}
    </div>
  );
}
