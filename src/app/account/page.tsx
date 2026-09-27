import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, orders } from "@/lib/db";
import { getSessionUser } from "@/lib/security/auth";
import { formatCents } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "حسابي" };

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");

  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))
    .limit(100);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">
        أهلاً، <span className="text-primary">{user.name}</span>
      </h1>
      <p className="mt-1 text-sm text-muted ltr-inline">{user.email}</p>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-extrabold">طلباتي</h2>

        {rows.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-4xl" aria-hidden>📦</p>
            <p className="mt-4 font-bold">لا توجد طلبات بعد</p>
            <p className="mt-1 text-sm text-muted">
              عند شرائك أي خدمة ستظهر هنا مع تفاصيل التسليم.
            </p>
            <Link href="/products" className="btn-primary mt-6 px-8">
              تصفح الخدمات
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((o) => (
              <Link
                key={o.orderNumber}
                href={`/account/orders/${encodeURIComponent(o.orderNumber)}`}
                className="glass-card card-glow-red flex flex-wrap items-center justify-between gap-3 p-5 transition-colors hover:border-white/20"
              >
                <div>
                  <p className="font-mono text-sm font-bold ltr-inline">
                    {o.orderNumber}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {new Intl.DateTimeFormat("ar-EG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(o.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <OrderStatusBadge status={o.status} />
                  <span className="font-extrabold tabular-nums">
                    {formatCents(o.totalCents)}
                  </span>
                  <span aria-hidden className="text-muted">←</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
