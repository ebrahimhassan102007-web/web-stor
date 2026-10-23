import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "إدارة E‑Vora" : "E‑Vora administration", robots: { index: false, follow: false } };
}
export default async function AdminPage() {
  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentAccountUser()]);
  if (!user) redirect("/login?next=%2Fadmin");
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || user.email.toLowerCase() !== adminEmail) notFound();
  const ar = locale === "ar";
  const cards = [
    { href: "/products", icon: "▦", title: ar ? "كتالوج المنتجات" : "Product catalogue", text: ar ? "معاينة الأقسام والمنتجات الحالية." : "Review the current public catalogue." },
    { href: "/offers", icon: "🏷️", title: ar ? "العروض" : "Offers", text: ar ? "مراجعة المنتجات المميزة وصفحة العروض." : "Review featured items and the offers page." },
    { href: "/account/orders", icon: "🧾", title: ar ? "سجل الطلبات" : "Order history", text: ar ? "فتح سجل الطلبات المرتبط بحسابك." : "Open the signed-in account order history." },
    { href: "/support-bot", icon: "🤖", title: ar ? "بوت الدعم" : "Support bot", text: ar ? "التحقق من صفحة ربط بوت الدعم." : "Check the support bot connection page." },
  ];
  return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <p className="text-xs font-bold tracking-[.2em] text-primary">E‑VORA / ADMIN</p>
    <h1 className="mt-2 text-3xl font-black">{ar ? "لوحة إدارة المتجر" : "Store administration"}</h1>
    <p className="mt-2 text-sm text-muted">{ar ? "أهلاً " + user.displayName + " — دي لوحة دخول إدارية محمية." : "Welcome, " + user.displayName + " — this is a protected administration hub."}</p>
    <div className="mt-7 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm leading-7 text-muted">{ar ? "اللوحة دي حالياً نقطة إدارة آمنة وروابط مراجعة فقط. تعديل الأسعار والمخزون والطلبات أو إدارة المستخدمين محتاج صلاحيات وعمليات خلفية منفصلة؛ مش هنعرض أزرار شكلية توهمك إن التعديلات بتحصل." : "This is currently a protected admin hub with review links only. Editing prices, stock, orders or users requires separate server-side permissions and workflows; this page does not pretend those actions are implemented."}</div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map((card) => <Link key={card.href} href={card.href} className="glass-card group p-5 transition hover:-translate-y-1 hover:border-primary/40"><span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-2xl">{card.icon}</span><h2 className="mt-4 font-bold group-hover:text-primary">{card.title}</h2><p className="mt-2 text-sm leading-6 text-muted">{card.text}</p><span className="mt-4 inline-flex text-sm font-semibold text-primary">{ar ? "فتح الصفحة" : "Open page"} →</span></Link>)}</div>
  </div>;
}
