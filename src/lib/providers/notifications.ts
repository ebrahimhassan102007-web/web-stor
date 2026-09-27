import "server-only";
import { logEvent } from "@/lib/log";

/**
 * Notification provider abstraction (order/payment/fulfillment events).
 *
 * No email credentials are configured in this environment, so the default
 * provider only RECORDS that a notification is due — it never claims an
 * email was sent. Production: implement an SMTP/SES/Resend provider and set
 * EMAIL_PROVIDER + credentials.
 */
export type NotificationEvent =
  | { type: "order_confirmed"; email: string; orderNumber: string }
  | { type: "order_fulfilled"; email: string; orderNumber: string }
  | { type: "fulfillment_failed"; email: string; orderNumber: string }
  | { type: "password_reset"; email: string };

export interface NotificationProvider {
  readonly name: string;
  notify(event: NotificationEvent): Promise<void>;
}

class LogOnlyNotificationProvider implements NotificationProvider {
  readonly name = "log-only";
  async notify(event: NotificationEvent): Promise<void> {
    // Records the pending notification; does NOT pretend delivery happened.
    logEvent("info", "notification.queued", {
      type: event.type,
      // minimal PII: domain only
      emailDomain: event.email.split("@")[1] ?? "",
    });
  }
}

export function getNotificationProvider(): NotificationProvider {
  const configured = process.env.EMAIL_PROVIDER ?? "log-only";
  if (configured === "log-only") return new LogOnlyNotificationProvider();
  throw new Error(`Unknown email provider: ${configured}`);
}
