/** Legacy header chip remains explicit preview-only; the account wallet uses ledger queries. */
export const DEMO_WALLET_BALANCE = { usdCents: 0, egpCents: 0, isDemo: true } as const;
export function formatDemoUsd(): string { return `$${(DEMO_WALLET_BALANCE.usdCents / 100).toFixed(2)}`; }
export function formatDemoEgp(): string { return `EGP ${Math.round(DEMO_WALLET_BALANCE.egpCents / 100)}`; }
export const WALLET_PATH = "/account/wallet";
export const WALLET_LOGIN_PATH = `/login?next=${encodeURIComponent(WALLET_PATH)}`;
export { calculatePromoDiscount, normalizePromoCode } from "@/lib/wallet-math";
