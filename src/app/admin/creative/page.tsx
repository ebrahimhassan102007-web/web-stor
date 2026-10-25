import type { Metadata } from "next";
import Link from "next/link";
import { CopyIdeaButton } from "@/components/admin/copy-idea-button";
import { PageHeader } from "@/components/admin/ui";
import { getI18n } from "@/lib/i18n/server";
import { requireAdminUser } from "@/lib/security/admin-session";

export const metadata: Metadata = { title: "Creative Studio" };

export default async function AdminCreativePage() {
  await requireAdminUser();
  const { locale } = await getI18n();
  const ar = locale === "ar";
  const ideas = ar ? [
    { category: "حملة مجتمعية", title: "العب بطريقتك", copy: "كل لاعب له طريقته في الاستمتاع. استكشف اختيارات رقمية للألعاب والبطاقات والاشتراكات في مكان واحد، وخد وقتك لمراجعة تفاصيل كل منتج قبل الاختيار.", tags: ["الألعاب", "اكتشاف"] },
    { category: "دليل اختيار", title: "اختيار أذكى يبدأ بالتفاصيل", copy: "المنطقة والمنصة ومتطلبات الحساب بتفرق. افتح تفاصيل المنتج، راجع الشروط بهدوء، واختار اللي يناسبك قبل ما تكمل.", tags: ["نصائح", "وضوح"] },
    { category: "تعريف بالمتجر", title: "عالمك الرقمي في مكان واحد", copy: "من شحن الألعاب لبطاقات الهدايا والاشتراكات، تصفح كتالوج E‑Vora واكتشف الخيارات المتاحة لجمهور اللاعبين.", tags: ["E‑Vora", "الكتالوج"] },
  ] : [
    { category: "Community campaign", title: "Play your way", copy: "Every player has their own way to enjoy the game. Explore digital listings for games, gift cards, and subscriptions in one place, and take a moment to review each product before choosing.", tags: ["Gaming", "Discovery"] },
    { category: "Helpful guide", title: "A smarter choice starts with the details", copy: "Region, platform, and account requirements matter. Open the product details, review the requirements, and choose what fits before moving ahead.", tags: ["Tips", "Clarity"] },
    { category: "Brand introduction", title: "Your digital world, gathered in one place", copy: "From game top-ups to gift cards and subscriptions, browse the E‑Vora catalogue and discover digital listings curated for players.", tags: ["E‑Vora", "Catalogue"] },
  ];
  const headlines = ar
    ? ["اختار لعبتك الجاية.", "تفاصيل أوضح، اختيار أريح.", "اكتشف الكتالوج على مزاجك.", "كل لاعب له عالمه."]
    : ["Pick your next play.", "Clear details. Better choices.", "Explore the catalogue your way.", "Every player has a world."];

  return (
    <div className="admin-page-stack">
      <PageHeader
        eyebrow={ar ? "مساحة المتجر / الإبداع" : "STORE WORKSPACE / CREATIVE"}
        title={ar ? "الإبداع يبدأ بفكرة." : "Good ideas start here."}
        description={ar ? "مساحة بسيطة لأفكار الحملات والنصوص اللي تخاطب جمهور اللاعبين بوضوح." : "A focused space for campaign concepts and copy that speaks clearly to players."}
        action={<Link href="/products" className="admin-button-quiet" target="_blank" rel="noreferrer">{ar ? "شاهد الكتالوج" : "View catalogue"}<span aria-hidden="true">↗</span></Link>}
      />

      <section className="admin-creative-hero admin-enter">
        <div className="admin-creative-hero-content">
          <span className="admin-creative-kicker"><span aria-hidden="true">✦</span> {ar ? "استوديو الأفكار" : "THE IDEA STUDIO"}</span>
          <h2>{ar ? <>محتوى قريب من الناس،<br /><span>وواضح من أول كلمة.</span></> : <>Make it feel personal.<br /><span>Keep it beautifully clear.</span></>}</h2>
          <p>{ar ? "مسودات قصيرة جاهزة للتعديل والنسخ. اختار الفكرة، ظبط صوتها، وبعدها قرر بنفسك إذا كانت مناسبة للنشر." : "Short draft concepts to adapt and copy. Choose an idea, shape the voice, then decide whether it is ready to publish."}</p>
          <div className="mt-5 flex flex-wrap gap-2"><span className="admin-creative-chip">{ar ? "للألعاب" : "Player-first"}</span><span className="admin-creative-chip">{ar ? "واضح وصادق" : "Clear & honest"}</span><span className="admin-creative-chip">{ar ? "سهل التعديل" : "Easy to adapt"}</span></div>
        </div>
        <div className="admin-creative-visual" aria-hidden="true"><div className="admin-creative-sun" /><div className="admin-creative-orbit orbit-a" /><div className="admin-creative-orbit orbit-b" /><div className="admin-creative-star star-a">✦</div><div className="admin-creative-star star-b">✧</div><div className="admin-creative-card-float">E‑V</div></div>
      </section>

      <div className="admin-data-note" role="note"><span aria-hidden="true">ⓘ</span><p>{ar ? "كل النصوص هنا مسودات إبداعية فقط؛ لا يتم نشرها أو إرسالها تلقائيًا، وراجع تفاصيل أي عرض قبل استخدامه." : "These are creative drafts only. Nothing is published or sent automatically; verify any offer details before use."}</p></div>

      <section className="admin-panel admin-enter" style={{ animationDelay: "100ms" }}>
        <div className="admin-panel-heading"><div><p className="admin-section-kicker">{ar ? "أفكار جاهزة للتطوير" : "READY TO SHAPE"}</p><h2>{ar ? "بنك أفكار الحملات" : "Campaign concepts"}</h2></div><span className="admin-result-count">03 {ar ? "مسودات" : "drafts"}</span></div>
        <div className="admin-idea-grid">{ideas.map((idea, index) => <article key={idea.title} className={`admin-idea-card idea-tone-${index + 1}`} style={{ animationDelay: `${150 + index * 80}ms` }}>
          <div className="admin-idea-card-top"><span className="admin-idea-number">0{index + 1}</span><span className="admin-idea-type">{idea.category}</span></div>
          <h3>{idea.title}</h3>
          <p className="admin-idea-copy">{idea.copy}</p>
          <div className="admin-idea-footer"><div className="flex flex-wrap gap-1.5">{idea.tags.map((tag) => <span className="admin-idea-tag" key={tag}>#{tag}</span>)}</div><CopyIdeaButton text={idea.copy} locale={locale} /></div>
        </article>)}</div>
      </section>

      <section className="admin-creative-lower-grid">
        <article className="admin-panel admin-enter" style={{ animationDelay: "260ms" }}>
          <div className="admin-panel-heading"><div><p className="admin-section-kicker">{ar ? "عناوين سريعة" : "QUICK HEADLINES"}</p><h2>{ar ? "افتتاحيات قصيرة" : "Headline starters"}</h2></div></div>
          <div className="admin-headline-list">{headlines.map((headline, index) => <div className="admin-headline-row" key={headline}><span className="admin-headline-index">0{index + 1}</span><p>{headline}</p><CopyIdeaButton text={headline} locale={locale} /></div>)}</div>
        </article>
        <article className="admin-panel admin-brand-guide admin-enter" style={{ animationDelay: "320ms" }}>
          <div className="admin-panel-heading"><div><p className="admin-section-kicker">{ar ? "بوصلة العلامة" : "BRAND COMPASS"}</p><h2>{ar ? "صوت E‑Vora" : "The E‑Vora voice"}</h2></div><span className="admin-brand-guide-icon">✦</span></div>
          <ul className="admin-brand-principles">
            <li><span>01</span><div><b>{ar ? "حماسي من غير مبالغة" : "Enthusiastic, never exaggerated"}</b><p>{ar ? "شارك شغف الألعاب من غير وعود غير مؤكدة." : "Share the joy of gaming without unsupported promises."}</p></div></li>
            <li><span>02</span><div><b>{ar ? "واضح في التفاصيل" : "Clear about the details"}</b><p>{ar ? "اذكر المنطقة والمنصة والمتطلبات لما تكون مهمة." : "Call out region, platform, and requirements when they matter."}</p></div></li>
            <li><span>03</span><div><b>{ar ? "صادق في حالة الخدمة" : "Honest about availability"}</b><p>{ar ? "ما توعدش بخصم أو تسليم فوري من غير تحقق." : "Never promise a discount or instant delivery without verification."}</p></div></li>
          </ul>
        </article>
      </section>

      <div className="admin-creative-cta"><div><span className="admin-section-kicker">{ar ? "جاهز للخطوة التالية؟" : "READY FOR THE NEXT STEP?"}</span><h2>{ar ? "خلي الفكرة تقابل الكتالوج." : "Connect an idea to the catalogue."}</h2><p>{ar ? "راجع المنتجات والعروض قبل تجهيز أي محتوى للنشر." : "Review product listings and offers before preparing content for publishing."}</p></div><div className="flex flex-wrap gap-2"><Link href="/admin/products" className="admin-button-quiet">{ar ? "راجع المنتجات" : "Review products"}<span>↗</span></Link><Link href="/offers" className="admin-button-primary" target="_blank" rel="noreferrer">{ar ? "صفحة العروض" : "Offers page"}<span>↗</span></Link></div></div>
    </div>
  );
}
