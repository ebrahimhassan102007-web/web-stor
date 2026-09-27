import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-edge bg-base/80">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30 text-primary font-extrabold text-sm">
                خ
              </span>
              <span className="font-extrabold">
                خدمتك <span className="text-primary">ستور</span>
              </span>
            </div>
            <p className="mt-4 text-sm text-muted leading-relaxed">
              خدماتك الرقمية في مكان واحد — اشتراكات، شحن ألعاب، رصيد،
              وبطاقات رقمية أصلية بتسليم آمن وسريع.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-foreground">الأقسام</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li><Link href="/products?category=subscriptions" className="hover:text-primary transition-colors">اشتراكات رقمية</Link></li>
              <li><Link href="/products?category=gaming" className="hover:text-primary transition-colors">شحن ألعاب</Link></li>
              <li><Link href="/products?category=recharge" className="hover:text-primary transition-colors">شحن رصيد</Link></li>
              <li><Link href="/products?category=gift-cards" className="hover:text-primary transition-colors">بطاقات رقمية</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold text-foreground">الأمان</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li className="flex items-center gap-2"><span className="text-success">✓</span> دفع آمن ومشفّر</li>
              <li className="flex items-center gap-2"><span className="text-success">✓</span> أكواد مشفّرة حتى التسليم</li>
              <li className="flex items-center gap-2"><span className="text-success">✓</span> تحقق صارم من كل طلب</li>
              <li className="flex items-center gap-2"><span className="text-success">✓</span> بدون متتبعات خارجية</li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold text-foreground">الحالة</h2>
            <div className="mt-4 space-y-3">
              <span className="badge-green">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                جميع الأنظمة تعمل
              </span>
              <p className="text-xs text-muted">
                Khodmtak Store — Your Digital Services, All in One Place
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-edge pt-6 sm:flex-row">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} خدمتك ستور. متجر تجريبي — لا تتم معالجة
            مدفوعات حقيقية في بيئة التطوير.
          </p>
          <p className="text-xs text-muted">صُنع بأمان وحب 🛡️</p>
        </div>
      </div>
    </footer>
  );
}
