import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { AccountNav } from "@/components/account-nav";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "طلباتي" : "My orders", robots: { index: false, follow: false } };
}
export default async function OrdersPage() {
  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentAccountUser()]);
  if (!user) redirect("/login?next=%2Faccount%2Forders");
  const ar = locale === "ar";
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
    <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">E‑VORA / ORDERS</p>
    <h1 className="mt-2 text-3xl font-extrabold">{ar ? "طلباتي" : "My orders"}</h1>
    <p className="mt-2 text-sm text-muted">{ar ? "كل طلباتك وحالة تنفيذها هتظهر هنا." : "Your purchases and their status will appear here."}</p>
    <div className="mt-7"><AccountNav locale={locale} active="/account/orders" /></div>
    <section className="glass-card mt-4 px-5 py-14 text-center sm:py-20">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-3xl">🧾</span>
      <h2 className="mt-5 text-xl font-bold">{ar ? "لسه مفيش طلبات" : "No orders yet"}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">{ar ? "لما تشتري منتج وتكتمل عملية الطلب، تفاصيله هتظهر هنا. المعاينة الحالية لا تنفذ مدفوعات أو تسليم رقمي." : "Once an order is completed, its details will appear here. This preview does not process payments or deliver digital goods."}</p>
      <Link href="/products" className="btn-primary mt-6 inline-flex px-5 py-3 text-sm">{ar ? "تصفح المنتجات" : "Browse products"} →</Link>
    </section>
  </div>;
}
