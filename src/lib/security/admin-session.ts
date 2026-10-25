import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentAccountUser } from "@/lib/security/account-session";

/**
 * Gate each admin page before it starts loading data. The shared layout also
 * uses this check for its shell; protecting the pages themselves prevents
 * server components from fetching private data while a parallel layout render
 * is deciding to return a 404 for a non-admin account.
 */
export const requireAdminUser = cache(async () => {
  const user = await getCurrentAccountUser();
  if (!user) redirect("/login?next=%2Fadmin");

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || user.email.toLowerCase() !== adminEmail) notFound();

  return user;
});
