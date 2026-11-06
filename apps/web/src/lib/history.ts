// Private history for one address, after a PIR lookup told this device which blocks it was active in.
// The relay builds that index, so it knows every address's active blocks: fetching only "real blocks + random decoys"
// would let it find the one address whose history fits. Instead we fetch the union of this address's history and the
// full histories of other directory addresses from the same PIR reply (k-anonymity): every one of them fits the
// request pattern equally. Each block goes on its own mixnet route, in random order, and is verified before use.
// Disclosed limits: anonymity is k (default 8, capped at 48 blocks), not the whole directory; the relay sees the burst.
import { SEPOLIA_TOKENS, confirmWithAnchor, newIsolationKey, scanBlock, ETH_LOGGER, type VerifiedBlock, verifiedBlock } from "@blindspot/sdk";
import type { Address } from "viem";
import { anonRpc } from "./anon";
import { config } from "./config";
import { describe } from "./engine";
import { fmtToken, short } from "./format";
import { crowdFor, cryptoRand, type Cover } from "./crowd";
import type { Alert } from "./store";

export { ANONYMITY, MAX_BLOCKS, crowdFor, type Cover } from "./crowd";

export interface HistoryResult {
  rows: Alert[];
  /** Blocks fetched in all (union of the crowd's histories). */
  blocks: number;
  /** How many addresses the fetched set matches equally (this one included). */
  crowd: number;
  /** Bytes of verified block data downloaded (header + access list + receipts). */
  bytes: number;
  /** Blocks that couldn't be fetched or verified (never shown as data). */
  failed: number;
  /** Index entries the verified blocks contradict (an address listed as active in a block where it did nothing). */
  mismatches: number;
  ms: number;
}

const symbol = (t: Address) => (t === ETH_LOGGER ? "ETH" : SEPOLIA_TOKENS.find((x) => x.token === t)?.symbol ?? short(t));

const shuffle = <T,>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = cryptoRand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

async function fetchVerified(n: number): Promise<VerifiedBlock | null> {
  const b = await verifiedBlock(anonRpc(config.feedUrl, newIsolationKey()), BigInt(n), config.feedCompact);
  if (!b) return null;
  await confirmWithAnchor(anonRpc(config.anchorUrl, newIsolationKey()), b.number, b.hash);
  return { ...b, anchored: true };
}

/** Everything the address did in those blocks: swaps with both legs, transfers in and out. */
function rowsFor(address: Address, b: VerifiedBlock): Alert[] {
  const rows: Alert[] = [];
  for (const a of scanBlock(b.bal, b.feed, [address], SEPOLIA_TOKENS)) {
    const described = describe(a, b);
    rows.push(...described);
    const covered = new Set(described.map((d) => d.tx));
    for (const tx of a.sent) {
      if (covered.has(tx)) continue;
      const out = a.items.find((i) => i.tx === tx && i.kind === "transfer" && i.from === a.address);
      rows.push({
        id: `${b.number}-${tx}-out-${a.address}`, block: b.number.toString(), t: Number(b.header.timestamp) * 1000, address: a.address,
        anchored: true, kind: "out", tx, title: "Sent",
        detail: out && out.kind === "transfer" ? `${fmtToken(out.value, out.token)} ${symbol(out.token)} to ${short(out.to)}` : "A transaction (no token transfer)",
      });
    }
  }
  return rows;
}

/** Did this address really do something in this verified block (send, or change its ETH/USDC/WETH balance)? */
const activeIn = (address: Address, b: VerifiedBlock) => scanBlock(b.bal, b.feed, [address], SEPOLIA_TOKENS).length > 0;

export async function privateHistory(address: Address, real: number[], cover: Cover[], onProgress?: (done: number, total: number) => void): Promise<HistoryResult> {
  const t0 = performance.now();
  const { crowd, blocks, picked } = crowdFor(real, cover);
  const order = shuffle(blocks);
  const got = new Map<number, VerifiedBlock>();
  let done = 0;
  let failed = 0;
  const queue = [...order];
  const worker = async () => {
    for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
      try {
        const b = await fetchVerified(n);
        if (b) got.set(n, b);
        else failed++;
      } catch {
        failed++; // a block that fails verification is dropped, never shown
      }
      onProgress?.(++done, order.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const me = address.toLowerCase() as Address;
  const rows = real.flatMap((n) => (got.has(n) ? rowsFor(me, got.get(n)!) : []));
  // Hold the relay to its index: every listed (address, block) pair must show activity in the verified block.
  // A lie (e.g. planted cover entries to probe users) shows up here instead of passing silently.
  const claims = [...real.map((n) => [me, n] as const), ...picked.flatMap((c) => c.history.map((n) => [c.address, n] as const))];
  const mismatches = claims.filter(([a, n]) => got.has(n) && !activeIn(a, got.get(n)!)).length;
  const bytes = [...got.values()].reduce((a, b) => a + b.bytes, 0);
  return { rows: rows.sort((x, y) => Number(y.block) - Number(x.block)), blocks: order.length, crowd, failed, mismatches, bytes, ms: Math.round(performance.now() - t0) };
}
