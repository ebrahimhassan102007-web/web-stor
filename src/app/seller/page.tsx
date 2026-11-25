import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db, categories } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { formatCents } from "@/lib/money";
import { sellerPayoutLedger } from "@/lib/marketplace/payout-policy";
import { loadSellerContext } from "@/lib/marketplace/seller-session";
import {
  countSellerVaultStock,
  listSellerProducts,
  loadSellerPayoutOrders,
} from "@/lib/marketplace/seller-store";
import { SELLER_GATE_KEYS } from "@/lib/marketplace/seller-gate";
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
 * Amazon-style Seller Central (Wave 6).
 *
 * Isolated merchant portal — server-rendered, per-user, never cached (`/seller`
 * is in the proxy's private prefix list, so it always answers
 * `Cache-Control: private, no-store`).
 *
 * Three layers, in the order a merchant needs them:
 *   1. **Executive KPI ribbon** — gross sales, payout-eligible, escrow/dispute
 *      held, platform commission and active sealed vault codes.
 *   2. **Security readiness tracker** — the same three gates the API enforces
 *      (email → 2FA → owner approval), each with the exact next step.
 *   3. **Workspace** — listings, vault stock import and performance, only when
 *      every gate is satisfied. Even then each write is re-checked server-side
 *      in `/api/seller/**`.
 *
 * Every number here is derived from rows that already belong to this seller;
 * no buyer identity, auth data or delivery secret is ever selected.
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
  let settledOrders = 0;
  let vaultStock = 0;

  if (seller) {
    const [productRows, payoutOrders, allCategories, sealedCodes] = await Promise.all([
      listSellerProducts(db, seller.id),
      loadSellerPayoutOrders(db, seller.id),
      db
        .select({ id: categories.id, name: categories.name, nameAr: categories.nameAr })
        .from(categories)
        .orderBy(asc(categories.id)),
      countSellerVaultStock(db, seller.id),
    ]);
    products = productRows;
    categoryRows = allCategories;
    ledger = sellerPayoutLedger(payoutOrders);
    settledOrders = payoutOrders.length;
    vaultStock = sealedCodes;
  }

  // The tracker mirrors `evaluateSellerGates` one-to-one (same keys, same
  // order), so the bar can never claim something the API would refuse.
  const stepLinks: Record<string, string> = {
    email: "/account",
    "two-factor": "/account",
    approval: "/seller",
  };
  const stepHints: Record<string, string> = {
    email: t.sellerKpi.fixEmail,
    "two-factor": t.sellerKpi.fixTwoFactor,
    approval: t.sellerKpi.fixApproved,
  };
  const stepLabels: Record<string, string> = {
    email: t.sellerKpi.stepEmail,
    "two-factor": t.sellerKpi.stepTwoFactor,
    approval: t.sellerKpi.stepApproved,
  };
  const completed = SELLER_GATE_KEYS.filter(
    (key) => gates.checks.find((check) => check.key === key)?.ok,
  ).length;

  const kpis = ledger
    ? [
        { label: t.sellerKpi.gross, value: formatCents(ledger.grossSalesCents, locale), tone: "text-foreground" },
        { label: t.sellerKpi.eligible, value: formatCents(ledger.payoutEligibleCents, locale), tone: "text-success" },
        { label: t.sellerKpi.escrow, value: formatCents(ledger.escrowHeldCents, locale), tone: "text-champagne" },
        { label: t.sellerKpi.commission, value: formatCents(ledger.commissionCents, locale), tone: "text-muted" },
        { label: t.sellerKpi.vaultStock, value: String(vaultStock), tone: "text-foreground" },
      ]
    : [];

  return (
    <div className="shell py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">E-VORA / {ar ? "بوابة التجار" : "SELLER CENTRAL"}</p>
          <h1 className="title-luxe mt-2 text-3xl sm:text-4xl">{t.seller.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">{t.seller.subtitle}</p>
          <p className="mt-1 text-xs text-muted">{t.seller.privateNote}</p>
        </div>
        {seller && (
          <span className={seller.status === "approved" ? "badge-green" : "badge-champagne"}>
            {statusLabel}
          </span>
        )}
      </div>

      {/* ------------------------------------------------------------ */}
      {/* KPI ribbon                                                   */}
      {/* ------------------------------------------------------------ */}
      {seller && ledger && (
        <section aria-label={t.sellerKpi.ribbonTitle} className="mt-6">
          <div className="stagger grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {kpis.map((kpi, index) => (
              <div key={kpi.label} className="kpi-tile tactile" style={{ "--i": index } as React.CSSProperties}>
                <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">{kpi.label}</p>
                <strong className={`mt-1.5 block text-xl font-extrabold sm:text-2xl ${kpi.tone}`}>
                  {kpi.value}
                </strong>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>{ar ? `طلبات مكتملة: ${settledOrders}` : `Settled order lines: ${settledOrders}`}</span>
            <span aria-hidden>·</span>
            <span>{t.sellerKpi.listingsCount.replace("{count}", String(products.length))}</span>
            <span aria-hidden>·</span>
            <span>{t.sellerKpi.activeCount.replace("{count}", String(products.filter((row) => row.isActive).length))}</span>
            {seller.payoutBlockedAt !== null && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                {t.seller.payoutBlocked}
              </span>
            )}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Security readiness tracker                                   */}
      {/* ------------------------------------------------------------ */}
      <section aria-label={t.sellerKpi.readiness} className="command-panel mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{t.sellerKpi.readiness}</h2>
          <span className="badge-neutral" dir="ltr">
            {completed}/3
          </span>
        </div>

        {/* Progress rail: three segments, champagne when satisfied. */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3" role="list">
          {SELLER_GATE_KEYS.map((key, index) => {
            const ok = gates.checks.find((check) => check.key === key)?.ok ?? false;
            return (
              <div
                key={key}
                role="listitem"
                className={`rounded-xl border p-3.5 transition-colors duration-200 ${
                  ok ? "border-success/35 bg-success/[0.07]" : "border-edge bg-raised/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold ${
                      ok ? "bg-success/20 text-success" : "bg-primary/15 text-primary"
                    }`}
                  >
                    {ok ? "✓" : index + 1}
                  </span>
                  <p className="text-sm font-semibold">{stepLabels[key]}</p>
                  <span className="sr-only">{ok ? "OK" : "TODO"}</span>
                </div>
                {!ok && (
                  <Link
                    href={stepLinks[key]}
                    className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-primary hover:underline"
                  >
                    {stepHints[key]}
                    <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-3 rounded-xl bg-amber-500/[.07] px-3 py-2 text-xs leading-6 text-muted">
          {gates.ready ? t.seller.ready : t.seller.notReady}
        </p>
        {!gates.ready && (
          <p className="mt-2 text-xs font-semibold text-primary">{ar ? gates.blockerAr : gates.blockerEn}</p>
        )}
        {seller && (
          <p className="mt-2 text-xs text-muted" dir="ltr">
            {seller.storeSlug}
          </p>
        )}
      </section>

      {!seller ? (
        <section className="command-panel mt-6 p-5 sm:p-6">
          <h2 className="text-lg font-bold">{t.seller.applyTitle}</h2>
          <p className="mt-2 text-sm text-muted">{t.seller.applySubtitle}</p>
          <div className="mt-5">
            <SellerApplyForm />
          </div>
        </section>
      ) : gates.ready ? (
        <section className="mt-6" aria-label={t.sellerKpi.workspace}>
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
            performance={{
              settledOrders,
              grossCents: ledger?.grossSalesCents ?? 0,
              commissionCents: ledger?.commissionCents ?? 0,
              escrowCents: ledger?.escrowHeldCents ?? 0,
              eligibleCents: ledger?.payoutEligibleCents ?? 0,
              vaultStock,
            }}
            canPublish
          />
        </section>
      ) : (
        <p className="mt-6 rounded-xl border border-edge bg-raised/40 px-4 py-3 text-sm text-muted">
          {t.seller.notReady}
        </p>
      )}
    </div>
  );
}
