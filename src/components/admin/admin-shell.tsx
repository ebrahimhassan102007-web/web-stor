"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LanguageToggle, ThemeToggle } from "@/components/preference-toggles";
import { SignOutButton } from "@/components/sign-out-button";
import type { Locale, Theme } from "@/lib/i18n/dictionary";

type AdminUser = { displayName: string; email: string };
type IconName = "overview" | "orders" | "products" | "customers" | "analytics" | "creative" | "store";

const paths: Record<IconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="13" width="7" height="8" rx="2" /></>,
  orders: <><path d="M7 3.75h7.2L19 8.5v11.75a.75.75 0 0 1-.75.75H7a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z" /><path d="M14 4v5h5M8.5 13h7M8.5 16.5h7" /></>,
  products: <><path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9L12 3Z" /><path d="m3.8 7.7 8.2 4.5 8.2-4.5M12 12.2V21M7.8 5.2l8.4 4.6" /></>,
  customers: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" /><circle cx="9.5" cy="7" r="3.5" /><path d="M17 11a3.5 3.5 0 1 0-1.2-6.8M17 14.5h.5a4 4 0 0 1 4 4V20" /></>,
  analytics: <><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 6-7" /><path d="M16 6h4v4" /></>,
  creative: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15ZM5 3l.6 1.9L7.5 5.5l-1.9.6L5 8l-.6-1.9-1.9-.6 1.9-.6L5 3Z" /></>,
  store: <><path d="M3 10.5V20h18v-9.5M2.5 8.5 4.4 4h15.2l1.9 4.5" /><path d="M3 8.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M9 20v-5h6v5" /></>,
};

function AdminIcon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function AdminShell({
  locale,
  initialTheme,
  user,
  children,
}: {
  locale: Locale;
  initialTheme: Theme;
  user: AdminUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const ar = locale === "ar";
  const labels = ar
    ? { overview: "نظرة عامة", orders: "الطلبات", products: "المنتجات", customers: "العملاء", analytics: "التحليلات", creative: "الإبداع", workspace: "مساحة إدارة المتجر", menu: "القائمة الرئيسية", store: "زيارة واجهة المتجر", secure: "لوحة خاصة وآمنة", switchStore: "المتجر" }
    : { overview: "Overview", orders: "Orders", products: "Products", customers: "Customers", analytics: "Analytics", creative: "Creative", workspace: "Store workspace", menu: "MAIN MENU", store: "Visit storefront", secure: "Private admin workspace", switchStore: "Storefront" };

  const navItems: { href: string; label: string; icon: IconName }[] = [
    { href: "/admin", label: labels.overview, icon: "overview" },
    { href: "/admin/orders", label: labels.orders, icon: "orders" },
    { href: "/admin/products", label: labels.products, icon: "products" },
    { href: "/admin/customers", label: labels.customers, icon: "customers" },
    { href: "/admin/analytics", label: labels.analytics, icon: "analytics" },
    { href: "/admin/creative", label: labels.creative, icon: "creative" },
  ];

  const isActive = (href: string) => href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
  const initials = user.displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "E";

  return (
    <div className="admin-workspace min-h-[calc(100vh-4rem)]" dir={ar ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-[1680px] px-3 pb-10 pt-3 sm:px-5 sm:pt-5 xl:px-8">
        <header className="admin-topbar">
          <Link href="/admin" className="admin-brand group" aria-label="E-Vora admin home">
            <span className="admin-brand-mark">E</span>
            <span className="min-w-0">
              <span className="block text-[15px] font-black tracking-tight">E‑Vora <span className="text-primary">Studio</span></span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[.17em] text-muted">{labels.workspace}</span>
            </span>
          </Link>

          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link href="/admin/creative" className={`admin-creative-link ${isActive("/admin/creative") ? "admin-creative-link-active" : ""}`}>
              <AdminIcon name="creative" className="h-[18px] w-[18px]" />
              <span>{ar ? "الإبداع" : "Creative"}</span>
              <span className="admin-new-badge">{ar ? "جديد" : "NEW"}</span>
            </Link>
            <div className="hidden items-center gap-2 lg:flex"><LanguageToggle /><ThemeToggle initialTheme={initialTheme} /></div>
            <div className="admin-avatar" title={user.displayName} aria-label={user.displayName}>{initials}</div>
          </div>
        </header>

        <div className="admin-layout-grid mt-4 lg:mt-6">
          <aside className="admin-sidebar hidden lg:flex">
            <div className="admin-sidebar-user">
              <div className="admin-avatar admin-avatar-large">{initials}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{user.displayName}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>
              </div>
              <span className="admin-online-dot" aria-label={ar ? "متصل" : "Signed in"} />
            </div>
            <p className="admin-nav-label">{labels.menu}</p>
            <nav aria-label={labels.menu} className="admin-nav-list">
              {navItems.map((item, index) => (
                <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className={`admin-nav-link ${isActive(item.href) ? "is-active" : ""}`} style={{ animationDelay: `${index * 45}ms` }}>
                  <AdminIcon name={item.icon} />
                  <span>{item.label}</span>
                  {item.href === "/admin/orders" && <span className="admin-nav-spark">✦</span>}
                </Link>
              ))}
            </nav>
            <div className="admin-sidebar-spacer" />
            <div className="admin-sidebar-note">
              <span className="admin-note-icon">✦</span>
              <p className="font-semibold">{ar ? "وصول آمن" : "Secure access"}</p>
              <p className="mt-1 leading-5">{labels.secure}</p>
            </div>
            <Link href="/" className="admin-store-link"><AdminIcon name="store" className="h-4 w-4" /><span>{labels.store}</span><span aria-hidden="true" className="ms-auto">↗</span></Link>
            <div className="admin-signout"><SignOutButton /></div>
          </aside>

          <div className="min-w-0">
            <nav aria-label={ar ? "التنقل السريع" : "Quick navigation"} className="admin-mobile-nav lg:hidden">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className={`admin-mobile-nav-link ${isActive(item.href) ? "is-active" : ""}`}>
                  <span>{item.label}</span>
                </Link>
              ))}
              <Link href="/" className="admin-mobile-nav-link"><span>{labels.switchStore}</span></Link>
            </nav>
            <div className="mb-3 flex items-center justify-between gap-3 px-1 sm:mb-4 lg:hidden">
              <span className="truncate text-xs text-muted">{user.displayName} · {ar ? "مدير المتجر" : "Store admin"}</span>
              <div className="flex shrink-0 items-center gap-2"><LanguageToggle /><ThemeToggle initialTheme={initialTheme} /><div className="admin-mobile-signout"><SignOutButton /></div></div>
            </div>
            <div className="admin-page-content">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
