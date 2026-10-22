import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { orderExistsByNumber } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Demo Order Record" };

type SearchParams = Promise<{ order?: string | string[] }>;

/**
 * Public, anonymous order confirmation.
 *
 * Anyone holding the reference can open this page, so it deliberately shows
 * only the reference itself (after confirming it exists) — never the customer
 * name, email, address, order contents or totals. The heading states plainly
 * that this is a recorded demo order: nothing was paid or confirmed, no email
 * was sent and no stock was reserved.
 */
export default async function OrderSuccessPage(props: {
  searchParams: SearchParams;
}) {
  const { order: rawOrder } = await props.searchParams;
  const orderNumber = Array.isArray(rawOrder) ? rawOrder[0] : rawOrder;
  if (!orderNumber || !(await orderExistsByNumber(orderNumber))) notFound();

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
            Demo order <span className="text-success">recorded</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
            This order is not paid or confirmed: no payment was processed, no
            stock was reserved, and no confirmation email was sent.
          </p>
          <p className="mt-4 inline-block rounded-lg border border-edge bg-raised/60 px-4 py-2 font-mono text-sm">
            {orderNumber}
          </p>
        </div>

        <div className="px-6 py-8 sm:px-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Order privacy
          </h2>
          <p className="mt-3 text-sm text-muted leading-relaxed">
            For privacy, this public page shows only your order reference.
            Customer details, delivery address, items and totals are not
            displayed here, and this reference alone does not grant access to
            them.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link href="/products" className="btn-primary flex-1">
              Continue Shopping
            </Link>
            <Link href="/" className="btn-ghost flex-1">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
