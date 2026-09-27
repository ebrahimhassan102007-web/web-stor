"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "نظرة عامة", icon: "📊" },
  { href: "/admin/products", label: "المنتجات", icon: "📦" },
  { href: "/admin/categories", label: "التصنيفات", icon: "🗂️" },
  { href: "/admin/orders", label: "الطلبات", icon: "🧾" },
  { href: "/admin/audit", label: "سجل النشاط", icon: "🛡️" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="لوحة التحكم" className="lg:sticky lg:top-24 h-fit">
      <ul className="flex lg:flex-col gap-1.5 overflow-x-auto pb-2 lg:pb-0">
        {LINKS.map((l) => {
          const active =
            l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
          return (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted hover:text-foreground hover:bg-raised/80 border border-transparent"
                }`}
              >
                <span aria-hidden>{l.icon}</span>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
