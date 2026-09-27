import type { NextRequest } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db, auditLog, users } from "@/lib/db";
import { guardAdmin } from "@/lib/security/admin-guard";
import { adminListQuerySchema } from "@/lib/validation";
import { jsonOk, handleUnexpected } from "@/lib/http";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** GET /api/admin/audit?page=n — the admin action audit trail. */
export async function GET(req: NextRequest) {
  try {
    const guard = await guardAdmin(req);
    if ("response" in guard) return guard.response;

    const parsed = adminListQuerySchema.safeParse({
      page: req.nextUrl.searchParams.get("page") ?? undefined,
    });
    const page = parsed.success ? parsed.data.page : 1;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          targetType: auditLog.targetType,
          targetId: auditLog.targetId,
          meta: auditLog.meta,
          adminEmail: users.email,
          createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.adminId, users.id))
        .orderBy(desc(auditLog.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      db.select({ total: sql<number>`count(*)::int` }).from(auditLog),
    ]);

    return jsonOk({
      entries: rows,
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    return handleUnexpected("admin:audit", err);
  }
}
