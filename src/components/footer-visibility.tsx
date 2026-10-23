"use client";

import { usePathname } from "next/navigation";

/** Keep the sign-in screen focused; the storefront footer appears on other routes. */
export function FooterVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return children;
}
