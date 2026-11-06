// Balance table for PIR lookups. Addresses come from what the chain itself shows (accounts active in recent
// verified BALs) plus operator seeds, never from user requests: asking to be added would leak the address.
// Balances start from one batched read, then follow verified BAL changes.
// Each record also carries the account's recent active blocks (sent a tx, ETH balance changed, or USDC/WETH balance
// changed), so a client can fetch its history by block number after a private lookup.
import {
  HISTORY_SLOTS, SEPOLIA_USDC, SEPOLIA_WETH, balanceSlot, packRecord, pirAnswer, pirLayout,
  type Balances, type BalJson, type PirQuery, type PirTable,
} from "@bina/sdk";
import type { Address, Hex } from "viem";

export type BalanceReader = (addrs: Address[]) => Promise<Map<Address, Balances>>;

interface Snapshot {
  table: PirTable;
  records: bigint[];
}

export class PirStore {
  private known = new Map<Address, Balances & { seen: number; hist: number[] }>();
  private pending = new Set<Address>();
  /** Block where a pending account was first seen active (becomes its first history entry). */
  private firstActive = new Map<Address, number>();
  /** USDC/WETH balance slot key -> holder, for the known accounts: a receive shows up only in the token's storage. */
  private slotOwner = new Map<string, Address>();
  private snaps: Snapshot[] = [];
  private epoch = 0;
  private read: BalanceReader;
  private max: number;
  private newPerBlock: number;
  private seeds: Set<Address>;

  constructor(read: BalanceReader, opts: { max?: number; newPerBlock?: number; seeds?: Address[] } = {}) {
    this.read = read;
    this.max = opts.max ?? 1024;
    // Slow admission keeps a wallet listed for ~max/newPerBlock blocks after it goes quiet (1024/8 ≈ 25 min),
    // so its private history is still there when someone looks it up.
    this.newPerBlock = opts.newPerBlock ?? 8;
    this.seeds = new Set((opts.seeds ?? []).map((a) => a.toLowerCase() as Address));
    this.seeds.forEach((a) => this.pending.add(a));
  }

  /** Feed one verified block: update known balances, queue newly active accounts, refresh the snapshot. */
  async onBlock(n: bigint, bal: BalJson) {
    const num = Number(n);
    const usdc = bal.find((a) => a.address.toLowerCase() === SEPOLIA_USDC.token);
    const weth = bal.find((a) => a.address.toLowerCase() === SEPOLIA_WETH.token);
    const last = (changes: { value: string }[]) => BigInt(changes[changes.length - 1].value);
    const active = new Set<Address>();
    for (const [tok, acc] of [["usdc", usdc], ["weth", weth]] as const) {
      for (const sc of acc?.storageChanges ?? []) {
        const holder = this.slotOwner.get(`${tok}:${BigInt(sc.key)}`);
        const k = holder && this.known.get(holder);
        if (!k || !sc.changes.length) continue;
        if (tok === "usdc") k.usdc = last(sc.changes) & SEPOLIA_USDC.mask!;
        else k.weth = last(sc.changes);
        active.add(holder);
      }
    }
    for (const a of bal) {
      const addr = a.address.toLowerCase() as Address;
      const k = this.known.get(addr);
      if (k) {
        const e = a.balanceChanges.at(-1);
        if (e) k.eth = BigInt(e.value);
        if (e || a.nonceChanges.length) active.add(addr);
      } else if (a.nonceChanges.length) {
        this.pending.add(addr); // an account that sent a tx: a real wallet, worth indexing
        if (!this.firstActive.has(addr)) this.firstActive.set(addr, num);
      }
    }
    for (const addr of active) {
      const k = this.known.get(addr)!;
      k.seen = num;
      if (k.hist[0] !== num) k.hist = [num, ...k.hist].slice(0, HISTORY_SLOTS);
    }
    await this.ingest(num);
    this.snapshot(n);
  }

  private async ingest(n: number) {
    const batch = [...this.pending].slice(0, this.newPerBlock);
    if (!batch.length) return;
    batch.forEach((a) => this.pending.delete(a));
    const got = await this.read(batch);
    for (const [a0, b] of got) {
      const a = a0.toLowerCase() as Address;
      const first = this.firstActive.get(a);
      this.firstActive.delete(a);
      this.known.set(a, { ...b, seen: n, hist: first ? [first] : [] });
      this.slotOwner.set(`usdc:${balanceSlot(a, SEPOLIA_USDC.mappingSlot)}`, a);
      this.slotOwner.set(`weth:${balanceSlot(a, SEPOLIA_WETH.mappingSlot)}`, a);
    }
    for (const a of batch) if (!got.has(a)) this.pending.add(a); // retry failed reads next block
    // Evict least recently active non-seed accounts beyond the cap.
    if (this.known.size > this.max) {
      const victims = [...this.known.entries()].filter(([a]) => !this.seeds.has(a)).sort((x, y) => x[1].seen - y[1].seen);
      for (const [a] of victims.slice(0, this.known.size - this.max)) {
        this.known.delete(a);
        this.slotOwner.delete(`usdc:${balanceSlot(a, SEPOLIA_USDC.mappingSlot)}`);
        this.slotOwner.delete(`weth:${balanceSlot(a, SEPOLIA_WETH.mappingSlot)}`);
      }
    }
    if (this.pending.size > 4 * this.max) {
      this.pending = new Set([...this.pending].slice(-this.max));
      for (const a of this.firstActive.keys()) if (!this.pending.has(a)) this.firstActive.delete(a);
    }
  }

  private snapshot(n: bigint) {
    const addresses = [...this.known.keys()].sort();
    const { rows, cols } = pirLayout(addresses.length);
    const at = Number(n);
    const records = addresses.map((a) => { const k = this.known.get(a)!; return packRecord(k, k.hist, at); });
    this.snaps.push({ table: { epoch: ++this.epoch, block: `0x${n.toString(16)}`, rows, cols, addresses }, records });
    if (this.snaps.length > 5) this.snaps.shift(); // a client mid-lookup can still answer against a recent epoch
  }

  table(): PirTable | undefined {
    return this.snaps.at(-1)?.table;
  }

  answer(q: PirQuery): Hex[] {
    const s = this.snaps.find((x) => x.table.epoch === q.epoch);
    if (!s) throw new Error("stale epoch");
    return pirAnswer(s.records, s.table, q);
  }
}
