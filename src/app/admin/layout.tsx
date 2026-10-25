import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { getI18n, getTheme } from "@/lib/i18n/server";
import { requireAdminUser } from "@/lib/security/admin-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdminUser();
  const [{ locale }, theme] = await Promise.all([getI18n(), getTheme()]);

  return (
    <AdminShell locale={locale} initialTheme={theme} user={user}>
      {children}
    </AdminShell>
  );
}
