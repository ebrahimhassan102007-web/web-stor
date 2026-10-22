import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccountUser } from "@/lib/security/account-session";
import { AccountProfileForm } from "@/components/account-profile-form";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const user = await getCurrentAccountUser();
  if (!user) redirect("/login");
  const initials = user.name.trim().charAt(0).toUpperCase() || "U";
  return <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
    <Link href="/" className="text-sm text-muted transition-colors hover:text-foreground">← Back to shop</Link>
    <div className="mt-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="badge-green">Customer account</p><h1 className="mt-3 text-3xl font-bold tracking-tight">My <span className="text-primary">account</span></h1><p className="mt-2 text-sm text-muted">Manage the details you want to keep ready for future orders.</p></div>
      <SignOutButton />
    </div>
    <div className="mt-8 grid gap-6 lg:grid-cols-[16rem_1fr]">
      <aside className="glass-card h-fit p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-2xl font-bold text-primary">{initials}</div>
        <h2 className="mt-4 break-words text-lg font-semibold">{user.name}</h2><p className="mt-1 break-all text-sm text-muted">{user.email}</p>
        <div className="mt-5 border-t border-edge pt-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Signed in with</p><p className="mt-2 flex items-center gap-2 text-sm font-medium"><span className="flex h-6 w-6 items-center justify-center rounded bg-white text-xs font-bold text-blue-600">G</span>Google</p></div>
        <p className="mt-5 text-xs leading-relaxed text-muted">Payment and order history are not included in this phase.</p>
      </aside>
      <AccountProfileForm initialValues={{name:user.name,phone:user.phone,addressLine1:user.addressLine1,addressLine2:user.addressLine2,city:user.city,postalCode:user.postalCode,country:user.country}} />
    </div>
  </main>;
}
