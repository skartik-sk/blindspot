// On-device state: the merchant's seed and sales log. Nothing here ever leaves the phone.
// Trade-off (README): localStorage is readable by any script on this origin, so the app ships no
// third-party scripts. A production build would wrap the seed with WebAuthn/passkey encryption.
import type { Address, Hex } from "viem";
import { newMnemonic } from "@bina/sdk";

const SEED = "bina.seed";
const SALES = "bina.sales";
const COUNTER = "bina.nextIndex";

export interface Sale {
  index: number;
  address: Address;
  amount: string; // USDC base units (bigint as string)
  inr: number;
  isolationKey: string;
  fromBlock: string;
  createdAt: number;
  status: "watching" | "received" | "expired" | "error";
  receivedBlock?: string;
  blockHash?: Hex;
  balHash?: Hex;
  anchored?: boolean;
  error?: string;
}

export function seed(): string {
  let s = localStorage.getItem(SEED);
  if (!s) localStorage.setItem(SEED, (s = newMnemonic()));
  return s;
}

export const sales = (): Sale[] => JSON.parse(localStorage.getItem(SALES) ?? "[]");
export const saveSales = (s: Sale[]) => localStorage.setItem(SALES, JSON.stringify(s));
export function upsertSale(s: Sale) {
  const all = sales().filter((x) => x.index !== s.index);
  saveSales([s, ...all].sort((a, b) => b.index - a.index));
}
/**
 * Claim the next HD index, synchronously, before any await. The counter only ever goes up and is stored
 * apart from the sales log, so clearing sales can't make an address be reused: every sale address is born
 * fresh, with a zero balance, without us ever having to ask a provider about it.
 */
export function claimIndex(): number {
  const fromLog = sales().reduce((m, s) => Math.max(m, s.index + 1), 0);
  const i = Math.max(Number(localStorage.getItem(COUNTER) ?? 0), fromLog);
  localStorage.setItem(COUNTER, String(i + 1));
  return i;
}
