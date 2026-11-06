// Private history for one address, after a PIR lookup told this device which blocks it was active in.
// The relay only ever sees block numbers: each block is fetched on its own mixnet route, mixed with the same number
// of decoy blocks in random order, then verified (header, access list, receipts, second provider) and filtered here.
// Disclosed limit: a relay that correlates timing could still guess which blocks belong together; decoys blunt it.
import { RpcClient, SEPOLIA_TOKENS, confirmWithAnchor, newIsolationKey, scanBlock, ETH_LOGGER, type VerifiedBlock, verifiedBlock } from "@bina/sdk";
import type { Address } from "viem";
import { anonFetch } from "./anon";
import { config } from "./config";
import { describe } from "./engine";
import { fmtToken, short } from "./format";
import type { Alert } from "./store";

export interface HistoryResult {
  rows: Alert[];
  real: number;
  decoys: number;
  /** Blocks that couldn't be fetched or verified (never shown as data). */
  failed: number;
  ms: number;
}

const symbol = (t: Address) => (t === ETH_LOGGER ? "ETH" : SEPOLIA_TOKENS.find((x) => x.token === t)?.symbol ?? short(t));

function pickDecoys(real: number[], head: number, count: number) {
  const lo = Math.max(1, Math.min(...real, head) - 600);
  const span = head - lo;
  const out = new Set<number>();
  for (let guard = 0; out.size < count && guard < count * 50; guard++) {
    const n = lo + Math.floor(Math.random() * (span + 1));
    if (!real.includes(n)) out.add(n);
  }
  return [...out];
}

const shuffle = <T,>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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

export async function privateHistory(address: Address, real: number[], head: number, onProgress?: (done: number, total: number) => void): Promise<HistoryResult> {
  const t0 = performance.now();
  const decoys = pickDecoys(real, head, real.length);
  const order = shuffle([...real, ...decoys]);
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
  return { rows: rows.sort((x, y) => Number(y.block) - Number(x.block)), real: real.length, decoys: decoys.length, failed, ms: Math.round(performance.now() - t0) };
}
