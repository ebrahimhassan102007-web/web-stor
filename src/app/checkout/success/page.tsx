import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByNumber } from "@/lib/catalog";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Order Confirmed" };

type SearchParams = Promise<{ order?: string | string[] }>;

export default async function OrderSuccessPage(props: {
  searchParams: SearchParams;
}) {
  const { order: rawOrder } = await props.searchParams;
  const orderNumber = Array.isArray(rawOrder) ? rawOrder[0] : rawOrder;
  if (!orderNumber) notFound();

  const result = await getOrderByNumber(orderNumber);
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
            Order <span className="text-success">Confirmed</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
            Thank you, {order.customerName}. A confirmation was sent to{" "}
            <span className="text-foreground">{order.email}</span>.
          </p>
          <p className="mt-4 inline-block rounded-lg border border-edge bg-raised/60 px-4 py-2 font-mono text-sm">
            {order.orderNumber}
          </p>
        </div>

        <div className="px-6 py-8 sm:px-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Items
          </h2>
          <ul className="mt-3 divide-y divide-edge">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 py-3 text-sm">
                <span>
                  {item.productName}{" "}
                  <span className="text-muted">×{item.quantity}</span>
                </span>
                <span className="font-medium tabular-nums">
                  {formatCents(item.unitPriceCents * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-edge pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular-nums">{formatCents(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Shipping</dt>
              <dd className="tabular-nums">
                {order.shippingCents === 0 ? (
                  <span className="text-success">Free</span>
                ) : (
                  formatCents(order.shippingCents)
                )}
              </dd>
            </div>
            <div className="flex justify-between pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCents(order.totalCents)}</dd>
            </div>
          </dl>

          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
            Shipping to
          </h2>
          <address className="mt-2 text-sm not-italic text-muted leading-relaxed">
            <span className="text-foreground">{order.customerName}</span>
            <br />
            {order.addressLine1}
            {order.addressLine2 && (
              <>
                <br />
                {order.addressLine2}
              </>
            )}
            <br />
            {order.city}, {order.postalCode}
            <br />
            {order.country}
          </address>

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
