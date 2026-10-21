"use client";

import Link from "next/link";
import { useI18n } from "@/components/locale-provider";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <div className="glass-card card-glow-red p-12 text-center">
        <p className="font-mono text-6xl font-bold text-primary">404</p>
        <h1 className="mt-4 text-2xl font-bold">{t.notFound.title}</h1>
        <p className="mt-2 text-sm text-muted">{t.notFound.text}</p>
        <Link href="/" className="btn-primary mt-8 px-8">
          {t.notFound.back}
        </Link>
      </div>
    </div>
  );
}
