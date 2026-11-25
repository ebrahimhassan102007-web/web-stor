import { z } from "zod";
import { normalizeSecurityInput, normalizeVerificationDigits } from "@/lib/security/digits";
import { isAcceptablePassword } from "@/lib/security/password-policy";

const cleanText = (min: number, max: number) =>
  z.string().transform(normalizeSecurityInput).pipe(
    z.string()
      .min(min)
      .max(max)
      .regex(/^[^\u0000-\u001f\u007f]*$/, "Invalid characters"),
  );

export const authEmailSchema = z.string().transform(normalizeSecurityInput).pipe(
  z.string().toLowerCase().email().max(254),
);

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine(isAcceptablePassword, "Password is too common");

export const passwordResetRequestSchema = z.object({ email: authEmailSchema, locale: z.enum(["en", "ar"]).optional().default("en") });
export const passwordResetSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: passwordSchema });
export const passwordChangeSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });

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
  returnTo: z.string().max(512).optional(),
});

export const emailVerificationSchema = z.object({
  email: authEmailSchema,
  code: z
    .string()
    .transform(normalizeSecurityInput)
    .transform(normalizeVerificationDigits)
    .pipe(z.string().regex(/^\d{6}$/)),
  returnTo: z.string().max(512).optional(),
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
