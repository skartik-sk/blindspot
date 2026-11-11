// Follow the chain head forever, yielding fully verified blocks: header hash, BAL hash, receipts root,
// parent link. Every request names only a block number, never an address.
import type { Hex } from "viem";
import { verifyBal, type BalJson } from "./bal";
import { feedFromReceipts, type FeedItem } from "./feed";
import { HeaderInvalid, verifyHeader } from "./header";
import { verifyReceipts, type CompactReceipt } from "./receipts";
import { fetchBal, fetchReceipts, type Header, type RpcClient } from "./rpc";
import type { VerifiedHead } from "./lightclient";

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
  /**
   * A beacon light client (see lightclient.ts) instead of `anchor`: blocks are delivered at once with anchored=false,
   * and `onAnchored` fires when a head signed by the sync committee links back to them by parent hash. A block the
   * signed chain contradicts is reported through onError as HeaderInvalid.
   */
  lightClient?: { latest(): Promise<VerifiedHead> };
  onAnchored?: (n: bigint, hash: Hex) => void;
  /** The signed chain contradicts block n (hash as the relay served it): a fake or forked block. */
  onContradiction?: (n: bigint, hash: Hex) => void;
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

/**
 * Anchors recent blocks against light-client heads. Pure bookkeeping over (number, hash, parentHash), so it's
 * testable: `add` each verified block, then `anchor(head)`; it returns the newly anchored blocks, or throws if the
 * signed chain contradicts a block we delivered.
 */
/** The signed chain contradicts a block we delivered. */
export class Contradiction extends HeaderInvalid {
  n: bigint;
  hash: Hex;
  constructor(n: bigint, hash: Hex, msg: string) { super(msg); this.n = n; this.hash = hash; }
}

export class LightAnchor {
  private blocks = new Map<bigint, { hash: Hex; parent: Hex; anchored: boolean }>();
  private keep: number;
  constructor(keep = 256) { this.keep = keep; }
  add(n: bigint, hash: Hex, parent: Hex) {
    this.blocks.set(n, { hash: hash.toLowerCase() as Hex, parent: parent.toLowerCase() as Hex, anchored: false });
    for (const k of this.blocks.keys()) if (k < n - BigInt(this.keep)) this.blocks.delete(k);
  }
  /** Returns the newly anchored blocks (oldest first). */
  anchor(head: VerifiedHead): { n: bigint; hash: Hex }[] {
    const h = head.hash.toLowerCase();
    let at = head.number ?? [...this.blocks.entries()].find(([, b]) => b.hash === h)?.[0];
    if (at === undefined) return []; // the signed head isn't among our recent blocks yet
    const tip = this.blocks.get(at);
    if (!tip) return [];
    if (tip.hash !== h) throw new Contradiction(at, tip.hash, `light client disagrees on block ${at}: relay gave ${tip.hash}, sync committee signed ${h}`);
    const fresh: { n: bigint; hash: Hex }[] = [];
    for (let n = at, want = h; this.blocks.has(n); n--) {
      const b = this.blocks.get(n)!;
      if (b.hash !== want) throw new Contradiction(n, b.hash, `block ${n} is not an ancestor of the signed head`);
      if (!b.anchored) { b.anchored = true; fresh.push({ n, hash: b.hash }); }
      want = b.parent;
    }
    return fresh.reverse();
  }
  isAnchored(n: bigint) { return !!this.blocks.get(n)?.anchored; }
}

export async function follow(o: FollowOptions): Promise<void> {
  const { rpc, pollMs = 4000, signal } = o;
  let n = o.from ?? (await rpc.blockNumber());
  let prevHash: Hex | undefined;
  // Light-client anchoring runs beside the block loop, so blocks aren't held up waiting for a signed head.
  const la = o.lightClient ? new LightAnchor() : undefined;
  if (la && o.lightClient) {
    (async () => {
      while (!signal?.aborted) {
        try {
          for (const k of la.anchor(await o.lightClient!.latest())) o.onAnchored?.(k.n, k.hash);
        } catch (e) {
          if (e instanceof Contradiction) o.onContradiction?.(e.n, e.hash);
          o.onError?.(e, n);
        }
        await sleep(6000, signal);
      }
    })();
  }
  while (!signal?.aborted) {
    try {
      const b = await verifiedBlock(rpc, n, o.compact);
      if (!b) {
        await sleep(pollMs, signal);
        continue;
      }
      const linked = !!prevHash && b.header.parentHash.toLowerCase() === prevHash;
      if (la) {
        la.add(n, b.hash, b.header.parentHash); // anchored later, when a signed head links back to it
      } else if (o.anchor) {
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
