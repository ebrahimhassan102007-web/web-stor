/**
 * Single source of truth for the wallet balance shown in the UI.
 *
 * E-Vora has NO payment gateway and stores NO real funds. The balance is an
 * honest demo zero everywhere it appears (wallet page + header chip). When a
 * real wallet ledger exists, replace this constant with a server query — do
 * not invent balances in components.
 */
export const DEMO_WALLET_BALANCE = {
  /** Demo balance in US cents (integer cents — never floats for money). */
  usdCents: 0,
  /** Demo balance in Egyptian piasters. */
  egpCents: 0,
  /** True because no real funds exist; flips only with a real ledger. */
  isDemo: true,
} as const;

export function formatDemoUsd(): string {
  return `$${(DEMO_WALLET_BALANCE.usdCents / 100).toFixed(2)}`;
}

export function formatDemoEgp(): string {
  return `EGP ${Math.round(DEMO_WALLET_BALANCE.egpCents / 100)}`;
}

/** Deposit page route (wallet page titled "Wallet & deposits"). */
export const WALLET_PATH = "/account/wallet";
export const WALLET_LOGIN_PATH = `/login?next=${encodeURIComponent(WALLET_PATH)}`;
