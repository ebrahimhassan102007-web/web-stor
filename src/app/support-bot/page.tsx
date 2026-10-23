import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === "ar" ? "بوت الدعم" : "Support bot", robots: { index: false, follow: true } };
}
export default async function SupportBotPage() {
  const { locale } = await getI18n();
  const ar = locale === "ar";
  const rawUrl = process.env.SUPPORT_BOT_URL?.trim() ?? "";
  const botUrl = /^https:\/\//i.test(rawUrl) ? rawUrl : null;
  const username = process.env.SUPPORT_BOT_USERNAME?.trim().replace(/^@/, "") ?? "";
  return <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
    <section className="relative isolate overflow-hidden rounded-[2rem] border border-edge bg-gradient-to-br from-[#13253a] via-[#151b2a] to-[#101018] p-7 text-white sm:p-10">
      <div aria-hidden className="absolute -end-10 -top-12 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-4xl">🤖</div>
      <p className="relative mt-5 text-xs font-bold tracking-[.2em] text-sky-200">E‑VORA / SUPPORT BOT</p>
      <h1 className="relative mt-2 text-3xl font-black sm:text-4xl">{ar ? "مساعد E‑Vora" : "E‑Vora assistant"}</h1>
      <p className="relative mt-3 max-w-2xl text-sm leading-7 text-white/70">{ar ? "صفحة الوصول لبوت الدعم. اسأله عن الأقسام والمنتجات وطريقة الوصول للدعم البشري." : "Your shortcut to E‑Vora support. Ask about categories, products and how to reach human support."}</p>
    </section>
    <section className="glass-card mt-6 p-6 sm:p-8">
      <h2 className="text-xl font-bold">{ar ? "حساب البوت" : "Bot account"}</h2>
      {botUrl ? <><p className="mt-2 text-sm text-muted">{ar ? "اسم المستخدم:" : "Username:"} <strong className="text-foreground">{username ? "@"+username : (ar ? "غير محدد" : "Not set")}</strong></p><a href={botUrl} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5 inline-flex px-5 py-3 text-sm">{ar ? "افتح بوت الدعم" : "Open support bot"} ↗</a></> : <><span className="badge-neutral mt-3">{ar ? "البوت لم يتم ربطه بعد" : "Bot not connected yet"}</span><p className="mt-3 text-sm leading-7 text-muted">{ar ? "مش هحط يوزر وهمي. أول ما يتضاف رابط البوت واسم المستخدم في إعدادات الموقع، هيظهروا هنا تلقائياً." : "I won't invent a bot username. Once the bot URL and username are configured, they will appear here automatically."}</p></>}
      <div className="mt-7 border-t border-edge pt-5"><p className="text-sm font-semibold">{ar ? "محتاج مساعدة دلوقتي؟" : "Need help right now?"}</p><div className="mt-3 flex flex-wrap gap-2"><Link href="/contact" className="btn-ghost px-4 py-2 text-sm">{ar ? "تواصل مع الدعم" : "Contact support"}</Link><Link href="/faq" className="btn-ghost px-4 py-2 text-sm">{ar ? "الأسئلة الشائعة" : "FAQs"}</Link></div></div>
    </section>
  </div>;
}
