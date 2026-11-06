// Relay: fetch each block's header, access list and receipts once from upstream, verify, cache, serve to everyone.
// Untrusted by design: clients re-verify every list against the header hash.
import {
  RpcClient, compactReceipts, verifyBal, verifyHeader, verifyReceipts,
  type BalJson, type CompactReceipt, type Header,
} from "@bina/sdk";

export interface CachedBlock {
  number: bigint;
  header: Header;
  bal: BalJson;
  /** Compact receipts (no blooms/hashes): the event feed, checked against header.receiptsRoot. */
  receipts: CompactReceipt[];
}

export class BlockCache {
  private blocks = new Map<bigint, CachedBlock>();
  head = 0n;
  private listeners = new Set<(b: CachedBlock) => void>();

  constructor(private upstream: RpcClient, private keep = 256) {}

  get(n: bigint) {
    return this.blocks.get(n);
  }

  onBlock(fn: (b: CachedBlock) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Fetch one block from upstream, verify it, cache it. */
  async load(n: bigint): Promise<CachedBlock | undefined> {
    const hit = this.blocks.get(n);
    if (hit) return hit;
    const [header, bal, raw] = await Promise.all([
      this.upstream.header(n), this.upstream.bal(n), this.upstream.receipts(n),
    ]);
    if (!header || !bal || !raw) return undefined;
    verifyHeader(header, n); // don't cache or relay garbage
    verifyBal(bal, header);
    const receipts = compactReceipts(raw);
    verifyReceipts(receipts, header);
    const b = { number: n, header, bal, receipts };
    this.blocks.set(n, b);
    if (n > this.head) this.head = n;
    for (const k of this.blocks.keys()) if (k < this.head - BigInt(this.keep)) this.blocks.delete(k);
    return b;
  }

  /** Pull any new blocks since our head. Every new block is pushed to all listeners identically. */
  async poll() {
    const tip = await this.upstream.blockNumber();
    const from = this.head === 0n ? tip : this.head + 1n;
    for (let n = from; n <= tip; n++) {
      const b = await this.load(n);
      if (b) for (const fn of this.listeners) fn(b);
    }
  }
}
