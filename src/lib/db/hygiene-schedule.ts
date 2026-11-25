import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { HYGIENE_POLICY, runEphemeralHygiene, type HygieneReport } from "@/lib/db/hygiene";

/**
 * Opportunistic, throttled scheduling for ephemeral-state hygiene (S-25).
 *
 * Runs at most once per `HYGIENE_POLICY.minIntervalMs` per process, never
 * concurrently, always **after** the response is sent (`after()`), and never
 * throws. `EPHEMERAL_HYGIENE=off` disables it entirely.
 */

const globalForHygiene = globalThis as unknown as {
  __evoraHygieneAt?: number;
  __evoraHygieneRunning?: boolean;
};

export async function maybeRunEphemeralHygiene(
  now: Date = new Date(),
): Promise<HygieneReport | null> {
  if (process.env.EPHEMERAL_HYGIENE === "off") return null;

  const nowMs = now.getTime();
  const last = globalForHygiene.__evoraHygieneAt ?? 0;
  if (globalForHygiene.__evoraHygieneRunning) return null;
  if (nowMs - last < HYGIENE_POLICY.minIntervalMs) return null;

  globalForHygiene.__evoraHygieneAt = nowMs;
  globalForHygiene.__evoraHygieneRunning = true;
  try {
    return await runEphemeralHygiene({ database: db, now });
  } catch {
    return null;
  } finally {
    globalForHygiene.__evoraHygieneRunning = false;
  }
}

/** Schedule a throttled pass after the current response has been sent. */
export function scheduleEphemeralHygiene(): void {
  try {
    after(() => {
      void maybeRunEphemeralHygiene();
    });
  } catch {
    // Not inside a request: nothing to schedule.
  }
}
