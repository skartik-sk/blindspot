// Turn a block's verified receipts into a compact event feed (ERC-20 transfers, Uniswap v2/v3/v4 swaps),
// then filter it locally for the wallets this device cares about. Nothing about those wallets leaves the device.
import { hexToBigInt, type Address, type Hex } from "viem";
import type { BalJson } from "./bal";
import { balanceSlot, type Erc20Slot } from "./extract";
import type { CompactReceipt } from "./receipts";

export const TOPIC = {
  transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  v2Swap: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822",
  v3Swap: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
  v4Swap: "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f",
} as const;

/** EIP-7708 (Amsterdam): plain ETH transfers emit Transfer logs from this address. Treat it as ETH. */
export const ETH_LOGGER = "0xfffffffffffffffffffffffffffffffffffffffe" as const;

export type FeedItem =
  | { kind: "transfer"; tx: number; token: Address; from: Address; to: Address; value: bigint }
  | {
      kind: "swap"; tx: number; dex: "v2" | "v3" | "v4";
      /** Pool contract (v2/v3) or PoolManager (v4). */
      pool: Address;
      /** v4 pool id; undefined for v2/v3. */
      poolId?: Hex;
      /** Signed from the pool's view: positive = token went into the pool. */
      amount0: bigint; amount1: bigint;
    };

const addr = (t: Hex) => `0x${t.slice(26)}`.toLowerCase() as Address;
const word = (data: Hex, i: number) => `0x${data.slice(2 + i * 64, 2 + (i + 1) * 64)}` as Hex;
const signed = (h: Hex) => hexToBigInt(h, { signed: true });
const unsigned = (h: Hex) => (h === "0x" ? 0n : hexToBigInt(h));

export function feedFromReceipts(rs: CompactReceipt[]): FeedItem[] {
  const out: FeedItem[] = [];
  rs.forEach((r, tx) => {
    if (!r.status) return;
    for (const [address, topics, data] of r.logs) {
      const t0 = topics[0]?.toLowerCase();
      if (t0 === TOPIC.transfer && topics.length === 3 && data.length === 66) {
        out.push({ kind: "transfer", tx, token: address, from: addr(topics[1]), to: addr(topics[2]), value: unsigned(data) });
      } else if (t0 === TOPIC.v3Swap && data.length >= 2 + 64 * 2) {
        out.push({ kind: "swap", tx, dex: "v3", pool: address, amount0: signed(word(data, 0)), amount1: signed(word(data, 1)) });
      } else if (t0 === TOPIC.v4Swap && topics.length >= 2 && data.length >= 2 + 64 * 2) {
        // v4 amounts are from the swapper's view; flip to the pool's view to match v2/v3.
        out.push({ kind: "swap", tx, dex: "v4", pool: address, poolId: topics[1],
          amount0: -signed(word(data, 0)), amount1: -signed(word(data, 1)) });
      } else if (t0 === TOPIC.v2Swap && data.length >= 2 + 64 * 4) {
        const [in0, in1, out0, out1] = [0, 1, 2, 3].map((i) => unsigned(word(data, i)));
        out.push({ kind: "swap", tx, dex: "v2", pool: address, amount0: in0 - out0, amount1: in1 - out1 });
      }
    }
  });
  return out;
}

export interface Activity {
  address: Address;
  /** Tx positions this wallet sent in the block (from verified BAL nonce changes). */
  sent: number[];
  /** Post-block ETH balance if it changed. */
  eth?: bigint;
  /** Post-block balance per known token, if it changed (from verified BAL storage). */
  tokens: Record<Address, bigint>;
  /** Feed items in txs this wallet sent, or transfers to/from it. */
  items: FeedItem[];
  /** True if it sent a tx that contained a swap: a copy-trade signal. */
  swapped: boolean;
}

const lastVal = <T extends { value: Hex }>(xs: T[]) => (xs.length ? BigInt(xs[xs.length - 1].value) : undefined);

/**
 * Everything this block did to the watched wallets. Uses only the verified BAL and verified feed:
 * - who sent a tx: nonce changes (index = tx position + 1)
 * - new balances: balance changes and known-token storage slots
 * - what the tx did: feed items at that tx position
 */
export function scanBlock(bal: BalJson, feed: FeedItem[], watched: Address[], tokens: Erc20Slot[] = []): Activity[] {
  const byAddr = new Map(bal.map((a) => [a.address.toLowerCase(), a]));
  const out: Activity[] = [];
  for (const w of new Set(watched.map((a) => a.toLowerCase() as Address))) {
    const a = byAddr.get(w);
    const sent = (a?.nonceChanges ?? []).map((c) => Number(c.index) - 1);
    const tok: Record<Address, bigint> = {};
    for (const t of tokens) {
      const ta = byAddr.get(t.token.toLowerCase());
      const slot = ta?.storageChanges.find((s) => BigInt(s.key) === balanceSlot(w, t.mappingSlot));
      const v = slot && lastVal(slot.changes);
      if (v !== undefined) tok[t.token.toLowerCase() as Address] = t.mask ? v & t.mask : v;
    }
    const txs = new Set(sent);
    const items = feed.filter((f) => txs.has(f.tx) || (f.kind === "transfer" && (f.from === w || f.to === w)));
    const eth = a ? lastVal(a.balanceChanges) : undefined;
    if (!sent.length && eth === undefined && !Object.keys(tok).length && !items.length) continue;
    out.push({ address: w, sent, eth, tokens: tok, items, swapped: items.some((f) => f.kind === "swap" && txs.has(f.tx)) });
  }
  return out;
}
