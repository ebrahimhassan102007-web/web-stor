import { z } from "zod";
import { normalizeVerificationDigits } from "@/lib/security/digits";
import { isAcceptablePassword } from "@/lib/security/password-policy";

const cleanText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(/^[^\u0000-\u001f\u007f]*$/, "Invalid characters");

export const authEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine(isAcceptablePassword, "Password is too common");

export const emailRegisterSchema = z.object({
  displayName: cleanText(2, 128),
  email: authEmailSchema,
  password: passwordSchema,
  locale: z.enum(["en", "ar"]).optional().default("en"),
});

export const emailLoginSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1).max(128),
  locale: z.enum(["en", "ar"]).optional().default("en"),
});

export const emailVerificationSchema = z.object({
  email: authEmailSchema,
  code: z
    .string()
    .transform(normalizeVerificationDigits)
    .pipe(z.string().regex(/^\d{6}$/)),
});

export const emailResendSchema = z.object({
  email: authEmailSchema,
  locale: z.enum(["en", "ar"]).optional().default("en"),
});

export const profileUpdateSchema = z.object({
  displayName: cleanText(2, 128),
});

export type EmailRegisterInput = z.infer<typeof emailRegisterSchema>;
export type EmailLoginInput = z.infer<typeof emailLoginSchema>;
export type EmailVerificationInput = z.infer<typeof emailVerificationSchema>;
export type EmailResendInput = z.infer<typeof emailResendSchema>;
