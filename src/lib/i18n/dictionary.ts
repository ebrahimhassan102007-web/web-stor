/**
 * Bilingual (EN/AR) UI dictionary for E-Vora.
 *
 * Plain serializable data only (no functions) so the active locale's
 * dictionary can be passed from the server layout into the client
 * LocaleProvider as a prop. Templates use `{placeholder}` slots filled
 * with the `fill()` helper below.
 */

export type Locale = "en" | "ar";
export type Theme = "dark" | "light";

export const LOCALE_COOKIE = "evora_locale";
export const THEME_COOKIE = "evora_theme";

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "ar";
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Fills `{name}`-style placeholders in a template string. */
export function fill(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

/** Localized display name/description for catalog rows. */
export function locName(
  item: { name: string; nameAr: string },
  locale: Locale,
): string {
  return locale === "ar" && item.nameAr ? item.nameAr : item.name;
}

export function locDesc(
  item: { description: string; descriptionAr: string },
  locale: Locale,
): string {
  return locale === "ar" && item.descriptionAr
    ? item.descriptionAr
    : item.description;
}

/** Gift-card region codes, in display order. Labels live in the dict. */
export const REGION_CODES = ["global", "us", "sa", "ae", "eu"] as const;
export type RegionCode = (typeof REGION_CODES)[number];

const en = {
  meta: {
    title: "E-Vora — Digital Goods, Game Top-Ups & Instant Codes",
    description:
      "E-Vora is your instant store for game top-ups, gift cards, subscriptions and software keys. Official codes, delivered in seconds.",
    productsTitle: "Products",
    productsDescription:
      "Browse the E-Vora catalog — game top-ups, gift cards, subscriptions and genuine software keys with instant delivery.",
    successTitle: "Order Confirmed",
    productNotFound: "Product not found",
  },
  nav: {
    home: "Home",
    products: "Products",
    cart: "Cart",
    secure: "Secure",
    menuToggle: "Toggle menu",
    cartAria: "Cart, {count} items",
  },
  theme: { toLight: "Switch to light mode", toDark: "Switch to dark mode" },
  hero: {
    badge: "Instant delivery · 24/7",
    titleTop: "Game top-ups & digital codes,",
    titleAccent: "delivered in seconds.",
    sub: "E-Vora is the instant store for gamers: PUBG UC, gift cards, subscriptions and genuine software keys — official codes, shown on your screen the moment you check out.",
    ctaBrowse: "Browse Products",
    ctaTopups: "⚡ Game Top-Ups",
  },
  badges: [
    {
      icon: "⚡",
      title: "Instant Digital Delivery",
      text: "Your code appears on-screen seconds after checkout — no waiting, no shipping.",
    },
    {
      icon: "🎟️",
      title: "100% Official Codes",
      text: "Every key and top-up comes from authorized channels and is guaranteed to activate.",
    },
    {
      icon: "🔒",
      title: "Secure Encrypted Checkout",
      text: "TLS everywhere, HttpOnly signed sessions and zero third-party trackers.",
    },
    {
      icon: "🎧",
      title: "24/7 Human Support",
      text: "Real humans on standby around the clock if a code ever needs a hand.",
    },
  ],
  home: {
    featuredTitle: "Trending",
    featuredAccent: "Now",
    featuredSub: "Best-selling top-ups and codes, delivered instantly.",
    viewAll: "View all",
    catTitle: "Shop by",
    catAccent: "Category",
    productsCount: "{count} products",
    productsCountOne: "1 product",
    bannerTitle: "Codes on your screen.",
    bannerAccent: "Seconds, not days.",
    bannerText:
      "We validate every byte of input, sign every session and deliver every code the instant your order confirms — no warehouses, no couriers, no waiting rooms.",
    bannerChips: [
      "Instant delivery",
      "Official sources",
      "HMAC-signed sessions",
      "Zod-validated inputs",
      "Parameterized SQL",
    ],
  },
  card: {
    inStock: "⚡ Instant",
    onlyLeft: "Only {count} left",
    outOfStock: "Out of Stock",
    viewDetails: "View details",
  },
  products: {
    allTitle: "All",
    allAccent: "Products",
    count: "{count} products",
    countOne: "1 product",
    matching: 'matching "{q}"',
    emptyTitle: "No products found",
    emptyText: "Try a different search term or clear the filters.",
  },
  filters: {
    searchPlaceholder: "Search top-ups, cards, keys…",
    search: "Search",
    searchAria: "Search products",
    sortAria: "Sort products",
    newest: "Newest",
    priceAsc: "Price: Low to High",
    priceDesc: "Price: High to Low",
    rating: "Top Rated",
    all: "All",
  },
  product: {
    featured: "★ Featured",
    instantDelivery: "⚡ Instant delivery",
    codesAvailable: "{count} codes available",
    codesLeft: "Hurry — only {count} codes left",
    tileSecure: "Secure checkout",
    tileInstant: "Delivered in seconds",
    tileOfficial: "100% official code",
    moreIn: "More in {category}",
    playerIdLabel: "Player ID / Account ID",
    playerIdPlaceholder: "e.g. 5123456789",
    playerIdHint:
      "We credit this account directly — double-check your in-game ID (no password needed).",
    regionLabel: "Account region",
    regionHint: "Gift-card codes only redeem on accounts of the same region.",
    officialNote: "Official code · guaranteed activation",
  },
  regions: {
    global: "🌍 Global",
    us: "🇺🇸 United States",
    sa: "🇸🇦 Saudi Arabia",
    ae: "🇦🇪 UAE",
    eu: "🇪🇺 Europe",
  },
  add: {
    adding: "Adding…",
    added: "✓ Added to cart",
    addToCart: "Add to Cart",
    outOfStock: "Out of Stock",
    decrease: "Decrease quantity",
    increase: "Increase quantity",
    errAdd: "Could not add to cart.",
    errNetwork: "Network error. Please try again.",
  },
  cart: {
    title: "Shopping",
    titleAccent: "Cart",
    itemsCount: "{count} items",
    itemsCountOne: "1 item",
    loading: "Loading your cart…",
    emptyTitle: "Your cart is empty",
    emptyText: "Browse top-ups, cards and keys — your code is one checkout away.",
    browse: "Browse Products",
    each: "each",
    remove: "Remove {name}",
    summary: "Order Summary",
    subtotal: "Subtotal",
    delivery: "Delivery",
    instantFree: "⚡ Instant · Free",
    total: "Total",
    checkoutBtn: "🔒 Secure Checkout",
    continueShopping: "Continue shopping",
    note: "Encrypted session · codes shown instantly after payment",
    errLoad: "Could not load your cart. Please refresh.",
    errUpdate: "Could not update the cart.",
    errNetwork: "Network error. Please try again.",
    sentToPlayer: "Top-up to Player ID:",
    regionTag: "Region:",
  },
  checkout: {
    title: "Secure",
    titleAccent: "Checkout",
    encrypted: "Encrypted session",
    demoNote: "No payment card required for this demo order.",
    detailsTitle: "Delivery Details",
    fullName: "Full name",
    email: "Email address",
    namePlaceholder: "Ada Lovelace",
    emailPlaceholder: "ada@example.com",
    emailHint:
      "Your digital code appears on the next screen instantly and is linked to this email.",
    placeOrder: "🔒 Place Order · {total}",
    placing: "Placing order…",
    footnote:
      "Inputs are validated client-side and re-validated server-side. Totals are always computed from the database.",
    yourOrder: "Your Order",
    loading: "Loading checkout…",
    nothingTitle: "Nothing to check out",
    nothingText: "Your cart is empty.",
    errLoad: "Could not load your cart. Please refresh.",
    errGeneric: "Checkout failed. Please try again.",
    errNetwork: "Network error. Please try again.",
    errName: "Please enter your full name (2+ characters).",
    errEmail: "Please enter a valid email address.",
  },
  success: {
    title: "Order",
    titleAccent: "Confirmed",
    thanksLine:
      "Thank you, {name}. Your codes are ready below — a copy is linked to {email}.",
    yourCodes: "Your digital codes",
    subtotal: "Subtotal",
    delivery: "Delivery",
    instantFree: "⚡ Instant · Free",
    total: "Total",
    copy: "Copy code",
    copied: "Copied ✓",
    playerIdLabel: "Credited to Player ID:",
    regionLabel: "Region:",
    saveNote:
      "Save your codes somewhere safe — you can also reach this page again from your order number above.",
    continueShopping: "Continue Shopping",
    backHome: "Back to Home",
  },
  footer: {
    tagline:
      "The instant store for digital goods — game top-ups, gift cards, subscriptions and software keys, delivered in seconds with bank-grade security.",
    shop: "Shop",
    allProducts: "All Products",
    topRated: "Top Rated",
    trust: "Why E-Vora",
    trustItems: [
      "Official codes, guaranteed activation",
      "Instant on-screen delivery",
      "TLS-encrypted checkout",
      "Zero third-party trackers",
    ],
    status: "Status",
    operational: "All systems operational",
    statusMono: "Instant delivery · 24/7",
    copyright: "© {year} E-Vora. Demo storefront — no real payments are processed.",
    builtNote: "delivered at the speed of light",
  },
  notFound: {
    title: "Page not found",
    text: "The page you requested does not exist or has been moved.",
    back: "Return to Home",
  },
};

export type Dict = typeof en;

const ar: Dict = {
  meta: {
    title: "E-Vora — منتجات رقمية وشحن ألعاب وأكواد فورية",
    description:
      "E-Vora متجرك الفوري لشحن الألعاب وبطاقات الهدايا والاشتراكات ومفاتيح البرامج. أكواد رسمية توصلك في ثوانٍ.",
    productsTitle: "المنتجات",
    productsDescription:
      "تصفح كتالوج E-Vora — شحن ألعاب وبطاقات هدايا واشتراكات ومفاتيح برامج أصلية بتسليم فوري.",
    successTitle: "تم تأكيد الطلب",
    productNotFound: "المنتج غير موجود",
  },
  nav: {
    home: "الرئيسية",
    products: "المنتجات",
    cart: "السلة",
    secure: "آمن",
    menuToggle: "فتح/إغلاق القائمة",
    cartAria: "السلة، {count} منتجات",
  },
  theme: { toLight: "التبديل إلى الوضع الفاتح", toDark: "التبديل إلى الوضع الداكن" },
  hero: {
    badge: "تسليم فوري · على مدار الساعة",
    titleTop: "شحن الألعاب والمنتجات الرقمية،",
    titleAccent: "يصلك كودك في ثوانٍ.",
    sub: "E-Vora هو متجر الجيمرز الفوري: شدات ببجي وبطاقات هدايا واشتراكات ومفاتيح برامج أصلية — أكواد رسمية تظهر على شاشتك لحظة إتمام الشراء.",
    ctaBrowse: "تصفح المنتجات",
    ctaTopups: "⚡ شحن الألعاب",
  },
  badges: [
    {
      icon: "⚡",
      title: "تسليم رقمي فوري",
      text: "يظهر كودك على الشاشة بعد ثوانٍ من الشراء — بدون انتظار وبدون شحن.",
    },
    {
      icon: "🎟️",
      title: "أكواد رسمية 100%",
      text: "كل الأكواد والشحنات من قنوات رسمية معتمدة ومضمونة التفعيل.",
    },
    {
      icon: "🔒",
      title: "دفع آمن ومشفر",
      text: "تشفير كامل وجلسات موقعة آمنة وبدون أي أدوات تتبع خارجية.",
    },
    {
      icon: "🎧",
      title: "دعم فني 24/7",
      text: "فريق دعم حقيقي متاح على مدار الساعة لمساعدتك متى احتجته.",
    },
  ],
  home: {
    featuredTitle: "الأكثر",
    featuredAccent: "رواجاً",
    featuredSub: "أفضل الشحنات والأكواد مبيعاً — بتسليم فوري.",
    viewAll: "عرض الكل",
    catTitle: "تسوق حسب",
    catAccent: "القسم",
    productsCount: "{count} منتج",
    productsCountOne: "منتج واحد",
    bannerTitle: "الكود على شاشتك.",
    bannerAccent: "في ثوانٍ، مش أيام.",
    bannerText:
      "نتحقق من كل مُدخل، ونوقّع كل جلسة، ونسلّم كل كود لحظة تأكيد طلبك — بدون مخازن ولا شركات شحن ولا انتظار.",
    bannerChips: [
      "تسليم فوري",
      "مصادر رسمية",
      "جلسات موقعة",
      "تحقق صارم من المدخلات",
      "استعلامات آمنة",
    ],
  },
  card: {
    inStock: "⚡ فوري",
    onlyLeft: "باقي {count} بس",
    outOfStock: "نفدت الكمية",
    viewDetails: "عرض التفاصيل",
  },
  products: {
    allTitle: "جميع",
    allAccent: "المنتجات",
    count: "{count} منتج",
    countOne: "منتج واحد",
    matching: 'مطابق لـ "{q}"',
    emptyTitle: "لم يتم العثور على منتجات",
    emptyText: "جرّب كلمة بحث مختلفة أو امسح الفلاتر.",
  },
  filters: {
    searchPlaceholder: "ابحث عن شحن أو بطاقات أو مفاتيح…",
    search: "بحث",
    searchAria: "بحث المنتجات",
    sortAria: "ترتيب المنتجات",
    newest: "الأحدث",
    priceAsc: "السعر: من الأقل للأعلى",
    priceDesc: "السعر: من الأعلى للأقل",
    rating: "الأعلى تقييماً",
    all: "الكل",
  },
  product: {
    featured: "★ مميز",
    instantDelivery: "⚡ تسليم فوري",
    codesAvailable: "متاح {count} كود",
    codesLeft: "أسرع — باقي {count} كود فقط",
    tileSecure: "دفع آمن ومشفر",
    tileInstant: "التسليم في ثوانٍ",
    tileOfficial: "كود رسمي 100%",
    moreIn: "المزيد من {category}",
    playerIdLabel: "آي دي اللاعب / الحساب",
    playerIdPlaceholder: "مثال: 5123456789",
    playerIdHint:
      "سيتم الشحن مباشرة إلى هذا الحساب — تأكد من الآي دي جيداً (لست بحاجة لكلمة المرور).",
    regionLabel: "منطقة الحساب",
    regionHint: "أكواد بطاقات الهدايا تعمل فقط على حسابات نفس المنطقة.",
    officialNote: "كود رسمي · تفعيل مضمون",
  },
  regions: {
    global: "🌍 عالمي",
    us: "🇺🇸 أمريكي",
    sa: "🇸🇦 سعودي",
    ae: "🇦🇪 إماراتي",
    eu: "🇪🇺 أوروبي",
  },
  add: {
    adding: "جارٍ الإضافة…",
    added: "✓ تمت الإضافة للسلة",
    addToCart: "أضف إلى السلة",
    outOfStock: "نفدت الكمية",
    decrease: "إنقاص الكمية",
    increase: "زيادة الكمية",
    errAdd: "تعذرت الإضافة إلى السلة.",
    errNetwork: "حدث خطأ في الاتصال. حاول مرة أخرى.",
  },
  cart: {
    title: "سلة",
    titleAccent: "التسوق",
    itemsCount: "{count} منتجات",
    itemsCountOne: "منتج واحد",
    loading: "جارٍ تحميل السلة…",
    emptyTitle: "سلتك فارغة",
    emptyText: "تصفح الشحنات والبطاقات والمفاتيح — كودك على بُعد طلب واحد.",
    browse: "تصفح المنتجات",
    each: "للواحد",
    remove: "حذف {name}",
    summary: "ملخص الطلب",
    subtotal: "المجموع الفرعي",
    delivery: "التسليم",
    instantFree: "⚡ فوري · مجاناً",
    total: "الإجمالي",
    checkoutBtn: "🔒 إتمام الشراء بأمان",
    continueShopping: "متابعة التسوق",
    note: "جلسة مشفرة · تظهر الأكواد فوراً بعد الطلب",
    errLoad: "تعذر تحميل السلة. حدّث الصفحة من فضلك.",
    errUpdate: "تعذر تحديث السلة.",
    errNetwork: "حدث خطأ في الاتصال. حاول مرة أخرى.",
    sentToPlayer: "شحن إلى الآي دي:",
    regionTag: "المنطقة:",
  },
  checkout: {
    title: "إتمام",
    titleAccent: "الطلب",
    encrypted: "جلسة مشفرة",
    demoNote: "لا حاجة لبطاقة دفع — هذا طلب تجريبي.",
    detailsTitle: "بيانات التسليم",
    fullName: "الاسم الكامل",
    email: "البريد الإلكتروني",
    namePlaceholder: "اسمك الكريم",
    emailPlaceholder: "name@example.com",
    emailHint: "سيظهر كودك الرقمي في الشاشة التالية فوراً ويرتبط بهذا البريد.",
    placeOrder: "🔒 تأكيد الطلب · {total}",
    placing: "جارٍ تنفيذ الطلب…",
    footnote:
      "يتم التحقق من المدخلات على المتصفح ثم مجدداً على السيرفر، وتُحسب الأسعار دائماً من قاعدة البيانات.",
    yourOrder: "طلبك",
    loading: "جارٍ تجهيز صفحة الدفع…",
    nothingTitle: "لا شيء لإتمام شرائه",
    nothingText: "سلتك فارغة حالياً.",
    errLoad: "تعذر تحميل السلة. حدّث الصفحة من فضلك.",
    errGeneric: "فشل إتمام الطلب. حاول مرة أخرى.",
    errNetwork: "حدث خطأ في الاتصال. حاول مرة أخرى.",
    errName: "من فضلك أدخل اسمك الكامل (حرفان على الأقل).",
    errEmail: "من فضلك أدخل بريداً إلكترونياً صحيحاً.",
  },
  success: {
    title: "تم تأكيد",
    titleAccent: "طلبك",
    thanksLine: "شكراً لك، {name}. أكوادك جاهزة بالأسفل — ونسخة مرتبطة بـ {email}.",
    yourCodes: "أكوادك الرقمية",
    subtotal: "المجموع الفرعي",
    delivery: "التسليم",
    instantFree: "⚡ فوري · مجاناً",
    total: "الإجمالي",
    copy: "نسخ الكود",
    copied: "تم النسخ ✓",
    playerIdLabel: "تم الشحن إلى الآي دي:",
    regionLabel: "المنطقة:",
    saveNote: "احفظ الأكواد في مكان آمن — ويمكنك العودة لهذه الصفحة من رقم الطلب بالأعلى.",
    continueShopping: "متابعة التسوق",
    backHome: "العودة للرئيسية",
  },
  footer: {
    tagline:
      "المتجر الفوري للمنتجات الرقمية — شحن ألعاب وبطاقات هدايا واشتراكات ومفاتيح برامج، يصلك في ثوانٍ وبأعلى مستويات الأمان.",
    shop: "تسوق",
    allProducts: "كل المنتجات",
    topRated: "الأعلى تقييماً",
    trust: "ليه E-Vora؟",
    trustItems: [
      "أكواد رسمية مضمونة التفعيل",
      "تسليم فوري على الشاشة",
      "دفع مشفر بالكامل",
      "بدون أي تتبع خارجي",
    ],
    status: "حالة النظام",
    operational: "كل الأنظمة تعمل",
    statusMono: "تسليم فوري · 24/7",
    copyright: "© {year} E-Vora. متجر تجريبي — لا تُعالج أي مدفوعات حقيقية.",
    builtNote: "بنوصل بسرعة الضوء",
  },
  notFound: {
    title: "الصفحة غير موجودة",
    text: "الصفحة التي تطلبها غير موجودة أو تم نقلها.",
    back: "العودة للرئيسية",
  },
};

export const dictionaries: Record<Locale, Dict> = { en, ar };
