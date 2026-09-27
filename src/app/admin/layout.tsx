import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/security/auth";
import { AdminNav } from "@/components/admin/admin-nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "لوحة التحكم", template: "%s | لوحة التحكم" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  // Non-admins get a 404, not a 403 — the panel's existence is not advertised.
  if (user.role !== "admin") notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            لوحة <span className="text-primary">التحكم</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted ltr-inline">{user.email}</p>
        </div>
        <Link href="/" className="btn-ghost px-4 py-2 text-sm">
          ← العودة للمتجر
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        <AdminNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
