import { ResetPasswordForm } from "@/components/password-recovery-form";
export const dynamic = "force-dynamic";
export default function ResetPasswordPage() {
  return <main className="mx-auto min-h-[60vh] max-w-5xl px-4 py-12"><div className="mb-5 text-center"><p className="eyebrow">E-VORA / ACCOUNT SECURITY</p></div><ResetPasswordForm /></main>;
}
