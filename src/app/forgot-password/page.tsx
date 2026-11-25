import { ForgotPasswordForm } from "@/components/password-recovery-form";
import { getI18n } from "@/lib/i18n/server";
export const dynamic = "force-dynamic";
export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return <main className="mx-auto min-h-[60vh] max-w-5xl px-4 py-12"><div className="mb-5 text-center"><p className="eyebrow">E-VORA / ACCOUNT SECURITY</p><p className="mt-2 text-sm text-muted">{t.auth.twoFactor.title}</p></div><ForgotPasswordForm /></main>;
}
