import type { ProductType } from "@/lib/db/schema";

/**
 * Per-product-type customer input requirements.
 *
 * Derived from the product type on the server — the client can neither add
 * nor remove required fields. Values are validated with strict formats both
 * at add-to-cart and again inside the checkout transaction.
 *
 * Data minimisation: we only ever ask for what fulfilment strictly needs.
 */
export type CustomerField = {
  key: string;
  labelAr: string;
  placeholder: string;
  /** Validation format id (see validateFieldValue). */
  format: "player_id" | "egypt_phone" | "email" | "text";
};

const PLAYER_ID: CustomerField = {
  key: "player_id",
  labelAr: "معرّف اللاعب (Player ID)",
  placeholder: "مثال: 5123456789",
  format: "player_id",
};

const EGYPT_PHONE: CustomerField = {
  key: "phone",
  labelAr: "رقم الهاتف",
  placeholder: "01xxxxxxxxx",
  format: "egypt_phone",
};

const ACCOUNT_EMAIL: CustomerField = {
  key: "account_email",
  labelAr: "البريد الإلكتروني للحساب",
  placeholder: "example@email.com",
  format: "email",
};

export function requiredFieldsFor(type: ProductType): CustomerField[] {
  switch (type) {
    case "GAME_TOPUP":
      return [PLAYER_ID];
    case "MOBILE_RECHARGE":
      return [EGYPT_PHONE];
    case "SUBSCRIPTION":
      return [ACCOUNT_EMAIL];
    case "DIGITAL_CODE":
    case "DIGITAL_SERVICE":
      return [];
  }
}

const FORMATS: Record<CustomerField["format"], RegExp> = {
  player_id: /^[0-9]{5,20}$/,
  // Egyptian mobile numbers: 010 / 011 / 012 / 015 + 8 digits.
  egypt_phone: /^01[0125][0-9]{8}$/,
  email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/,
  text: /^[^\u0000-\u001f\u007f]{1,128}$/,
};

export function validateFieldValue(
  format: CustomerField["format"],
  value: unknown,
): value is string {
  return typeof value === "string" && FORMATS[format].test(value.trim());
}

/**
 * Validates a client-supplied inputs object against a product type.
 * Returns the cleaned inputs (only known keys, trimmed) or null when invalid.
 */
export function validateCustomerInputs(
  type: ProductType,
  raw: unknown,
): Record<string, string> | null {
  const fields = requiredFieldsFor(type);
  if (fields.length === 0) return {};

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const cleaned: Record<string, string> = {};

  for (const field of fields) {
    const value = source[field.key];
    if (!validateFieldValue(field.format, value)) return null;
    cleaned[field.key] = (value as string).trim();
  }
  return cleaned;
}
