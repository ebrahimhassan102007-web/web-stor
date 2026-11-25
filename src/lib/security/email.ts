import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { Locale } from "@/lib/i18n/dictionary";

let transporter: Transporter | undefined;

export function isEmailDeliveryConfigured(): boolean {
  const port = Number(process.env.SMTP_PORT);
  return Boolean(process.env.SMTP_HOST?.trim() && Number.isInteger(port) && port > 0 && port <= 65_535 && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM?.trim());
}

function getTransporter(): Transporter {
  if (!isEmailDeliveryConfigured()) throw new Error("SMTP email delivery is not configured");
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  return transporter;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);
}

export async function sendVerificationEmail(input: { to: string; displayName: string; code: string; locale: Locale }): Promise<void> {
  const ar = input.locale === "ar";
  const greeting = ar ? `مرحباً ${escapeHtml(input.displayName)}،` : `Hello ${escapeHtml(input.displayName)},`;
  const plainGreeting = ar ? `مرحباً ${input.displayName}،` : `Hello ${input.displayName},`;
  const heading = ar ? "رمز التحقق من بريدك الإلكتروني" : "Verify your email";
  const intro = ar ? "استخدم الرمز التالي لإكمال إنشاء حسابك في E-Vora." : "Use this code to finish setting up your E-Vora account.";
  const expiry = ar ? "تنتهي صلاحية هذا الرمز خلال 10 دقائق. لا تشاركه مع أي شخص." : "This code expires in 10 minutes. Do not share it with anyone.";
  const ignore = ar ? "إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة." : "If you did not request this code, you can ignore this message.";
  const dir = ar ? "rtl" : "ltr";
  const subject = ar ? "رمز التحقق — E-Vora" : "Your E-Vora verification code";
  const html = `<!doctype html><html lang="${input.locale}" dir="${dir}"><body style="margin:0;background:#080808;color:#eeeeee;font-family:Arial,sans-serif;padding:32px 16px"><main style="max-width:520px;margin:0 auto;background:#141414;border:1px solid #262626;border-radius:16px;padding:32px"><p style="margin:0 0 24px;color:#ef4444;font-size:22px;font-weight:800">E-Vora</p><h1 style="font-size:22px;margin:0 0 18px">${heading}</h1><p style="color:#c4c4c4;line-height:1.7">${greeting}<br>${intro}</p><p dir="ltr" style="letter-spacing:0.45em;text-align:center;font-family:monospace;font-size:32px;font-weight:800;padding:18px 12px;background:#090909;border:1px solid #2a2a2a;border-radius:12px;color:#ffffff">${input.code}</p><p style="color:#c4c4c4;line-height:1.7">${expiry}</p><p style="color:#858585;font-size:13px;line-height:1.7">${ignore}</p><hr style="border:0;border-top:1px solid #292929;margin:26px 0 16px"><p style="color:#777;font-size:12px;margin:0">E-Vora</p></main></body></html>`;
  const text = ["E-Vora", heading, plainGreeting, intro, `\n${input.code}\n`, expiry, ignore].join("\n\n");
  await getTransporter().sendMail({ from: process.env.SMTP_FROM, to: input.to, subject, text, html });
}

export async function sendPasswordResetEmail(input: { to: string; displayName: string; token: string; locale: Locale }): Promise<void> {
  const origin = process.env.APP_ORIGIN?.trim();
  if (!origin) throw new Error("APP_ORIGIN required for password recovery links");
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.pathname !== "/" || parsed.search || parsed.hash || (process.env.NODE_ENV === "production" && parsed.protocol !== "https:")) throw new Error("Invalid APP_ORIGIN");
  const ar = input.locale === "ar";
  const name = escapeHtml(input.displayName);
  const link = `${parsed.origin}/reset-password#token=${encodeURIComponent(input.token)}`;
  const subject = ar ? "إعادة تعيين كلمة مرور E-Vora" : "Reset your E-Vora password";
  const greeting = ar ? `مرحباً ${name}،` : `Hello ${name},`;
  const message = ar ? "اضغط الرابط لإعادة تعيين كلمة المرور. تنتهي صلاحيته خلال 30 دقيقة ويُستخدم مرة واحدة." : "Use the link below to reset your password. It expires in 30 minutes and works once.";
  const ignore = ar ? "إذا لم تطلب ذلك، تجاهل الرسالة." : "If you did not request this, ignore this email.";
  const html = `<!doctype html><html lang="${input.locale}" dir="${ar ? "rtl" : "ltr"}"><body style="margin:0;background:#080808;color:#eee;font:16px Arial;padding:32px"><main style="max-width:520px;margin:auto;background:#141414;border:1px solid #333;border-radius:16px;padding:32px"><h1>E-Vora</h1><p>${greeting}</p><p>${message}</p><p><a href="${link}" style="display:inline-block;background:#ef4444;color:white;padding:12px 20px;border-radius:8px">${ar ? "إعادة تعيين كلمة المرور" : "Reset password"}</a></p><p style="color:#aaa">${ignore}</p></main></body></html>`;
  await getTransporter().sendMail({ from: process.env.SMTP_FROM, to: input.to, subject, text: `${greeting}\n\n${message}\n${link}\n\n${ignore}`, html });
}
