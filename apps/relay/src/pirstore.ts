// Balance table for PIR lookups. Addresses come from what the chain itself shows (accounts active in recent
// verified BALs) plus operator seeds, never from user requests: asking to be added would leak the address.
// Balances start from one batched read, then follow verified BAL changes.
import {
  SEPOLIA_USDC, SEPOLIA_WETH, balanceSlot, packBalances, pirAnswer, pirLayout,
  type Balances, type BalJson, type PirQuery, type PirTable,
} from "@bina/sdk";
import type { Address, Hex } from "viem";

export type BalanceReader = (addrs: Address[]) => Promise<Map<Address, Balances>>;

interface Snapshot {
  table: PirTable;
  records: bigint[];
}

export class PirStore {
  private known = new Map<Address, Balances & { seen: number }>();
  private pending = new Set<Address>();
  private snaps: Snapshot[] = [];
  private epoch = 0;
  private read: BalanceReader;
  private max: number;
  private newPerBlock: number;
  private seeds: Set<Address>;

  constructor(read: BalanceReader, opts: { max?: number; newPerBlock?: number; seeds?: Address[] } = {}) {
    this.read = read;
    this.max = opts.max ?? 1024;
    this.newPerBlock = opts.newPerBlock ?? 60;
    this.seeds = new Set((opts.seeds ?? []).map((a) => a.toLowerCase() as Address));
    this.seeds.forEach((a) => this.pending.add(a));
  }

  /** Feed one verified block: update known balances, queue newly active accounts, refresh the snapshot. */
  async onBlock(n: bigint, bal: BalJson) {
    const usdc = bal.find((a) => a.address.toLowerCase() === SEPOLIA_USDC.token);
    const weth = bal.find((a) => a.address.toLowerCase() === SEPOLIA_WETH.token);
    const slotVal = (acc: typeof usdc, holder: Address, slot: bigint) => {
      const s = acc?.storageChanges.find((x) => BigInt(x.key) === balanceSlot(holder, slot));
      return s?.changes.length ? BigInt(s.changes[s.changes.length - 1].value) : undefined;
    };
    for (const a of bal) {
      const addr = a.address.toLowerCase() as Address;
      const k = this.known.get(addr);
      if (k) {
        const e = a.balanceChanges.at(-1);
        if (e) k.eth = BigInt(e.value);
        const u = slotVal(usdc, addr, SEPOLIA_USDC.mappingSlot);
        if (u !== undefined) k.usdc = u & SEPOLIA_USDC.mask!;
        const w = slotVal(weth, addr, SEPOLIA_WETH.mappingSlot);
        if (w !== undefined) k.weth = w;
        k.seen = Number(n);
      } else if (a.nonceChanges.length) {
        this.pending.add(addr); // an account that sent a tx: a real wallet, worth indexing
      }
    }
    await this.ingest(Number(n));
    this.snapshot(n);
  }

  private async ingest(n: number) {
    const batch = [...this.pending].slice(0, this.newPerBlock);
    if (!batch.length) return;
    batch.forEach((a) => this.pending.delete(a));
    const got = await this.read(batch);
    for (const [a, b] of got) this.known.set(a.toLowerCase() as Address, { ...b, seen: n });
    // Evict least recently active non-seed accounts beyond the cap.
    if (this.known.size > this.max) {
      const victims = [...this.known.entries()].filter(([a]) => !this.seeds.has(a)).sort((x, y) => x[1].seen - y[1].seen);
      for (const [a] of victims.slice(0, this.known.size - this.max)) this.known.delete(a);
    }
    if (this.pending.size > 4 * this.max) this.pending = new Set([...this.pending].slice(-this.max));
  }

  private snapshot(n: bigint) {
    const addresses = [...this.known.keys()].sort();
    const { rows, cols } = pirLayout(addresses.length);
    const records = addresses.map((a) => packBalances(this.known.get(a)!));
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
