/**
 * Initial catalog data for E-Vora (digital goods store).
 *
 * Used by the explicit `npm run db:seed` command (add missing rows only)
 * and by isolated catalogue/migration tests. Application startup never seeds.
 *
 * Every entry carries both English and Arabic copy so the storefront
 * can switch language without extra translation lookups.
 */

export type DeliveryInputType = "none" | "player-id" | "region";

export const SEED_CATEGORIES = [
  {
    slug: "game-topups",
    name: "Game Top-Ups",
    nameAr: "شحن الألعاب",
    icon: "⚡",
    description: "Instant in-game currency credited straight to your Player ID.",
    descriptionAr: "عملات ألعاب فورية تُضاف مباشرة إلى حسابك عبر الآي دي.",
  },
  {
    slug: "gift-cards",
    name: "Gift Cards",
    nameAr: "بطاقات الهدايا",
    icon: "🎁",
    description: "Official store credit for Steam, PlayStation, Xbox and more.",
    descriptionAr: "رصيد رسمي لمتاجر ستيم وبلايستيشن وإكس بوكس والمزيد.",
  },
  {
    slug: "subscriptions",
    name: "Subscriptions",
    nameAr: "اشتراكات",
    icon: "🌟",
    description: "Premium memberships for gaming, music and streaming.",
    descriptionAr: "عضويات مدفوعة للألعاب والموسيقى والبث الترفيهي.",
  },
  {
    slug: "software-keys",
    name: "Software & Game Keys",
    nameAr: "مفاتيح البرامج والألعاب",
    icon: "🔑",
    description: "Genuine activation keys for Windows, Office and PC games.",
    descriptionAr: "مفاتيح تفعيل أصلية لويندوز وأوفيس وألعاب الكمبيوتر.",
  },
] as const;

export type SeedProduct = {
  slug: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  priceCents: number;
  category: (typeof SEED_CATEGORIES)[number]["slug"];
  /** Available codes/credits (digital stock). */
  stock: number;
  rating: string;
  reviewCount: number;
  icon: string;
  inputType: DeliveryInputType;
  featured?: boolean;
};

export const SEED_PRODUCTS: SeedProduct[] = [
  /* ---------------------------- Game Top-Ups --------------------------- */
  {
    slug: "pubg-660-uc",
    name: "PUBG Mobile — 660 UC",
    nameAr: "شدات ببجي موبايل — 660 شدة",
    description:
      "Top up 660 Unknown Cash (UC) directly to your PUBG Mobile account via Player ID. No login required — the UC lands in your account within minutes of checkout.",
    descriptionAr:
      "اشحن 660 شدة (UC) مباشرة إلى حسابك في ببجي موبايل عبر الآي دي فقط، بدون الحاجة لتسجيل الدخول. تصل الشدات إلى حسابك خلال دقائق من إتمام الطلب.",
    priceCents: 999,
    category: "game-topups",
    stock: 2400,
    rating: "4.9",
    reviewCount: 18240,
    icon: "🪂",
    inputType: "player-id",
  },
  {
    slug: "pubg-1800-uc",
    name: "PUBG Mobile — 1800 UC",
    nameAr: "شدات ببجي موبايل — 1800 شدة",
    description:
      "The Royale Pass favourite: 1800 UC credited to your Player ID, enough for elite passes, crates and skins. Official top-up channels only — zero ban risk.",
    descriptionAr:
      "الحزمة المثالية للرويال باس: 1800 شدة تُضاف إلى الآي دي الخاص بك، تكفي للباسات والصناديق والسكنات. شحن رسمي بالكامل — بدون أي مخاطرة بالبان.",
    priceCents: 2499,
    category: "game-topups",
    stock: 1650,
    rating: "4.9",
    reviewCount: 12687,
    icon: "👑",
    inputType: "player-id",
    featured: true,
  },
  {
    slug: "valorant-4750-vp",
    name: "Valorant — 4750 Points (VP)",
    nameAr: "نقاط فالورانت — 4750 نقطة",
    description:
      "4750 Valorant Points added via your Riot ID. Unlock premium skin bundles, battle passes and Night Market deals — credited in minutes, region-safe delivery.",
    descriptionAr:
      "4750 نقطة فالورانت تُضاف عبر Riot ID الخاص بك. افتح حزم السكنات والباتل باس وعروض النايت ماركت — شحن سريع وآمن على حسابك خلال دقائق.",
    priceCents: 4999,
    category: "game-topups",
    stock: 980,
    rating: "4.8",
    reviewCount: 5932,
    icon: "🎯",
    inputType: "player-id",
    featured: true,
  },
  {
    slug: "fc-2800-points",
    name: "EA FC Points — 2800",
    nameAr: "نقاط EA FC — 2800 نقطة",
    description:
      "2800 FC Points for Ultimate Team packs and Draft entries, delivered to your EA account ID. Build your dream squad faster with official, instant points.",
    descriptionAr:
      "2800 نقطة FC لحزم الألتميت تيم والدرافت، تُسلَّم إلى حساب EA الخاص بك. كوِّن فريق أحلامك أسرع مع نقاط رسمية وفورية.",
    priceCents: 2499,
    category: "game-topups",
    stock: 1430,
    rating: "4.7",
    reviewCount: 8744,
    icon: "⚽",
    inputType: "player-id",
  },
  {
    slug: "robux-800",
    name: "Roblox — 800 Robux",
    nameAr: "روبوكس — 800",
    description:
      "800 Robux credited to your Roblox username. Spend on avatar items, game passes and in-game boosts across millions of experiences — no password needed.",
    descriptionAr:
      "800 روبوكس تُضاف إلى اسم المستخدم الخاص بك في روبلوكس. استخدمها لشراء الملابس والجيم باس والمزايا داخل آلاف الألعاب — بدون كلمة مرور.",
    priceCents: 999,
    category: "game-topups",
    stock: 3100,
    rating: "4.8",
    reviewCount: 21903,
    icon: "🧱",
    inputType: "player-id",
  },

  /* ----------------------------- Gift Cards ---------------------------- */
  {
    slug: "steam-wallet-20",
    name: "Steam Wallet Card — $20",
    nameAr: "بطاقة ستيم والت — 20 دولار",
    description:
      "Official $20 Steam Wallet code delivered instantly after checkout. Redeem it for games, DLC, in-game items and hardware on the Steam store.",
    descriptionAr:
      "كود ستيم والت رسمي بقيمة 20 دولار يصلك فوراً بعد الشراء. استبدله لشراء الألعاب والإضافات والعناصر داخل متجر ستيم.",
    priceCents: 2000,
    category: "gift-cards",
    stock: 860,
    rating: "5.0",
    reviewCount: 15311,
    icon: "💻",
    inputType: "region",
    featured: true,
  },
  {
    slug: "ps-store-50",
    name: "PlayStation Store Card — $50",
    nameAr: "بطاقة بلايستيشن ستور — 50 دولار",
    description:
      "Top up your PlayStation wallet with $50 of official store credit. Games, add-ons, PS Plus and more — the code appears on-screen the second you check out.",
    descriptionAr:
      "اشحن محفظة بلايستيشن بـ 50 دولار رصيد رسمي. ألعاب وإضافات واشتراك PS Plus — يظهر لك الكود على الشاشة لحظة إتمام الطلب.",
    priceCents: 5000,
    category: "gift-cards",
    stock: 0,
    rating: "4.9",
    reviewCount: 9870,
    icon: "🕹️",
    inputType: "region",
  },
  {
    slug: "xbox-gift-25",
    name: "Xbox Gift Card — $25",
    nameAr: "بطاقة هدايا إكس بوكس — 25 دولار",
    description:
      "$25 Xbox & Microsoft Store balance for games, movies, apps and Game Pass.Works on Xbox consoles and Windows PCs — instant code, no fees, no expiry.",
    descriptionAr:
      "رصيد 25 دولار لمتجر إكس بوكس ومايكروسوفت لشراء الألعاب والأفلام والتطبيقات والجيم باس. يعمل على أجهزة إكس بوكس والويندوز — كود فوري بدون رسوم أو تاريخ انتهاء.",
    priceCents: 2500,
    category: "gift-cards",
    stock: 720,
    rating: "4.9",
    reviewCount: 7412,
    icon: "🎮",
    inputType: "region",
  },
  {
    slug: "google-play-10",
    name: "Google Play Card — $10",
    nameAr: "بطاقة جوجل بلاي — 10 دولار",
    description:
      "Official $10 Google Play balance for apps, games, movies and books on Android. Pick your account region at purchase — delivery is instant and guaranteed.",
    descriptionAr:
      "رصيد جوجل بلاي رسمي 10 دولارات للتطبيقات والألعاب والأفلام والكتب على أندرويد. اختر منطقة حسابك عند الشراء — التسليم فوري ومضمون.",
    priceCents: 1000,
    category: "gift-cards",
    stock: 1950,
    rating: "4.8",
    reviewCount: 11028,
    icon: "▶️",
    inputType: "region",
  },
  {
    slug: "apple-gift-15",
    name: "Apple Gift Card — $15",
    nameAr: "بطاقة هدايا آبل — 15 دولار",
    description:
      "$15 Apple balance for the App Store, iTunes, iCloud+ and subscriptions like Apple Music. One code for everything Apple — delivered in seconds.",
    descriptionAr:
      "رصيد آبل 15 دولار للآب ستور وآيتيونز وآيكلاود بلس واشتراكات مثل آبل ميوزك. كود واحد لكل منتجات آبل — يصلك خلال ثوانٍ.",
    priceCents: 1500,
    category: "gift-cards",
    stock: 1340,
    rating: "4.9",
    reviewCount: 6654,
    icon: "🍎",
    inputType: "region",
  },

  /* ---------------------------- Subscriptions -------------------------- */
  {
    slug: "discord-nitro-1mo",
    name: "Discord Nitro — 1 Month",
    nameAr: "ديسكورد نيترو — شهر",
    description:
      "One month of Discord Nitro: animated avatar, custom emoji everywhere, HD streaming, bigger uploads and 2 server boosts. Gift link delivered instantly.",
    descriptionAr:
      "شهر كامل من ديسكورد نيترو: صورة متحركة وإيموجي مخصصة في كل السيرفرات وبث عالي الجودة ورفع ملفات أكبر وبوستين للسيرفرات. يصلك رابط التفعيل فوراً.",
    priceCents: 999,
    category: "subscriptions",
    stock: 480,
    rating: "4.9",
    reviewCount: 13477,
    icon: "🚀",
    inputType: "none",
    featured: true,
  },
  {
    slug: "spotify-premium-3mo",
    name: "Spotify Premium — 3 Months",
    nameAr: "سبوتيفاي بريميوم — 3 شهور",
    description:
      "Three months of ad-free music, offline downloads and high-quality audio. Delivered as an official redeemable code you apply to your own account.",
    descriptionAr:
      "ثلاثة شهور من الموسيقى بدون إعلانات مع التحميل للاستماع أوفلاين وجودة صوت عالية. يصلك الكود رسمي لتفعيله على حسابك الشخصي.",
    priceCents: 3499,
    category: "subscriptions",
    stock: 390,
    rating: "4.8",
    reviewCount: 5231,
    icon: "🎵",
    inputType: "none",
  },
  {
    slug: "netflix-premium-1mo",
    name: "Netflix Premium — 1 Month (4K)",
    nameAr: "نتفليكس بريميوم — شهر (4K)",
    description:
      "One month of Netflix Premium with 4K Ultra HD + HDR streaming on 4 devices. Activation code delivered instantly — start watching tonight.",
    descriptionAr:
      "شهر من نتفليكس بريميوم بجودة 4K وHDR على 4 أجهزة في نفس الوقت. يصلك كود التفعيل فوراً — ابدأ المشاهدة الليلة.",
    priceCents: 2299,
    category: "subscriptions",
    stock: 260,
    rating: "4.7",
    reviewCount: 9018,
    icon: "🍿",
    inputType: "none",
  },
  {
    slug: "gamepass-ultimate-3mo",
    name: "Xbox Game Pass Ultimate — 3 Months",
    nameAr: "إكس بوكس جيم باس ألتميت — 3 شهور",
    description:
      "Three months of Game Pass Ultimate: 100s of games on console, PC and cloud, EA Play included, plus online multiplayer. One code, instant activation.",
    descriptionAr:
      "ثلاثة شهور من جيم باس ألتميت: مئات الألعاب على الكونسول والبي سي والكلاود، مع EA Play واللعب الجماعي أونلاين. كود واحد وتفعيل فوري.",
    priceCents: 5499,
    category: "subscriptions",
    stock: 540,
    rating: "4.9",
    reviewCount: 11260,
    icon: "🏆",
    inputType: "none",
    featured: true,
  },

  /* -------------------------- Software & Games ------------------------- */
  {
    slug: "windows-11-pro-key",
    name: "Windows 11 Pro — Activation Key",
    nameAr: "مفتاح تفعيل ويندوز 11 برو",
    description:
      "Genuine Windows 11 Professional OEM activation key for 1 PC, lifetime validity. BitLocker, Remote Desktop and all Pro features — key shown instantly after checkout.",
    descriptionAr:
      "مفتاح تفعيل ويندوز 11 بروفيشنال أصلي لجهاز واحد بصلاحية مدى الحياة. جميع مزايا النسخة الاحترافية مثل BitLocker وسطح المكتب البعيد — يظهر المفتاح فوراً بعد الشراء.",
    priceCents: 2499,
    category: "software-keys",
    stock: 630,
    rating: "4.8",
    reviewCount: 7893,
    icon: "🪟",
    inputType: "none",
    featured: true,
  },
  {
    slug: "office-2021-pro-key",
    name: "Microsoft Office 2021 Pro Plus — Key",
    nameAr: "مفتاح أوفيس 2021 برو بلس",
    description:
      "Lifetime Office 2021 Professional Plus key: Word, Excel, PowerPoint, Outlook and more on 1 PC. No subscription — pay once, use forever.",
    descriptionAr:
      "مفتاح أوفيس 2021 بروفيشنال بلس مدى الحياة: وورد وإكسل وباوربوينت وآوتلوك والمزيد على جهاز واحد. بدون اشتراك — ادفع مرة واحدة واستخدمه للأبد.",
    priceCents: 3499,
    category: "software-keys",
    stock: 455,
    rating: "4.8",
    reviewCount: 6117,
    icon: "📎",
    inputType: "none",
  },
  {
    slug: "minecraft-java-bedrock-key",
    name: "Minecraft: Java & Bedrock — PC Key",
    nameAr: "ماينكرافت: جافا وبيدروك — نسخة PC",
    description:
      "Both editions in one key: Minecraft Java Edition and Bedrock for Windows. Official Microsoft redemption, yours forever — delivered in seconds.",
    descriptionAr:
      "نسختان في مفتاح واحد: ماينكرافت جافا وبيدروك للويندوز. تفعيل رسمي عبر مايكروسوفت وملكية دائمة — التسليم خلال ثوانٍ.",
    priceCents: 2999,
    category: "software-keys",
    stock: 340,
    rating: "5.0",
    reviewCount: 16842,
    icon: "⛏️",
    inputType: "none",
  },
  {
    slug: "elden-ring-steam-key",
    name: "Elden Ring — Steam Key",
    nameAr: "إلدن رينج — مفتاح ستيم",
    description:
      "FromSoftware's award-winning epic as a global Steam key. Rise, Tarnished — your journey through the Lands Between starts the moment you check out.",
    descriptionAr:
      "ملحمة FromSoftware الحائزة على الجوائز كمفتاح ستيم عالمي. انطلق في رحلتك عبر الأراضي الواقعة بين العوالم لحظة إتمام الشراء.",
    priceCents: 3999,
    category: "software-keys",
    stock: 8,
    rating: "4.9",
    reviewCount: 9540,
    icon: "💍",
    inputType: "none",
    featured: true,
  },
];
