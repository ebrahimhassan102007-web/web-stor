import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountProfileForm } from "@/components/account-profile-form";
import { SignOutButton } from "@/components/sign-out-button";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { fill } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.meta.accountTitle,
    description: t.meta.accountDescription,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${t.meta.accountTitle} · E-Vora`,
      description: t.meta.accountDescription,
      siteName: "E-Vora",
      type: "website",
    },
  };
}

export default async function AccountPage() {
  const [{ locale, t }, user] = await Promise.all([
    getI18n(),
    getCurrentAccountUser(),
  ]);
  if (!user) redirect("/login?next=%2Faccount");

  const createdDate = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-EG" : "en-US",
    { year: "numeric", month: "long" },
  ).format(user.createdAt);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <span className={`${user.emailVerifiedAt ? "badge-green" : "badge-red"} mb-4`}>
          <span
            className={`h-1.5 w-1.5 rounded-full ${user.emailVerifiedAt ? "bg-success" : "bg-primary"}`}
          />
          {user.emailVerifiedAt ? t.auth.emailVerified : t.auth.emailNotVerified}
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          {t.auth.profileTitle}
        </h1>
        <p className="mt-2 text-sm text-muted">{t.auth.profileSubtitle}</p>
      </div>

      <div className="glass-card card-glow-green p-6 sm:p-8">
        <AccountProfileForm
          initialName={user.displayName}
          email={user.email}
          emailVerified={Boolean(user.emailVerifiedAt)}
          googleLinked={user.googleLinked}
          passwordLoginEnabled={user.passwordLoginEnabled}
        />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-edge pt-5">
          <p className="text-xs text-muted">
            {fill(t.auth.memberSince, { date: createdDate })}
          </p>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
