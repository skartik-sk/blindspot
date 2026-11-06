// App state, kept on this device only (localStorage). Nothing here is ever sent anywhere.
import { useSyncExternalStore } from "react";
import type { Address, Hex } from "viem";

export type WalletKind = "device" | "mine" | "watch";
export interface Wallet {
  address: Address;
  label: string;
  kind: WalletKind;
}

export type BalSource = "pir" | "mixnet" | "verified";
export interface Bal {
  eth?: bigint;
  usdc?: bigint;
  weth?: bigint;
  block?: string;
  source: BalSource;
}

export interface Alert {
  id: string;
  block: string;
  t: number;
  address: Address;
  kind: "swap" | "in" | "out";
  title: string;
  detail: string;
  anchored: boolean;
  /** Tx position in the block, for copy-trade context. */
  tx?: number;
  /** Swap legs, when the watched wallet's own transfers show them. */
  sold?: { token: Address; value: bigint };
  bought?: { token: Address; value: bigint };
  read?: boolean;
  /** Seen in the mempool only: unverified until a block confirms it (then replaced by the verified alert). */
  pending?: boolean;
  hash?: `0x${string}`;
}

export interface TapeBlock {
  number: string;
  txs: number;
  accounts: number;
  swaps: number;
  bytes: number;
  ms: number;
  anchored: boolean;
  hits: number;
  /** When this device verified the block (ms since epoch). */
  at?: number;
}

export interface Trader {
  address: Address;
  block: string;
  pool: Address;
  dex: string;
}

export interface Status {
  phase: "idle" | "connecting" | "live" | "error" | "paused";
  message?: string;
  head?: string;
}

export interface State {
  wallets: Wallet[];
  balances: Record<string, Bal>;
  alerts: Alert[];
  /** Pending, unverified alerts from the shared mempool feed. Never persisted. */
  pendingAlerts: Alert[];
  tape: TapeBlock[];
  traders: Trader[];
  status: Status;
  pendingTx?: { route?: "private" | "public"; hash: Hex; to: Address; label: string; sentAt: number; landed?: string };
}

const KEY = "bp.state.v1";
const big = (_k: string, v: unknown) => (typeof v === "bigint" ? { $b: v.toString() } : v);
const unbig = (_k: string, v: any) => (v && typeof v === "object" && "$b" in v ? BigInt(v.$b) : v);

function load(): State {
  const empty: State = { wallets: [], balances: {}, alerts: [], pendingAlerts: [], tape: [], traders: [], status: { phase: "idle" } };
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return empty;
    const p = JSON.parse(s, unbig) as Partial<State>;
    return { ...empty, wallets: p.wallets ?? [], balances: p.balances ?? {}, alerts: p.alerts ?? [], pendingTx: p.pendingTx };
  } catch {
    return empty;
  }
}

let state = load();
const subs = new Set<() => void>();

export function setState(f: (s: State) => Partial<State>) {
  state = { ...state, ...f(state) };
  try {
    const { wallets, balances, alerts, pendingTx } = state;
    localStorage.setItem(KEY, JSON.stringify({ wallets, balances, alerts: alerts.slice(0, 100), pendingTx }, big));
  } catch {}
  subs.forEach((fn) => fn());
}

export const getState = () => state;
const subscribe = (f: () => void) => (subs.add(f), () => subs.delete(f));
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

const lc = (a: string) => a.toLowerCase() as Address;

export function addWallet(w: Wallet) {
  setState((s) => ({
    wallets: [...s.wallets.filter((x) => lc(x.address) !== lc(w.address)), { ...w, address: lc(w.address) }],
  }));
}
export function removeWallet(a: Address) {
  setState((s) => ({ wallets: s.wallets.filter((x) => lc(x.address) !== lc(a)) }));
}
export function setBalance(a: Address, b: Partial<Bal> & { source: BalSource }) {
  setState((s) => ({ balances: { ...s.balances, [lc(a)]: { ...s.balances[lc(a)], ...b } } }));
}
export const labelOf = (a: string) => state.wallets.find((w) => w.address === lc(a))?.label;
