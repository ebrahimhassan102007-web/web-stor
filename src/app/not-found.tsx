"use client";

import Link from "next/link";
import { useI18n } from "@/components/locale-provider";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <div className="glass-card relative isolate overflow-hidden p-12 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(38rem_16rem_at_50%_-20%,var(--ambient-1),transparent_70%)]"
        />
        <p className="text-gradient-dawn font-mono text-6xl font-bold">404</p>
        <h1 className="title-luxe mt-4 text-2xl">{t.notFound.title}</h1>
        <p className="mt-2 text-sm text-muted">{t.notFound.text}</p>
        <Link href="/" className="btn-primary mt-8 px-8">
          {t.notFound.back}
        </Link>
      </div>
    </div>
  );
}
