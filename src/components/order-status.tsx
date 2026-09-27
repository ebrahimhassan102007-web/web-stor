const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: "بانتظار الدفع", cls: "badge-neutral" },
  PAID: { label: "مدفوع", cls: "badge-green" },
  PROCESSING: { label: "قيد التنفيذ", cls: "badge-neutral" },
  FULFILLED: { label: "تم التسليم", cls: "badge-green" },
  FAILED: { label: "فشل التنفيذ", cls: "badge-red" },
  CANCELLED: { label: "ملغي", cls: "badge-red" },
  REFUNDED: { label: "مسترد", cls: "badge-neutral" },
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: "غير مدفوع",
  PAID: "مدفوع",
  FAILED: "فشل الدفع",
  REFUNDED: "مسترد",
};

export const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار التنفيذ",
  IN_PROGRESS: "قيد التنفيذ",
  DELIVERED: "تم التسليم",
  FAILED: "فشل التنفيذ",
};

export function OrderStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "badge-neutral" };
  return <span className={s.cls}>{s.label}</span>;
}

export function orderStatusLabel(status: string): string {
  return STATUS[status]?.label ?? status;
}
