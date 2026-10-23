import type { Locale } from "./dictionary";

export type InformationSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type InformationPageCopy = {
  eyebrow: string;
  title: string;
  lead: string;
  backHome: string;
  closingNote: string;
  sections: InformationSection[];
};

export type FaqPageCopy = InformationPageCopy & {
  itemsHeading: string;
  items: { question: string; answer: string }[];
};

export type ContactPageCopy = InformationPageCopy & {
  faqCardTitle: string;
  faqCardText: string;
  faqCardLink: string;
  accountCardTitle: string;
  accountCardText: string;
  accountCardLink: string;
  catalogueCardTitle: string;
  catalogueCardText: string;
  catalogueCardLink: string;
  emailCardTitle: string;
  emailCardText: string;
  emailConfiguredLabel: string;
  emailNotConfiguredTitle: string;
  emailNotConfiguredText: string;
};

export type StaticPagesCopy = {
  footerLinks: {
    heading: string;
    about: string;
    faq: string;
    contact: string;
    privacy: string;
    terms: string;
    deliveryRefunds: string;
  };
  about: InformationPageCopy;
  faq: FaqPageCopy;
  contact: ContactPageCopy;
  privacy: InformationPageCopy;
  terms: InformationPageCopy;
  deliveryRefunds: InformationPageCopy;
};

export const staticPages: Record<Locale, StaticPagesCopy> = {
  en: {
    footerLinks: {
      heading: "Help & policies",
      about: "About E-Vora",
      faq: "Frequently asked questions",
      contact: "Contact & support",
      privacy: "Privacy policy",
      terms: "Terms of use",
      deliveryRefunds: "Delivery & refunds",
    },
    about: {
      eyebrow: "About the store",
      title: "Digital shopping, with the details up front.",
      lead: "E-Vora is a digital-goods catalogue for browsing game top-ups, gift cards, subscriptions and software keys. We aim to make product requirements and current order status clear before you continue.",
      backHome: "Back to home",
      closingNote: "This page describes the current preview. Features may change before real transactions are enabled.",
      sections: [
        {
          heading: "A catalogue built for clarity",
          paragraphs: [
            "Browse by category, search the catalogue, compare displayed prices and review product-specific requirements before moving forward.",
            "Some products may require an account ID or region selection. Enter only the information requested by that product, and never share an account password.",
          ],
          bullets: [
            "Search and filter the available catalogue.",
            "Review product details and displayed stock information.",
            "Use Arabic or English and choose a light or dark theme.",
          ],
        },
        {
          heading: "Honest order status",
          paragraphs: [
            "The current checkout is a demonstration only. It does not process a real payment, reserve inventory, deliver a digital code or send an order-confirmation email.",
            "A demo order reference is just a reference to a test record; it is not proof of payment, a completed purchase or fulfillment.",
          ],
        },
        {
          heading: "Security and privacy matter",
          paragraphs: [
            "The application validates requests on the server and limits the information shown on public demo receipts. Account and provider features only work when their required configuration is available.",
            "Read the privacy policy, terms and delivery/refund information for a plain-language description of the current preview.",
          ],
        },
      ],
    },
    faq: {
      eyebrow: "Help centre",
      title: "Frequently asked questions",
      lead: "Quick answers about the catalogue, accounts, product requirements and the current demo checkout.",
      backHome: "Back to home",
      closingNote: "If an answer does not cover your issue, use the contact page. A support email is shown only when one has been configured.",
      sections: [],
      itemsHeading: "Browse answers",
      items: [
        {
          question: "What can I find in the E-Vora catalogue?",
          answer: "The catalogue may include game top-ups, gift cards, subscriptions and software keys. Use search, filters and product details to see what is currently listed.",
        },
        {
          question: "Can I make a real payment right now?",
          answer: "No. Checkout in this preview is demo-only. It does not charge a payment method, reserve stock or create a paid order. Production checkout stays disabled until verified payment processing is implemented.",
        },
        {
          question: "Will my demo order deliver a code?",
          answer: "No. A demo order records an unpaid test entry only. It does not send an email or provide a delivery code, and its reference is not proof of a purchase.",
        },
        {
          question: "Why does a product ask for a player ID or account region?",
          answer: "Some digital products depend on the destination account or region. Enter only the requested identifier, double-check it before continuing, and never provide your account password.",
        },
        {
          question: "How do I create an account?",
          answer: "Use the email sign-up form or Continue with Google when available. Email verification requires the email provider to be configured; Google sign-in requires OAuth credentials. If a provider is unavailable, the site should tell you rather than pretend the operation succeeded.",
        },
        {
          question: "I did not receive a verification email. What should I do?",
          answer: "Check your spam folder and the address you entered. If email delivery is not configured for the deployment, a verification message cannot be sent yet. Do not share verification codes or passwords with anyone.",
        },
        {
          question: "What happens to my language and theme choices?",
          answer: "The site provides Arabic and English, right-to-left support for Arabic, and light/dark themes. Preferences are stored in browser cookies so they can be remembered for later visits.",
        },
        {
          question: "Can I request a refund for a demo order?",
          answer: "A demo order is unpaid and no payment is collected, so there is no transaction to refund. Real-payment and fulfillment policies must be finalized before a live checkout is launched.",
        },
        {
          question: "How can I contact support?",
          answer: "Open the Contact & Support page. A direct email link appears only when a valid support address has been configured for the site.",
        },
      ],
    },
    contact: {
      eyebrow: "Get help",
      title: "Contact and support",
      lead: "Choose the route that best matches your question. We will not show a made-up email address or claim that an unconfigured form sent a message.",
      backHome: "Back to home",
      closingNote: "This preview does not promise a response time or 24/7 staffed support. Contact details should be confirmed before a public launch.",
      sections: [
        {
          heading: "Before sending a message",
          paragraphs: [
            "Include the page or product you were viewing and a brief description of the problem. Never send a password, full payment-card details, verification code or session token.",
            "Because checkout is currently a demo, a generated order reference does not mean a purchase was paid or delivered.",
          ],
        },
      ],
      faqCardTitle: "Common questions",
      faqCardText: "Find guidance about accounts, product requirements, verification and demo orders.",
      faqCardLink: "Visit the FAQ",
      accountCardTitle: "Account access",
      accountCardText: "Sign in to update your profile or review the account status available in this preview.",
      accountCardLink: "Open account",
      catalogueCardTitle: "Product help",
      catalogueCardText: "Open a product page to review its displayed price, availability and any required account ID or region.",
      catalogueCardLink: "Browse products",
      emailCardTitle: "Email support",
      emailCardText: "Use the published support address for questions related to this store.",
      emailConfiguredLabel: "Email the support team",
      emailNotConfiguredTitle: "Email support is not configured yet",
      emailNotConfiguredText: "A public support email has not been set for this deployment. You can still check the FAQ or browse the catalogue; this page will not pretend that a message was sent.",
    },
    privacy: {
      eyebrow: "Policies",
      title: "Privacy policy",
      lead: "A plain-language overview of information used by the current E-Vora preview. The final public policy should be reviewed against the real business, providers and applicable law before launch.",
      backHome: "Back to home",
      closingNote: "This is a general implementation summary, not legal advice. Update this policy when production providers, retention practices or business operations change.",
      sections: [
        {
          heading: "Information you provide",
          paragraphs: [
            "If you create an account, the application may process your name, email address, password hash, verification status and profile details. Passwords should never be stored as plain text.",
            "When you browse or add products to a cart, the application processes the catalogue and cart information needed to provide that feature. A demo checkout may collect contact fields to create an unpaid test record.",
          ],
        },
        {
          heading: "Cookies and sessions",
          paragraphs: [
            "Cookies are used for preferences such as language and theme, and for necessary cart or account-session behavior where those features are used. Session credentials are intended to be protected using server-side validation and secure cookie settings.",
            "Do not share session tokens, verification codes or passwords. Sign out on devices you do not control.",
          ],
        },
        {
          heading: "Providers and external services",
          paragraphs: [
            "Google sign-in, when configured and selected, involves Google's authentication service. Email verification depends on the configured email delivery provider. These integrations should not be considered live merely because the interface exists.",
            "The preview checkout does not process real payments. No payment provider should receive a charge request from the demo checkout.",
          ],
        },
        {
          heading: "Retention, public pages and your choices",
          paragraphs: [
            "Public demo receipts are designed to show an order reference rather than customer contact details or order totals. Technical records may be retained as needed for application operation and security; exact retention and deletion procedures must be finalized for the live service.",
            "You can change language and theme preferences in the site controls. For privacy questions, use the contact page if a valid support address is published.",
          ],
        },
      ],
    },
    terms: {
      eyebrow: "Policies",
      title: "Terms of use",
      lead: "These terms describe safe use of the current E-Vora preview. They must be reviewed and finalized for the actual business and jurisdiction before real sales begin.",
      backHome: "Back to home",
      closingNote: "This summary is not jurisdiction-specific legal advice. The operator should obtain an appropriate review before enabling paid transactions.",
      sections: [
        {
          heading: "Using the catalogue",
          paragraphs: [
            "You may browse the listed products, use search and filters, and review product descriptions, displayed prices, availability and region requirements. You are responsible for checking product compatibility before continuing.",
            "Do not attempt to abuse the service, interfere with other users, bypass account security or submit information that you are not authorized to use.",
          ],
        },
        {
          heading: "Accounts and security",
          paragraphs: [
            "Keep your sign-in details private and use only email addresses and account identifiers you control or are authorized to use. Never provide a third-party account password to request a top-up or code.",
            "Authentication features depend on the relevant provider configuration. The service may reject sign-in, verification or profile requests when required services are unavailable.",
          ],
        },
        {
          heading: "Demo orders and payment status",
          paragraphs: [
            "The current preview checkout is non-production and demo-only. It does not process a payment, reserve stock, issue digital goods or confirm a paid purchase.",
            "A demo order number is not a receipt for a payment and does not create a claim that a product has been delivered. Production checkout remains disabled until a verified payment flow is available.",
          ],
        },
        {
          heading: "Availability and updates",
          paragraphs: [
            "Catalogue entries, prices, stock information, pages and features may change during development. A displayed item is not a promise that real-world fulfillment is available.",
            "Before live transactions are enabled, the operator must publish finalized legal terms, payment, fulfillment, refund and customer-support information.",
          ],
        },
      ],
    },
    deliveryRefunds: {
      eyebrow: "Policies",
      title: "Delivery and refunds",
      lead: "The current E-Vora deployment is a preview. This page explains what that means today and avoids promising delivery or refunds for a transaction that has not occurred.",
      backHome: "Back to home",
      closingNote: "The live delivery and refund policy must be finalized and reviewed before accepting real payments.",
      sections: [
        {
          heading: "Current delivery status",
          paragraphs: [
            "Checkout in this preview is demo-only. Submitting the form can create an unpaid demo record, but it does not deliver a code, credit a player account, send a delivery email or reserve stock.",
            "A demo order reference identifies only that test record. It must not be treated as proof of purchase, activation or fulfillment.",
          ],
        },
        {
          heading: "Payments and refunds",
          paragraphs: [
            "The preview does not collect real payments, so a demo order does not create a payment to refund. Production checkout remains disabled until a payment provider and server-side payment verification are implemented.",
            "Refund eligibility, timelines, payment reversals and any exceptions for digital goods must be described in a finalized policy before live sales begin. This preview does not promise a refund service that is not yet operating.",
          ],
        },
        {
          heading: "Before placing a live order",
          paragraphs: [
            "When live purchasing becomes available, review the product's description, account ID requirements and region restrictions before confirming payment. Never provide an account password.",
            "If a future paid transaction has a problem, use the published customer-support route and provide only the minimum reference information requested. Never send card security codes or account credentials.",
          ],
        },
      ],
    },
  },
  ar: {
    footerLinks: {
      heading: "المساعدة والسياسات",
      about: "عن E-Vora",
      faq: "الأسئلة الشائعة",
      contact: "التواصل والدعم",
      privacy: "سياسة الخصوصية",
      terms: "شروط الاستخدام",
      deliveryRefunds: "التسليم والاسترداد",
    },
    about: {
      eyebrow: "عن المتجر",
      title: "تسوّق رقمي بتفاصيل واضحة من البداية.",
      lead: "E-Vora كتالوج للمنتجات الرقمية يضم شحن الألعاب وبطاقات الهدايا والاشتراكات ومفاتيح البرامج. هدفنا توضيح متطلبات المنتج وحالة الطلب الحالية قبل المتابعة.",
      backHome: "العودة للرئيسية",
      closingNote: "تصف هذه الصفحة نسخة المعاينة الحالية، وقد تتغير بعض المزايا قبل تفعيل المعاملات الحقيقية.",
      sections: [
        {
          heading: "كتالوج واضح وسهل الاستخدام",
          paragraphs: [
            "تصفح الأقسام، وابحث في الكتالوج، وقارن الأسعار المعروضة، وراجع متطلبات كل منتج قبل المتابعة.",
            "قد تحتاج بعض المنتجات إلى آي دي الحساب أو تحديد المنطقة. أدخل البيانات المطلوبة فقط، ولا تشارك كلمة مرور حسابك أبدًا.",
          ],
          bullets: [
            "البحث في الكتالوج وتصفية المنتجات.",
            "مراجعة تفاصيل المنتج والكمية المعروضة.",
            "استخدام العربية أو الإنجليزية واختيار الوضع الفاتح أو الداكن.",
          ],
        },
        {
          heading: "حالة الطلب بوضوح",
          paragraphs: [
            "إتمام الطلب في النسخة الحالية تجريبي فقط؛ لا تتم معالجة دفعة حقيقية، ولا حجز مخزون، ولا تسليم كود رقمي، ولا إرسال رسالة تأكيد بالبريد.",
            "رقم الطلب التجريبي يشير إلى سجل اختبار فقط، ولا يثبت الدفع أو اكتمال الشراء أو التسليم.",
          ],
        },
        {
          heading: "الأمان والخصوصية مهمان",
          paragraphs: [
            "يتحقق التطبيق من الطلبات على الخادم ويحد من البيانات التي تعرضها صفحات الطلبات التجريبية العامة. لا تعمل ميزات الحسابات والمزوّدين فعليًا إلا عند توفير إعداداتها المطلوبة.",
            "راجع سياسة الخصوصية وشروط الاستخدام ومعلومات التسليم والاسترداد لمعرفة تفاصيل نسخة المعاينة الحالية.",
          ],
        },
      ],
    },
    faq: {
      eyebrow: "مركز المساعدة",
      title: "الأسئلة الشائعة",
      lead: "إجابات سريعة عن الكتالوج والحسابات ومتطلبات المنتجات والطلب التجريبي الحالي.",
      backHome: "العودة للرئيسية",
      closingNote: "لو لم تجد إجابة لمشكلتك، افتح صفحة التواصل. لن يظهر بريد دعم إلا بعد ضبط عنوان فعلي للموقع.",
      sections: [],
      itemsHeading: "اختار سؤالك",
      items: [
        {
          question: "إيه المنتجات الموجودة في كتالوج E-Vora؟",
          answer: "قد يضم الكتالوج شحن ألعاب وبطاقات هدايا واشتراكات ومفاتيح برامج. استخدم البحث والفلاتر وتفاصيل المنتج لمعرفة المعروض حاليًا.",
        },
        {
          question: "هل أقدر أدفع فلوس حقيقية دلوقتي؟",
          answer: "لا. إتمام الطلب في النسخة الحالية تجريبي فقط؛ لا يتم خصم أي مبلغ أو حجز المخزون أو إنشاء طلب مدفوع. سيظل إتمام الطلب الإنتاجي معطلًا حتى تنفيذ نظام دفع والتحقق منه فعليًا.",
        },
        {
          question: "هل الطلب التجريبي هيوصل لي كود؟",
          answer: "لا. الطلب التجريبي ينشئ سجل اختبار غير مدفوع فقط. لا يرسل بريدًا ولا يسلّم كودًا، ورقم الطلب ليس إثباتًا لعملية شراء.",
        },
        {
          question: "ليه بعض المنتجات بتطلب آي دي اللاعب أو منطقة الحساب؟",
          answer: "بعض المنتجات الرقمية بتعتمد على الحساب أو المنطقة المستهدفة. أدخل المعرّف المطلوب فقط، وراجعه قبل المتابعة، ولا تكتب كلمة مرور حسابك.",
        },
        {
          question: "إزاي أعمل حساب؟",
          answer: "استخدم التسجيل بالبريد الإلكتروني أو المتابعة باستخدام Google عند توفرها. التحقق بالبريد يحتاج إعداد مزوّد إرسال الرسائل، وتسجيل الدخول بجوجل يحتاج بيانات OAuth. لو الخدمة غير متاحة، الموقع لازم يوضح ده بدل ما يدّعي إن العملية نجحت.",
        },
        {
          question: "ما وصلنيش إيميل التحقق، أعمل إيه؟",
          answer: "راجع البريد العشوائي والعنوان اللي أدخلته. لو إرسال الإيميل مش مُعدّ في نسخة الموقع، مش هيكون ممكن إرسال رسالة التحقق حاليًا. ما تشاركش كود التحقق أو كلمة المرور مع أي شخص.",
        },
        {
          question: "إيه اللي بيحصل لاختيارات اللغة والمظهر؟",
          answer: "الموقع بيوفر العربية والإنجليزية، واتجاه من اليمين لليسار للعربية، ووضع فاتح وداكن. يتم حفظ التفضيلات في ملفات تعريف الارتباط بالمتصفح لتذكرها في الزيارات التالية.",
        },
        {
          question: "هل أقدر أطلب استرداد فلوس طلب تجريبي؟",
          answer: "الطلب التجريبي غير مدفوع ولم يتم تحصيل أي مبلغ، لذلك لا توجد معاملة مالية لاستردادها. يجب تحديد سياسات الدفع والتسليم والاسترداد قبل تشغيل المشتريات الحقيقية.",
        },
        {
          question: "أتواصل مع الدعم إزاي؟",
          answer: "افتح صفحة التواصل والدعم. سيظهر رابط بريد مباشر فقط إذا تم ضبط عنوان دعم صحيح للموقع.",
        },
      ],
    },
    contact: {
      eyebrow: "محتاج مساعدة؟",
      title: "التواصل والدعم",
      lead: "اختار الطريقة المناسبة لسؤالك. مش هنعرض بريدًا وهميًا، ومش هندوّعي إن نموذجًا غير مُعدّ أرسل رسالتك.",
      backHome: "العودة للرئيسية",
      closingNote: "نسخة المعاينة لا تضمن وقتًا للرد أو وجود دعم بشري طوال اليوم. يجب تأكيد بيانات التواصل قبل الإطلاق العام.",
      sections: [
        {
          heading: "قبل إرسال أي رسالة",
          paragraphs: [
            "اذكر الصفحة أو المنتج اللي كنت بتشاهده واشرح المشكلة باختصار. لا ترسل كلمة مرور أو بيانات بطاقة كاملة أو كود تحقق أو رمز جلسة.",
            "لأن إتمام الطلب تجريبي حاليًا، رقم الطلب الناتج لا يعني أن عملية شراء مدفوعة أو تسليمًا قد حدث.",
          ],
        },
      ],
      faqCardTitle: "الأسئلة الشائعة",
      faqCardText: "اعرف المزيد عن الحسابات ومتطلبات المنتجات والتحقق والطلبات التجريبية.",
      faqCardLink: "افتح الأسئلة الشائعة",
      accountCardTitle: "الوصول للحساب",
      accountCardText: "سجّل الدخول لتحديث ملفك الشخصي أو مراجعة حالة الحساب المتاحة في هذه النسخة.",
      accountCardLink: "فتح الحساب",
      catalogueCardTitle: "مساعدة المنتجات",
      catalogueCardText: "افتح صفحة المنتج لمراجعة السعر والكمية والمتطلبات الخاصة بالآي دي أو المنطقة.",
      catalogueCardLink: "تصفح المنتجات",
      emailCardTitle: "الدعم عبر البريد",
      emailCardText: "استخدم عنوان الدعم المنشور للاستفسارات المتعلقة بالمتجر.",
      emailConfiguredLabel: "راسل فريق الدعم",
      emailNotConfiguredTitle: "بريد الدعم غير مُعدّ حتى الآن",
      emailNotConfiguredText: "لم يتم تحديد بريد دعم عام لهذه النسخة. يمكنك مراجعة الأسئلة الشائعة أو تصفح الكتالوج؛ ولن ندّعي أن رسالة قد أُرسلت.",
    },
    privacy: {
      eyebrow: "السياسات",
      title: "سياسة الخصوصية",
      lead: "شرح مبسط للبيانات التي تستخدمها نسخة E-Vora الحالية. يجب مراجعة السياسة النهائية وفقًا لطبيعة العمل والمزوّدين والقوانين المطبقة قبل الإطلاق.",
      backHome: "العودة للرئيسية",
      closingNote: "هذا ملخص عام لطريقة عمل التطبيق وليس استشارة قانونية. حدّث السياسة عند تغيير المزوّدين أو مدة الاحتفاظ بالبيانات أو طريقة تشغيل المتجر.",
      sections: [
        {
          heading: "البيانات التي تقدمها",
          paragraphs: [
            "إذا أنشأت حسابًا، فقد يعالج التطبيق اسمك وبريدك الإلكتروني وبصمة كلمة المرور وحالة التحقق وبيانات ملفك الشخصي. يجب ألا تُخزّن كلمات المرور كنص واضح.",
            "عند تصفح المنتجات أو إضافة عناصر للسلة، تتم معالجة بيانات الكتالوج والسلة اللازمة لهذه الميزة. وقد يجمع الطلب التجريبي بيانات التواصل لإنشاء سجل اختبار غير مدفوع.",
          ],
        },
        {
          heading: "ملفات تعريف الارتباط والجلسات",
          paragraphs: [
            "تُستخدم ملفات تعريف الارتباط لتفضيلات مثل اللغة والمظهر، ولتشغيل السلة أو جلسة الحساب عند استخدام هذه الميزات. ومن المفترض حماية بيانات الجلسة بالتحقق على الخادم وإعدادات ملفات تعريف الارتباط الآمنة.",
            "لا تشارك رموز الجلسات أو أكواد التحقق أو كلمات المرور، وسجّل الخروج من الأجهزة التي لا تتحكم فيها.",
          ],
        },
        {
          heading: "المزوّدون والخدمات الخارجية",
          paragraphs: [
            "عند إعداد تسجيل الدخول بجوجل واختياره، تتم عملية التحقق عبر خدمة Google. ويعتمد التحقق بالبريد الإلكتروني على مزوّد إرسال الرسائل المُعدّ. وجود الواجهة وحده لا يعني أن التكاملات مفعّلة فعليًا.",
            "الطلب التجريبي لا يعالج أي مدفوعات حقيقية، ولا ينبغي أن يرسل طلب دفع إلى مزوّد مالي.",
          ],
        },
        {
          heading: "الاحتفاظ بالبيانات والصفحات العامة",
          paragraphs: [
            "صُممت صفحات الطلبات التجريبية العامة لعرض رقم الطلب فقط بدلًا من بيانات التواصل أو إجماليات الطلب. وقد تُحتفظ بسجلات تقنية لأغراض تشغيل التطبيق وأمانه؛ ويجب تحديد قواعد الاحتفاظ والحذف بدقة قبل تشغيل الخدمة الحقيقية.",
            "يمكنك تغيير اللغة والمظهر من أدوات الموقع. وللاستفسارات المتعلقة بالخصوصية، استخدم صفحة التواصل إذا كان بريد دعم صحيح منشورًا.",
          ],
        },
      ],
    },
    terms: {
      eyebrow: "السياسات",
      title: "شروط الاستخدام",
      lead: "توضح هذه الشروط الاستخدام الآمن لنسخة E-Vora التجريبية الحالية، ويجب مراجعتها واستكمالها بما يناسب النشاط الفعلي والقوانين المطبقة قبل بدء البيع الحقيقي.",
      backHome: "العودة للرئيسية",
      closingNote: "هذا الملخص ليس استشارة قانونية خاصة ببلد معين. ينبغي للمشغّل الحصول على مراجعة مناسبة قبل تفعيل المعاملات المدفوعة.",
      sections: [
        {
          heading: "استخدام الكتالوج",
          paragraphs: [
            "يمكنك تصفح المنتجات والبحث والتصفية ومراجعة الأوصاف والأسعار والكميات ومتطلبات المنطقة. تقع على عاتقك مسؤولية التأكد من توافق المنتج مع حسابك قبل المتابعة.",
            "لا تحاول إساءة استخدام الخدمة أو تعطيلها أو تجاوز أمان الحسابات أو تقديم بيانات لا تملك حق استخدامها.",
          ],
        },
        {
          heading: "الحسابات والأمان",
          paragraphs: [
            "حافظ على سرية بيانات تسجيل الدخول، واستخدم فقط عناوين البريد ومعرّفات الحسابات التي تملكها أو لديك تصريح باستخدامها. لا تقدم كلمة مرور حساب خارجي لطلب شحن أو كود.",
            "تعتمد ميزات المصادقة على إعداد المزوّد المعني. وقد يرفض الموقع عمليات الدخول أو التحقق أو تحديث الملف الشخصي إذا لم تكن الخدمات المطلوبة متاحة.",
          ],
        },
        {
          heading: "الطلبات التجريبية وحالة الدفع",
          paragraphs: [
            "إتمام الطلب في المعاينة الحالية غير إنتاجي وتجريبي فقط. لا تتم معالجة دفعة أو حجز مخزون أو إصدار منتجات رقمية أو تأكيد شراء مدفوع.",
            "رقم الطلب التجريبي ليس إيصال دفع ولا يعني تسليم منتج. سيظل إتمام الطلب الإنتاجي معطلًا حتى توفر عملية دفع يمكن التحقق منها.",
          ],
        },
        {
          heading: "التوافر والتحديثات",
          paragraphs: [
            "قد تتغير المنتجات والأسعار والكميات والصفحات والميزات خلال التطوير. ظهور منتج في الكتالوج لا يضمن توفر عملية تسليم فعلية.",
            "قبل تفعيل التعاملات المباشرة، يجب نشر شروط نهائية ومعلومات واضحة عن الدفع والتسليم والاسترداد ودعم العملاء.",
          ],
        },
      ],
    },
    deliveryRefunds: {
      eyebrow: "السياسات",
      title: "التسليم والاسترداد",
      lead: "نسخة E-Vora الحالية هي نسخة معاينة. توضح هذه الصفحة الوضع الحالي بدون وعود بتسليم أو استرداد معاملة لم تحدث أصلًا.",
      backHome: "العودة للرئيسية",
      closingNote: "يجب وضع سياسة التسليم والاسترداد النهائية ومراجعتها قبل قبول مدفوعات حقيقية.",
      sections: [
        {
          heading: "حالة التسليم الحالية",
          paragraphs: [
            "إتمام الطلب في هذه النسخة تجريبي فقط. قد يؤدي إرسال النموذج إلى إنشاء سجل تجريبي غير مدفوع، لكنه لا يسلّم كودًا أو يشحن حساب لاعب أو يرسل رسالة تسليم أو يحجز المخزون.",
            "رقم الطلب التجريبي يشير إلى سجل اختبار فقط، ولا يُعد إثباتًا للشراء أو التفعيل أو التسليم.",
          ],
        },
        {
          heading: "المدفوعات والاسترداد",
          paragraphs: [
            "لا تجمع نسخة المعاينة مدفوعات حقيقية، لذلك لا ينشأ عن الطلب التجريبي مبلغ مدفوع لاسترداده. يظل إتمام الطلب الإنتاجي معطلًا حتى تنفيذ مزوّد دفع والتحقق من نتيجة الدفع على الخادم.",
            "يجب توضيح أهلية الاسترداد ومدته وإجراءات عكس الدفع وأي استثناءات للمنتجات الرقمية في سياسة نهائية قبل بدء البيع الحقيقي. ولا تعد هذه النسخة بخدمة استرداد غير مُفعّلة.",
          ],
        },
        {
          heading: "قبل طلب حقيقي",
          paragraphs: [
            "عند إتاحة الشراء الفعلي مستقبلًا، راجع وصف المنتج ومتطلبات معرّف الحساب والمنطقة قبل تأكيد الدفع. لا تقدم كلمة مرور حسابك.",
            "إذا حدثت مشكلة في معاملة مدفوعة مستقبلًا، استخدم وسيلة دعم منشورة وقدّم الحد الأدنى المطلوب من بيانات المرجع. لا ترسل رموز أمان البطاقة أو بيانات الدخول.",
          ],
        },
      ],
    },
  },
};
