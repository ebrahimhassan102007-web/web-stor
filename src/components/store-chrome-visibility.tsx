"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Give protected admin pages their own workspace chrome instead of the shop header/footer. */
export function StoreChromeVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return children;
}
