/**
 * Seeds خدمتك ستور | Khodmtak Store with the initial catalog.
 *
 * - Idempotent: categories/products are upserted by slug; existing orders
 *   and users are never touched.
 * - Bootstraps the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD
 *   (required — no insecure default credentials).
 * - In NON-production only, adds clearly-marked DEV test codes to
 *   DIGITAL_CODE products that have no inventory, so the full
 *   checkout → payment → delivery pipeline can be exercised.
 *
 * Run: npm run db:seed   (after `npm run db:migrate`)
 */
import "dotenv/config";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, sql, and } from "drizzle-orm";
import {
  categories,
  products,
  users,
  digitalCodes,
} from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/security/password";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool });

/* Local copy of the codes encryption (scripts can't import server-only). */
function encryptCode(plaintext: string): string {
  const secret = process.env.INVENTORY_SECRET;
  if (!secret || secret.length < 16) throw new Error("INVENTORY_SECRET is not configured");
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${ct.toString("base64")}`;
}

const CATEGORIES = [
  { slug: "subscriptions", nameAr: "اشتراكات رقمية", nameEn: "Digital Subscriptions", icon: "⭐", sortOrder: 1, description: "اشتراكات البرامج والخدمات الرقمية المرخّصة" },
  { slug: "gaming", nameAr: "شحن ألعاب", nameEn: "Game Top-ups", icon: "🎮", sortOrder: 2, description: "شحن شدات ببجي وجواهر فري فاير وأكواد الألعاب" },
  { slug: "recharge", nameAr: "شحن رصيد", nameEn: "Mobile Recharge", icon: "📱", sortOrder: 3, description: "شحن رصيد فودافون وشبكات المحمول المصرية" },
  { slug: "gift-cards", nameAr: "بطاقات رقمية", nameEn: "Gift Cards", icon: "🎁", sortOrder: 4, description: "بطاقات هدايا رقمية أصلية لمختلف المنصات" },
  { slug: "services", nameAr: "خدمات رقمية", nameEn: "Digital Services", icon: "🛠️", sortOrder: 5, description: "خدمات رقمية احترافية حسب الطلب" },
] as const;

type SeedProduct = {
  slug: string;
  nameAr: string;
  nameEn: string;
  shortDescription: string;
  description: string;
  type: "DIGITAL_CODE" | "SUBSCRIPTION" | "GAME_TOPUP" | "MOBILE_RECHARGE" | "DIGITAL_SERVICE";
  category: (typeof CATEGORIES)[number]["slug"];
  priceCents: number;
  originalPriceCents?: number;
  stock: number;
  icon: string;
  deliveryNote?: string;
  featured?: boolean;
  reviewCount: number;
  rating: string;
};

const PRODUCTS: SeedProduct[] = [
  /* -------- اشتراكات رقمية -------- */
  { slug: "ai-plus-monthly", nameAr: "اشتراك ذكاء اصطناعي بلس — شهر", nameEn: "AI Plus — 1 Month", shortDescription: "اشتراك شهري رسمي بخدمة الذكاء الاصطناعي المتقدمة", description: "اشتراك شهري مرخّص في باقة الذكاء الاصطناعي المتقدمة. يتم التفعيل على بريدك الإلكتروني الذي تُدخله عند الشراء خلال ساعات العمل. الاشتراك أصلي ومضمون طوال المدة.", type: "SUBSCRIPTION", category: "subscriptions", priceCents: 89900, originalPriceCents: 99900, stock: 25, icon: "🤖", deliveryNote: "سيتواصل معك فريقنا لتفعيل الاشتراك على بريدك خلال مدة أقصاها 6 ساعات.", featured: true, reviewCount: 342, rating: "4.9" },
  { slug: "streaming-premium-3m", nameAr: "اشتراك منصة مشاهدة — 3 شهور", nameEn: "Streaming Premium — 3 Months", shortDescription: "اشتراك رسمي 3 شهور بجودة 4K", description: "اشتراك مرخّص لمدة ثلاثة أشهر في منصة المشاهدة بجودة تصل إلى 4K. يُفعَّل على حسابك الخاص الذي تحدده عند الطلب.", type: "SUBSCRIPTION", category: "subscriptions", priceCents: 64900, stock: 40, icon: "🎬", deliveryNote: "يتم التفعيل على حسابك خلال 6 ساعات من تأكيد الدفع.", reviewCount: 518, rating: "4.7" },
  { slug: "design-suite-yearly", nameAr: "اشتراك حزمة تصميم — سنة", nameEn: "Design Suite — 1 Year", shortDescription: "رخصة سنوية رسمية لحزمة التصميم الاحترافية", description: "رخصة سنوية أصلية لحزمة أدوات التصميم الاحترافية تشمل جميع التطبيقات والتحديثات. تفعيل رسمي على بريدك.", type: "SUBSCRIPTION", category: "subscriptions", priceCents: 449900, originalPriceCents: 549900, stock: 10, icon: "🎨", featured: true, reviewCount: 96, rating: "4.8" },

  /* -------- شحن ألعاب -------- */
  { slug: "pubg-660-uc", nameAr: "ببجي موبايل — 660 شدة", nameEn: "PUBG Mobile — 660 UC", shortDescription: "شحن مباشر على معرّف اللاعب", description: "شحن 660 شدة (UC) مباشرة على حسابك في ببجي موبايل عبر معرّف اللاعب. الشحن رسمي 100% ويظهر في حسابك فور تنفيذ الطلب.", type: "GAME_TOPUP", category: "gaming", priceCents: 34900, stock: 200, icon: "🔫", featured: true, reviewCount: 2140, rating: "4.9" },
  { slug: "pubg-1800-uc", nameAr: "ببجي موبايل — 1800 شدة", nameEn: "PUBG Mobile — 1800 UC", shortDescription: "أفضل قيمة لعشاق الببجي", description: "شحن 1800 شدة (UC) مباشرة على معرّف اللاعب الخاص بك. تنفيذ سريع وموثوق عبر قنوات الشحن الرسمية.", type: "GAME_TOPUP", category: "gaming", priceCents: 89900, originalPriceCents: 94900, stock: 150, icon: "🎯", featured: true, reviewCount: 1320, rating: "4.9" },
  { slug: "freefire-530-diamonds", nameAr: "فري فاير — 530 جوهرة", nameEn: "Free Fire — 530 Diamonds", shortDescription: "شحن جواهر فوري على معرّف اللاعب", description: "شحن 530 جوهرة فري فاير مباشرة على حسابك عبر معرّف اللاعب. شحن رسمي يظهر فوراً داخل اللعبة.", type: "GAME_TOPUP", category: "gaming", priceCents: 24900, stock: 300, icon: "💎", reviewCount: 1785, rating: "4.8" },

  /* -------- شحن رصيد -------- */
  { slug: "vodafone-50", nameAr: "شحن رصيد فودافون — 50 جنيه", nameEn: "Vodafone Recharge — 50 EGP", shortDescription: "شحن مباشر على رقمك", description: "شحن رصيد فودافون بقيمة 50 جنيهاً مباشرة على الرقم الذي تدخله عند الطلب. يصل الرصيد فور تنفيذ العملية.", type: "MOBILE_RECHARGE", category: "recharge", priceCents: 5250, stock: 500, icon: "📶", reviewCount: 3260, rating: "4.9" },
  { slug: "vodafone-100", nameAr: "شحن رصيد فودافون — 100 جنيه", nameEn: "Vodafone Recharge — 100 EGP", shortDescription: "شحن مباشر على رقمك", description: "شحن رصيد فودافون بقيمة 100 جنيه مباشرة على رقمك. تنفيذ فوري على مدار الساعة.", type: "MOBILE_RECHARGE", category: "recharge", priceCents: 10400, stock: 500, icon: "📱", featured: true, reviewCount: 2874, rating: "4.9" },
  { slug: "orange-50", nameAr: "شحن رصيد أورنج — 50 جنيه", nameEn: "Orange Recharge — 50 EGP", shortDescription: "شحن مباشر على رقمك", description: "شحن رصيد أورنج بقيمة 50 جنيهاً على الرقم الذي تحدده. يصل الرصيد فور التنفيذ.", type: "MOBILE_RECHARGE", category: "recharge", priceCents: 5250, stock: 400, icon: "🟠", reviewCount: 1642, rating: "4.8" },

  /* -------- بطاقات رقمية -------- */
  { slug: "google-play-10", nameAr: "بطاقة جوجل بلاي — 10 دولار", nameEn: "Google Play Gift Card — $10", shortDescription: "كود رقمي أصلي يصلك فوراً", description: "بطاقة جوجل بلاي الأمريكية بقيمة 10 دولارات. كود أصلي 100% يظهر في حسابك فور تأكيد الدفع، مع تعليمات الاستخدام.", type: "DIGITAL_CODE", category: "gift-cards", priceCents: 52900, stock: 0, icon: "▶️", deliveryNote: "افتح متجر Google Play ← الإعدادات ← تفعيل رمز — وأدخل الكود.", featured: true, reviewCount: 1204, rating: "4.9" },
  { slug: "playstation-25", nameAr: "بطاقة بلايستيشن — 25 دولار", nameEn: "PlayStation Card — $25", shortDescription: "كود PSN أمريكي أصلي", description: "بطاقة شحن محفظة بلايستيشن (الستور الأمريكي) بقيمة 25 دولاراً. كود أصلي يُسلَّم فور الدفع داخل حسابك.", type: "DIGITAL_CODE", category: "gift-cards", priceCents: 129900, stock: 0, icon: "🎮", deliveryNote: "من جهاز PlayStation: الإعدادات ← المستخدمون والحسابات ← استرداد رمز.", reviewCount: 689, rating: "4.8" },
  { slug: "steam-20", nameAr: "بطاقة ستيم — 20 دولار", nameEn: "Steam Gift Card — $20", shortDescription: "كود رقمي لمحفظة ستيم", description: "بطاقة شحن محفظة ستيم بقيمة 20 دولاراً. كود أصلي يُسلَّم فوراً في صفحة طلباتك بعد الدفع.", type: "DIGITAL_CODE", category: "gift-cards", priceCents: 104900, originalPriceCents: 109900, stock: 0, icon: "🚂", deliveryNote: "من عميل Steam: Games ← Redeem a Steam Wallet Code.", featured: true, reviewCount: 941, rating: "4.9" },

  /* -------- خدمات رقمية -------- */
  { slug: "logo-design", nameAr: "تصميم شعار احترافي", nameEn: "Professional Logo Design", shortDescription: "شعار مخصص لعلامتك التجارية خلال 72 ساعة", description: "خدمة تصميم شعار احترافي مخصص لعلامتك التجارية: 3 مقترحات مبدئية، مراجعتان مجانيتان، وتسليم الملفات المصدرية بجودة عالية خلال 72 ساعة.", type: "DIGITAL_SERVICE", category: "services", priceCents: 79900, stock: 15, icon: "✒️", deliveryNote: "سيتواصل معك فريق التصميم عبر بريدك خلال 24 ساعة لبدء التنفيذ.", reviewCount: 187, rating: "4.7" },
  { slug: "cv-writing", nameAr: "كتابة سيرة ذاتية احترافية", nameEn: "Professional CV Writing", shortDescription: "سيرة ذاتية ATS جاهزة للتقديم", description: "كتابة سيرة ذاتية احترافية متوافقة مع أنظمة الفرز الآلي (ATS) باللغتين العربية والإنجليزية، مع خطاب تقديم مخصص.", type: "DIGITAL_SERVICE", category: "services", priceCents: 39900, stock: 30, icon: "📄", deliveryNote: "أرسل سيرتك الحالية إلى فريقنا عند التواصل معك خلال 24 ساعة.", reviewCount: 253, rating: "4.8" },
];

async function seed() {
  /* ------------------------- Admin bootstrap ------------------------- */
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || adminPassword.length < 10) {
    console.error(
      "[seed] ADMIN_EMAIL and ADMIN_PASSWORD (>=10 chars) must be set in the environment.",
    );
    process.exit(1);
  }
  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);
  if (!existingAdmin) {
    await db.insert(users).values({
      email: adminEmail,
      name: "مدير المتجر",
      passwordHash: await hashPassword(adminPassword),
      role: "admin",
    });
    console.log(`[seed] admin account created: ${adminEmail}`);
  } else {
    console.log("[seed] admin account already exists — unchanged.");
  }

  /* --------------------------- Categories --------------------------- */
  console.log("[seed] upserting categories...");
  for (const c of CATEGORIES) {
    await db
      .insert(categories)
      .values({ ...c })
      .onConflictDoUpdate({
        target: categories.slug,
        set: {
          nameAr: c.nameAr,
          nameEn: c.nameEn,
          icon: c.icon,
          sortOrder: c.sortOrder,
          description: c.description,
        },
      });
  }
  const catRows = await db.select().from(categories);
  const idBySlug = new Map(catRows.map((c) => [c.slug, c.id]));

  /* ---------------------------- Products ---------------------------- */
  console.log("[seed] upserting products...");
  for (const { category, ...p } of PRODUCTS) {
    await db
      .insert(products)
      .values({
        ...p,
        featured: p.featured ?? false,
        originalPriceCents: p.originalPriceCents ?? null,
        deliveryNote: p.deliveryNote ?? "",
        categoryId: idBySlug.get(category)!,
      })
      .onConflictDoUpdate({
        target: products.slug,
        set: {
          nameAr: p.nameAr,
          nameEn: p.nameEn,
          shortDescription: p.shortDescription,
          description: p.description,
          priceCents: p.priceCents,
          originalPriceCents: p.originalPriceCents ?? null,
          icon: p.icon,
          type: p.type,
        },
      });
  }

  /* ------------------ Dev-only test code inventory ------------------ */
  if (process.env.NODE_ENV !== "production") {
    const codeProducts = await db
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .where(eq(products.type, "DIGITAL_CODE"));

    for (const p of codeProducts) {
      const [{ available }] = await db
        .select({ available: sql<number>`count(*)::int` })
        .from(digitalCodes)
        .where(and(eq(digitalCodes.productId, p.id), eq(digitalCodes.status, "AVAILABLE")));

      if (available === 0) {
        const testCodes = Array.from({ length: 10 }, () =>
          `DEV-TEST-${randomBytes(6).toString("hex").toUpperCase()}`,
        );
        await db.insert(digitalCodes).values(
          testCodes.map((code) => ({
            productId: p.id,
            codeEncrypted: encryptCode(code),
          })),
        );
        await db
          .update(products)
          .set({ stock: sql`${products.stock} + 10` })
          .where(eq(products.id, p.id));
        console.log(`[seed] added 10 DEV test codes to ${p.slug}`);
      }
    }
  }

  console.log(`[seed] done — ${CATEGORIES.length} categories, ${PRODUCTS.length} products.`);
  await pool.end();
}

seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
