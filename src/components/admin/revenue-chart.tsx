import type { Locale } from "@/lib/i18n/dictionary";
import { formatCents } from "@/lib/money";

type Point = { day: string; salesCents: number; orderCount: number };

export function RevenueChart({ points, locale, label }: { points: Point[]; locale: Locale; label: string }) {
  const width = 760;
  const height = 270;
  const left = 72;
  const right = 16;
  const top = 22;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...points.map((point) => point.salesCents));
  const allZero = points.every((point) => point.salesCents === 0);
  const coordinates = points.map((point, index) => ({
    ...point,
    x: left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth),
    y: top + plotHeight - (point.salesCents / maximum) * plotHeight,
  }));
  const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const areaPath = coordinates.length
    ? `${linePath} L ${coordinates.at(-1)!.x} ${top + plotHeight} L ${coordinates[0].x} ${top + plotHeight} Z`
    : "";
  const moneyFormat = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const dayFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const ticks = [0, 0.5, 1];
  const labelsAt = points.length <= 5
    ? points.map((_, index) => index)
    : [...new Set([0, Math.round((points.length - 1) / 3), Math.round(((points.length - 1) * 2) / 3), points.length - 1])];

  return (
    <div className="admin-chart-wrap">
      <svg className="admin-revenue-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
        <defs>
          <linearGradient id="adminRevenueFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--admin-chart-line)" stopOpacity=".30" />
            <stop offset="100%" stopColor="var(--admin-chart-line)" stopOpacity=".015" />
          </linearGradient>
        </defs>
        {ticks.map((fraction) => {
          const y = top + plotHeight - fraction * plotHeight;
          const cents = Math.round(maximum * fraction);
          return <g key={fraction}>
            <line x1={left} x2={width - right} y1={y} y2={y} className="admin-chart-gridline" />
            <text x={left - 10} y={y + 4} textAnchor="end" className="admin-chart-axis-label">{moneyFormat.format(cents / 100)}</text>
          </g>;
        })}
        {!allZero && <path d={areaPath} fill="url(#adminRevenueFill)" />}
        <path d={linePath || `M${left} ${top + plotHeight} L${width - right} ${top + plotHeight}`} className={`admin-chart-line ${allZero ? "is-empty" : ""}`} />
        {!allZero && coordinates.map((point) => <circle key={point.day} cx={point.x} cy={point.y} r="3.25" className="admin-chart-dot"><title>{`${dayFormat.format(new Date(`${point.day}T00:00:00Z`))}: ${formatCents(point.salesCents, locale)} · ${point.orderCount} ${locale === "ar" ? "طلب" : "orders"}`}</title></circle>)}
        {labelsAt.map((index) => <text key={points[index]?.day} x={coordinates[index]?.x ?? left} y={height - 7} textAnchor="middle" className="admin-chart-axis-label">{points[index] ? dayFormat.format(new Date(`${points[index].day}T00:00:00Z`)) : ""}</text>)}
      </svg>
      {allZero && <div className="admin-chart-empty"><span aria-hidden="true">✦</span><p>{locale === "ar" ? "هتظهر حركة المبيعات هنا مع تسجيل الطلبات." : "Sales activity will appear here as orders are recorded."}</p></div>}
      <ul className="sr-only">
        {points.map((point) => <li key={point.day}>{dayFormat.format(new Date(`${point.day}T00:00:00Z`))}: {formatCents(point.salesCents, locale)}, {point.orderCount} {locale === "ar" ? "طلبات" : "orders"}</li>)}
      </ul>
    </div>
  );
}
