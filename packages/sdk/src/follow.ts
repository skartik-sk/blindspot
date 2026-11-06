// Follow the chain head forever, yielding fully verified blocks: header hash, BAL hash, receipts root,
// parent link. Every request names only a block number, never an address.
import type { Hex } from "viem";
import { verifyBal, type BalJson } from "./bal";
import { feedFromReceipts, type FeedItem } from "./feed";
import { HeaderInvalid, verifyHeader } from "./header";
import { verifyReceipts, type CompactReceipt } from "./receipts";
import { fetchBal, fetchReceipts, type Header, type RpcClient } from "./rpc";

export interface VerifiedBlock {
  number: bigint;
  hash: Hex;
  header: Header;
  bal: BalJson;
  receipts: CompactReceipt[];
  feed: FeedItem[];
  /** Approximate bytes downloaded for this block (for the "cost of privacy" readout). */
  bytes: number;
  ms: number;
  /** An independent provider confirmed this block's hash (start of chain, after a break, or on request). */
  anchored: boolean;
}

export interface FollowOptions {
  rpc: RpcClient;
  /**
   * Independent provider. Every block is accepted only if it agrees on the hash. Linking alone isn't proof (a
   * lying relay can mint a self-consistent fake chain), and anchoring only "interesting" blocks would tell the
   * anchor which blocks matter to us, so it's all or nothing. A header is ~2 KB.
   * Without an anchor, blocks must link to the first one, which is trust-on-first-use (onError is told).
   */
  anchor?: RpcClient;
  /** Start here; default: current head. */
  from?: bigint;
  pollMs?: number;
  signal?: AbortSignal;
  /** Use the relay's compact receipts method instead of eth_getBlockReceipts. */
  compact?: boolean;
  onBlock: (b: VerifiedBlock) => void | Promise<void>;
  onError?: (e: unknown, n: bigint) => void;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), r()), { once: true });
  });

export async function verifiedBlock(rpc: RpcClient, n: bigint, compact = false): Promise<VerifiedBlock | null> {
  const t0 = performance.now();
  const header = await rpc.header(n);
  if (!header) return null;
  const hash = verifyHeader(header, n);
  const [bal, receipts] = await Promise.all([fetchBal(rpc, n), fetchReceipts(rpc, n, compact)]);
  if (!bal) throw new Error(`no access list for block ${n}`);
  verifyBal(bal, header);
  verifyReceipts(receipts, header);
  const bytes = JSON.stringify(header).length + JSON.stringify(bal).length + JSON.stringify(receipts).length;
  return { number: n, hash, header, bal, receipts, feed: feedFromReceipts(receipts), bytes, ms: performance.now() - t0, anchored: false };
}

/** Ask an independent provider for block n's hash; throw unless it matches. */
export async function confirmWithAnchor(anchor: RpcClient, n: bigint, hash: Hex) {
  const ref = await anchor.header(n);
  if (!ref || ref.hash.toLowerCase() !== hash.toLowerCase())
    throw new HeaderInvalid(`anchor disagrees on block ${n}: got ${hash}, anchor ${ref?.hash}`);
}

export async function follow(o: FollowOptions): Promise<void> {
  const { rpc, pollMs = 4000, signal } = o;
  let n = o.from ?? (await rpc.blockNumber());
  let prevHash: Hex | undefined;
  while (!signal?.aborted) {
    try {
      const b = await verifiedBlock(rpc, n, o.compact);
      if (!b) {
        await sleep(pollMs, signal);
        continue;
      }
      const linked = !!prevHash && b.header.parentHash.toLowerCase() === prevHash;
      if (o.anchor) {
        await confirmWithAnchor(o.anchor, n, b.hash); // reorgs pass here too: the anchor follows the new chain
        b.anchored = true;
      } else if (prevHash && !linked) {
        throw new HeaderInvalid(`block ${n} does not extend block ${n - 1n}`);
      } else if (!prevHash) {
        o.onError?.(new Error("no anchor: starting block is trust-on-first-use"), n);
      }
      prevHash = b.hash;
      await o.onBlock(b);
      n++;
    } catch (e) {
      o.onError?.(e, n);
      await sleep(pollMs, signal);
    }
  }
}
