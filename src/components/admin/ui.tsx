import type { ReactNode } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/dictionary";
import { formatCents } from "@/lib/money";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-page-heading">
      <div className="min-w-0">
        <p className="admin-eyebrow">{eyebrow}</p>
        <h1 className="admin-page-title">{title}</h1>
        {description && <p className="admin-page-description">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  delta,
  icon,
  accent = "red",
  index = 0,
}: {
  label: string;
  value: string;
  detail: string;
  delta?: { value: number | null; positiveWhenUp?: boolean; fresh?: boolean };
  icon: ReactNode;
  accent?: "red" | "gold" | "green" | "blue";
  index?: number;
}) {
  const positive = (delta?.value ?? 0) >= 0;
  const trendClass = delta?.value === null
    ? "neutral"
    : (positive === (delta?.positiveWhenUp ?? true) ? "positive" : "negative");
  const deltaValue = delta?.value;
  const trendText = delta?.fresh
    ? "NEW"
    : deltaValue === null || deltaValue === undefined
      ? "—"
      : `${positive ? "+" : "−"}${Math.abs(deltaValue).toFixed(1)}%`;

  return (
    <article className={`admin-metric-card admin-accent-${accent} admin-enter`} style={{ animationDelay: `${index * 65}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="admin-metric-label">{label}</p>
          <p className="admin-metric-value" dir="ltr">{value}</p>
        </div>
        <span className="admin-metric-icon">{icon}</span>
      </div>
      <div className="mt-4 flex min-h-6 flex-wrap items-center justify-between gap-2">
        <p className="admin-metric-detail">{detail}</p>
        {delta && <span className={`admin-trend admin-trend-${trendClass}`} title={delta?.value === null ? detail : undefined}>{trendText}</span>}
      </div>
    </article>
  );
}

export function ReportRangeSwitcher({
  current,
  locale,
  basePath,
}: {
  current: "7d" | "30d" | "90d";
  locale: Locale;
  basePath: string;
}) {
  const options = locale === "ar"
    ? [{ value: "7d", label: "٧ أيام" }, { value: "30d", label: "٣٠ يوم" }, { value: "90d", label: "٩٠ يوم" }]
    : [{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }];
  return (
    <div className="admin-range-switcher" role="group" aria-label={locale === "ar" ? "الفترة الزمنية" : "Date range"}>
      {options.map((option) => (
        <Link key={option.value} href={`${basePath}?range=${option.value}`} aria-current={current === option.value ? "page" : undefined} className={current === option.value ? "is-active" : ""}>
          {option.label}
        </Link>
      ))}
    </div>
  );
}

export function OrderStatusBadge({ status, locale }: { status: string; locale: Locale }) {
  const ar = locale === "ar";
  const labels: Record<string, string> = ar
    ? { confirmed: "مؤكد", fulfilled: "مكتمل", cancelled: "ملغي", pending: "قيد الانتظار", processing: "قيد المعالجة" }
    : { confirmed: "Confirmed", fulfilled: "Fulfilled", cancelled: "Cancelled", pending: "Pending", processing: "Processing" };
  const knownStatus = ["confirmed", "fulfilled", "cancelled", "pending", "processing"].includes(status) ? status : "other";
  return <span className={`admin-status admin-status-${knownStatus}`}>{labels[status] ?? status}</span>;
}

export function EmptyState({
  icon = "✦",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-empty-state">
      <span className="admin-empty-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function AdminSearchForm({
  locale,
  query,
  placeholder,
  action,
  status,
  showStatus = false,
}: {
  locale: Locale;
  query?: string;
  placeholder: string;
  action: string;
  status?: string;
  showStatus?: boolean;
}) {
  const ar = locale === "ar";
  return (
    <form action={action} className="admin-filter-bar">
      <label className="admin-search-field">
        <span className="sr-only">{ar ? "بحث" : "Search"}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]"><circle cx="10.8" cy="10.8" r="6.8" /><path strokeLinecap="round" d="m16 16 4.5 4.5" /></svg>
        <input name="q" type="search" defaultValue={query} placeholder={placeholder} autoComplete="off" />
      </label>
      {showStatus && (
        <label className="admin-select-field">
          <span className="sr-only">{ar ? "حالة الطلب" : "Order status"}</span>
          <select name="status" defaultValue={status ?? ""}>
            <option value="">{ar ? "كل الحالات" : "All statuses"}</option>
            <option value="confirmed">{ar ? "مؤكد" : "Confirmed"}</option>
            <option value="fulfilled">{ar ? "مكتمل" : "Fulfilled"}</option>
            <option value="cancelled">{ar ? "ملغي" : "Cancelled"}</option>
          </select>
        </label>
      )}
      <button className="admin-button-primary" type="submit">{ar ? "بحث" : "Search"}</button>
      {(query || status) && <Link className="admin-filter-clear" href={action}>{ar ? "مسح" : "Clear"}</Link>}
    </form>
  );
}

export function formatAdminDate(date: Date, locale: Locale, includeTime = false): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

export function money(cents: number, locale: Locale): string {
  return formatCents(cents, locale);
}

export function AdminTableHeading({ children }: { children: ReactNode }) {
  return <div className="admin-table-heading">{children}</div>;
}
