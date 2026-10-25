import "server-only";

import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db, categories, orderItems, orders, products, users } from "@/lib/db";

export type ReportRange = "7d" | "30d" | "90d";
export const REPORT_RANGES: ReportRange[] = ["7d", "30d", "90d"];
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseReportRange(value: unknown): ReportRange {
  return value === "7d" || value === "90d" ? value : "30d";
}

export function rangeDays(range: ReportRange): number {
  return range === "7d" ? 7 : range === "90d" ? 90 : 30;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function periodFor(range: ReportRange, now = new Date()) {
  const duration = rangeDays(range) * DAY_MS;
  const end = now;
  const start = new Date(end.getTime() - duration);
  const previousEnd = start;
  const previousStart = new Date(previousEnd.getTime() - duration);
  return { start, end, previousStart, previousEnd };
}

async function summarizeOrders(start: Date, end: Date) {
  const [row] = await db
    .select({
      salesCents: sql<number>`coalesce(sum(case when ${orders.status} <> 'cancelled' then ${orders.totalCents} else 0 end), 0)`,
      orderCount: sql<number>`count(*) filter (where ${orders.status} <> 'cancelled')`,
      cancelledCount: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')`,
    })
    .from(orders)
    .where(and(gte(orders.createdAt, start), lt(orders.createdAt, end)));

  const salesCents = toNumber(row?.salesCents);
  const orderCount = toNumber(row?.orderCount);
  return {
    salesCents,
    orderCount,
    cancelledCount: toNumber(row?.cancelledCount),
    averageOrderCents: orderCount ? Math.round(salesCents / orderCount) : 0,
  };
}

async function getSalesSeries(range: ReportRange, start: Date, end: Date) {
  const dayExpression = sql<string>`to_char(${orders.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day: dayExpression,
      salesCents: sql<number>`coalesce(sum(case when ${orders.status} <> 'cancelled' then ${orders.totalCents} else 0 end), 0)`,
      orderCount: sql<number>`count(*) filter (where ${orders.status} <> 'cancelled')`,
    })
    .from(orders)
    .where(and(gte(orders.createdAt, start), lt(orders.createdAt, end)))
    .groupBy(dayExpression)
    .orderBy(dayExpression);

  const byDay = new Map(rows.map((row) => [row.day, row]));
  const today = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const days: { day: string; salesCents: number; orderCount: number }[] = [];

  for (let cursor = first; cursor <= today; cursor = new Date(cursor.getTime() + DAY_MS)) {
    const key = dayKey(cursor);
    const row = byDay.get(key);
    days.push({
      day: key,
      salesCents: toNumber(row?.salesCents),
      orderCount: toNumber(row?.orderCount),
    });
  }

  // Keep the range argument in the signature so the function remains explicit
  // at call sites even when the date labels naturally create one extra bucket.
  void range;
  return days;
}

async function getTopProducts(start: Date, end: Date, limit = 5) {
  const rows = await db
    .select({
      id: orderItems.productId,
      name: orderItems.productName,
      nameAr: orderItems.productNameAr,
      icon: products.icon,
      units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
      salesCents: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPriceCents}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(
      and(
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
        ne(orders.status, "cancelled"),
      ),
    )
    .groupBy(orderItems.productId, orderItems.productName, orderItems.productNameAr, products.icon)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    units: toNumber(row.units),
    salesCents: toNumber(row.salesCents),
  }));
}

async function getOrderStatuses(start: Date, end: Date) {
  const rows = await db
    .select({ status: orders.status, total: count(orders.id) })
    .from(orders)
    .where(and(gte(orders.createdAt, start), lt(orders.createdAt, end)))
    .groupBy(orders.status)
    .orderBy(desc(count(orders.id)));
  return rows.map((row) => ({ status: row.status, total: toNumber(row.total) }));
}

export async function getAdminOverviewData(range: ReportRange) {
  const { start, end, previousStart, previousEnd } = periodFor(range);
  const [current, previous, productTotals, customerTotal, recentOrders, lowStock, topProducts, salesSeries] = await Promise.all([
    summarizeOrders(start, end),
    summarizeOrders(previousStart, previousEnd),
    db
      .select({
        total: count(products.id),
        lowStock: sql<number>`count(*) filter (where ${products.stock} > 0 and ${products.stock} <= 10)`,
        outOfStock: sql<number>`count(*) filter (where ${products.stock} <= 0)`,
        stockUnits: sql<number>`coalesce(sum(${products.stock}), 0)`,
      })
      .from(products)
      .then(([row]) => ({
        total: toNumber(row?.total),
        lowStock: toNumber(row?.lowStock),
        outOfStock: toNumber(row?.outOfStock),
        stockUnits: toNumber(row?.stockUnits),
      })),
    db.select({ total: count(users.id) }).from(users).then(([row]) => toNumber(row?.total)),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        email: orders.email,
        status: orders.status,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(6),
    db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        nameAr: products.nameAr,
        icon: products.icon,
        stock: products.stock,
        priceCents: products.priceCents,
      })
      .from(products)
      .where(sql`${products.stock} <= 10`)
      .orderBy(products.stock, products.name)
      .limit(4),
    getTopProducts(start, end, 5),
    getSalesSeries(range, start, end),
  ]);

  return {
    range,
    current,
    previous,
    productTotals,
    customerTotal,
    recentOrders,
    lowStock,
    topProducts,
    salesSeries,
  };
}

export async function getAdminAnalyticsData(range: ReportRange) {
  const { start, end, previousStart, previousEnd } = periodFor(range);
  const [current, previous, salesSeries, topProducts, statuses] = await Promise.all([
    summarizeOrders(start, end),
    summarizeOrders(previousStart, previousEnd),
    getSalesSeries(range, start, end),
    getTopProducts(start, end, 8),
    getOrderStatuses(start, end),
  ]);
  return { range, current, previous, salesSeries, topProducts, statuses };
}

export type AdminOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  status: string;
  totalCents: number;
  createdAt: Date;
};

export async function getAdminOrderDetails(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      email: orders.email,
      status: orders.status,
      subtotalCents: orders.subtotalCents,
      shippingCents: orders.shippingCents,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
      itemId: orderItems.id,
      productId: orderItems.productId,
      productSlug: products.slug,
      productName: orderItems.productName,
      productNameAr: orderItems.productNameAr,
      unitPriceCents: orderItems.unitPriceCents,
      quantity: orderItems.quantity,
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orders.id, id))
    .orderBy(orderItems.id);

  const first = rows[0];
  if (!first) return null;
  return {
    id: first.id,
    orderNumber: first.orderNumber,
    customerName: first.customerName,
    email: first.email,
    status: first.status,
    subtotalCents: first.subtotalCents,
    shippingCents: first.shippingCents,
    totalCents: first.totalCents,
    createdAt: first.createdAt,
    items: rows.filter((row) => row.itemId !== null).map((row) => ({
      id: row.itemId!,
      productId: row.productId!,
      productSlug: row.productSlug,
      productName: row.productName!,
      productNameAr: row.productNameAr ?? "",
      unitPriceCents: row.unitPriceCents!,
      quantity: row.quantity!,
    })),
  };
}

export async function getAdminOrders(options: { query?: string; status?: string } = {}) {
  const filters: SQL[] = [];
  const query = options.query?.trim().slice(0, 96);
  if (query) {
    const pattern = `%${query}%`;
    filters.push(
      or(
        ilike(orders.orderNumber, pattern),
        ilike(orders.customerName, pattern),
        ilike(orders.email, pattern),
      )!,
    );
  }
  const status = options.status?.trim();
  if (status && ["confirmed", "fulfilled", "cancelled"].includes(status)) {
    filters.push(eq(orders.status, status));
  }
  const selection = db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      email: orders.email,
      status: orders.status,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(100);
  const rows = filters.length ? await selection.where(and(...filters)) : await selection;
  return rows as AdminOrder[];
}

export async function getAdminProducts(options: { query?: string; stock?: string } = {}) {
  const filters: SQL[] = [];
  const query = options.query?.trim().slice(0, 96);
  if (query) {
    const pattern = `%${query}%`;
    filters.push(
      or(
        ilike(products.name, pattern),
        ilike(products.nameAr, pattern),
        ilike(products.slug, pattern),
        ilike(categories.name, pattern),
        ilike(categories.nameAr, pattern),
      )!,
    );
  }
  if (options.stock === "low") {
    filters.push(and(gte(products.stock, 1), lt(products.stock, 11))!);
  } else if (options.stock === "out") {
    filters.push(sql`${products.stock} <= 0`);
  }

  const selection = db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      nameAr: products.nameAr,
      icon: products.icon,
      priceCents: products.priceCents,
      stock: products.stock,
      rating: products.rating,
      featured: products.featured,
      category: categories.name,
      categoryAr: categories.nameAr,
      categorySlug: categories.slug,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .orderBy(desc(products.featured), products.name)
    .limit(100);
  return filters.length ? selection.where(and(...filters)) : selection;
}

export async function getAdminCustomers(queryValue?: string) {
  const query = queryValue?.trim().slice(0, 96);
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      createdAt: users.createdAt,
      orderCount: sql<number>`count(${orders.id}) filter (where ${orders.status} <> 'cancelled')`,
      salesCents: sql<number>`coalesce(sum(case when ${orders.status} <> 'cancelled' then ${orders.totalCents} else 0 end), 0)`,
      lastOrderAt: sql<Date | null>`max(${orders.createdAt})`,
    })
    .from(users)
    .leftJoin(orders, eq(users.email, orders.email))
    .where(
      query
        ? or(ilike(users.displayName, `%${query}%`), ilike(users.email, `%${query}%`))
        : undefined,
    )
    .groupBy(users.id)
    .orderBy(desc(users.createdAt))
    .limit(100);

  return rows.map((row) => {
    const rawLastOrderAt = row.lastOrderAt as Date | string | null;
    const parsedLastOrderAt = rawLastOrderAt === null
      ? null
      : rawLastOrderAt instanceof Date
        ? rawLastOrderAt
        : new Date(rawLastOrderAt);
    return {
      ...row,
      orderCount: toNumber(row.orderCount),
      salesCents: toNumber(row.salesCents),
      lastOrderAt: parsedLastOrderAt && Number.isFinite(parsedLastOrderAt.getTime()) ? parsedLastOrderAt : null,
    };
  });
}

export async function getLowStockProducts(limit = 10) {
  return db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      nameAr: products.nameAr,
      icon: products.icon,
      stock: products.stock,
      priceCents: products.priceCents,
    })
    .from(products)
    .where(sql`${products.stock} <= 10`)
    .orderBy(products.stock, products.name)
    .limit(limit);
}

export async function getProductCatalogTotals() {
  const [row] = await db
    .select({
      total: count(products.id),
      stockUnits: sql<number>`coalesce(sum(${products.stock}), 0)`,
      lowStock: sql<number>`count(*) filter (where ${products.stock} > 0 and ${products.stock} <= 10)`,
      outOfStock: sql<number>`count(*) filter (where ${products.stock} <= 0)`,
    })
    .from(products);
  return {
    total: toNumber(row?.total),
    stockUnits: toNumber(row?.stockUnits),
    lowStock: toNumber(row?.lowStock),
    outOfStock: toNumber(row?.outOfStock),
  };
}

export async function getCustomerTotal() {
  const [row] = await db.select({ total: count(users.id) }).from(users);
  return toNumber(row?.total);
}

export async function getRecentOrderActivity(limit = 8) {
  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.customerName,
      email: orders.email,
      status: orders.status,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(limit) as Promise<AdminOrder[]>;
}
