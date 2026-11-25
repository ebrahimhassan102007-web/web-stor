/**
 * Dispute vocabulary shared by the buyer UI and the server.
 *
 * Deliberately dependency-free (no database, no crypto, no zod) so a client
 * component can import the reason list and bilingual copy without dragging the
 * persistence layer into the browser bundle.
 */
export const DISPUTE_REASONS = ["not_received", "invalid_code", "already_used", "wrong_item", "other"] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];
export const DISPUTE_STATUSES = ["open", "refunded", "rejected"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_REASON_COPY: Readonly<Record<DisputeReason, { en: string; ar: string }>> = {
  not_received: { en: "I did not receive my code", ar: "لم أستلم الكود" },
  invalid_code: { en: "The code does not work", ar: "الكود لا يعمل" },
  already_used: { en: "The code was already used", ar: "الكود مستخدم من قبل" },
  wrong_item: { en: "I received the wrong item", ar: "استلمت منتجاً مختلفاً" },
  other: { en: "Another problem", ar: "مشكلة أخرى" },
};

export const DISPUTE_STATUS_COPY: Readonly<Record<DisputeStatus, { en: string; ar: string }>> = {
  open: { en: "Under review", ar: "قيد المراجعة" },
  refunded: { en: "Refunded to wallet", ar: "تم الاسترداد للمحفظة" },
  rejected: { en: "Rejected", ar: "مرفوض" },
};
