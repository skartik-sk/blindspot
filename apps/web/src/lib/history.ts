// Private history for one address, after a PIR lookup told this device which blocks it was active in.
// The relay builds that index, so it knows every address's active blocks: fetching only "real blocks + random decoys"
// would let it find the one address whose history fits. Instead we fetch the union of this address's history and the
// full histories of other directory addresses from the same PIR reply (k-anonymity): every one of them fits the
// request pattern equally. Each block goes on its own mixnet route, in random order, and is verified before use.
// Disclosed limits: anonymity is k (default 4), not the whole directory; timing of the burst is visible to the relay.
import { RpcClient, SEPOLIA_TOKENS, confirmWithAnchor, newIsolationKey, scanBlock, ETH_LOGGER, type VerifiedBlock, verifiedBlock } from "@bina/sdk";
import type { Address } from "viem";
import { anonFetch } from "./anon";
import { config } from "./config";
import { describe } from "./engine";
import { fmtToken, short } from "./format";
import type { Alert } from "./store";

/** Target crowd size: this address plus 3 others whose histories are fetched too. */
export const ANONYMITY = 4;

export interface HistoryResult {
  rows: Alert[];
  /** Blocks fetched in all (union of the crowd's histories). */
  blocks: number;
  /** How many addresses the fetched set matches equally (this one included). */
  crowd: number;
  /** Blocks that couldn't be fetched or verified (never shown as data). */
  failed: number;
  ms: number;
}

const symbol = (t: Address) => (t === ETH_LOGGER ? "ETH" : SEPOLIA_TOKENS.find((x) => x.token === t)?.symbol ?? short(t));

/** Uniform random integer in [0, n) from the platform CSPRNG. */
const rand = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const shuffle = <T,>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

async function fetchVerified(n: number): Promise<VerifiedBlock | null> {
  const b = await verifiedBlock(new RpcClient(config.feedUrl, anonFetch, newIsolationKey()), BigInt(n), config.feedCompact);
  if (!b) return null;
  await confirmWithAnchor(new RpcClient(config.anchorUrl, anonFetch, newIsolationKey()), b.number, b.hash);
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

/** Pick the crowd: up to ANONYMITY-1 other non-empty histories, chosen at random. */
export function crowdFor(real: number[], cover: number[][]) {
  const pool = [...cover];
  const picked: number[][] = [];
  while (picked.length < ANONYMITY - 1 && pool.length) picked.push(pool.splice(rand(pool.length), 1)[0]);
  return { picked, crowd: 1 + picked.length, blocks: [...new Set([...real, ...picked.flat()])] };
}

export async function privateHistory(address: Address, real: number[], cover: number[][], onProgress?: (done: number, total: number) => void): Promise<HistoryResult> {
  const t0 = performance.now();
  const { crowd, blocks } = crowdFor(real, cover);
  const order = shuffle(blocks);
  const want = new Set(real);
  const got = new Map<number, VerifiedBlock>();
  let done = 0;
  let failed = 0;
  const queue = [...order];
  const worker = async () => {
    for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
      try {
        const b = await fetchVerified(n);
        if (b && want.has(n)) got.set(n, b);
        else if (!b && want.has(n)) failed++;
      } catch {
        if (want.has(n)) failed++; // a block that fails verification is dropped, never shown
      }
      onProgress?.(++done, order.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const rows = real.flatMap((n) => (got.has(n) ? rowsFor(address.toLowerCase() as Address, got.get(n)!) : []));
  return { rows: rows.sort((x, y) => Number(y.block) - Number(x.block)), blocks: order.length, crowd, failed, ms: Math.round(performance.now() - t0) };
}
