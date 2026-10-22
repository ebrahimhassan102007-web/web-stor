import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPanel } from "@/components/auth-panel";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { safeReturnPath } from "@/lib/security/auth-core";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  email?: string | string[];
  authError?: string | string[];
  next?: string | string[];
}>;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.meta.loginTitle,
    description: t.meta.loginDescription,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${t.meta.loginTitle} · E-Vora`,
      description: t.meta.loginDescription,
      siteName: "E-Vora",
      type: "website",
    },
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, user] = await Promise.all([
    searchParams,
    getCurrentAccountUser(),
  ]);
  const nextPath = safeReturnPath(
    typeof params.next === "string" ? params.next : undefined,
  );
  if (user) redirect(nextPath);

  return (
    <AuthPanel
      initialEmail={typeof params.email === "string" ? params.email.slice(0, 254) : ""}
      initialError={typeof params.authError === "string" ? params.authError : undefined}
      nextPath={nextPath}
    />
  );
}
