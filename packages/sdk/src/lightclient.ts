// A beacon-chain light client used as the block anchor: instead of trusting a second RPC provider to confirm each
// block hash, the device checks that the Ethereum sync committee (512 validators) signed a header the block links to.
//
// Chain of trust:
//   pinned checkpoint (a finalized beacon block root, refreshed at build time)
//   -> bootstrap: its current sync committee, proven by a Merkle branch into that block's state root
//   -> period updates: each next committee, signed by the one before (2/3 of 512 keys, BLS)
//   -> optimistic update: the latest attested header, signed by the current committee, with a Merkle branch to the
//      execution block hash (Gloas) or the execution payload header (Electra)
//   -> the execution header that hashes to it, then parent links back to the block being anchored.
//
// The beacon API is only a source of data: everything it returns is checked here. It's fetched by the caller's
// `get`, so in the app it goes through Anon-RPC like everything else, and several endpoints can be listed.
import { bls12_381 } from "@noble/curves/bls12-381";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils";
import type { Hex } from "viem";

export interface ChainSpec {
  genesisTime: number;
  genesisValidatorsRoot: Hex;
  /** [first epoch, fork version], oldest first, from Electra on. A new fork must be added here. */
  forks: [number, Hex][];
  /** First epoch of Gloas, where the light-client header carries only the execution block hash. */
  gloasEpoch: number;
}

export const SEPOLIA_BEACON: ChainSpec = {
  genesisTime: 1655733600,
  genesisValidatorsRoot: "0xd8ea171f3c94aea21ebc42a1ed61052acf3f9209c00e4efbaaddac09ed9b8078",
  forks: [[222464, "0x90000074"], [272640, "0x90000075"], [353024, "0x90000076"]],
  gloasEpoch: 353024,
};
export const MAINNET_BEACON: ChainSpec = {
  genesisTime: 1606824023,
  genesisValidatorsRoot: "0x4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95",
  forks: [[364032, "0x05000000"], [411392, "0x06000000"]],
  gloasEpoch: Infinity,
};

/** [depth, index] of each light-client Merkle branch (generalized index = 2^depth + index). */
const BRANCH = {
  electra: { current: [6, 22], next: [6, 23], execution: [4, 9] },
  gloas: { current: [11, 897], next: [11, 898], execution: [11, 808] },
} as const;
const SLOTS_PER_PERIOD = 8192;
const DST = "BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_";

// ---- SSZ, just enough for the containers a light client needs ----
const b = (h: string) => hexToBytes(h.startsWith("0x") ? h.slice(2) : h);
const hx = (u: Uint8Array) => ("0x" + bytesToHex(u)) as Hex;
const eq = (x: Uint8Array, y: Uint8Array) => x.length === y.length && x.every((v, i) => v === y[i]);
const chunk = (u: Uint8Array) => { const c = new Uint8Array(32); c.set(u); return c; };
const le = (v: string | number | bigint, width: number) => {
  const c = new Uint8Array(32);
  for (let i = 0, n = BigInt(v); i < width; i++, n >>= 8n) c[i] = Number(n & 255n);
  return c;
};
export function merkleize(chunks: Uint8Array[], limit = chunks.length): Uint8Array {
  let width = 1;
  while (width < limit) width *= 2;
  let layer = [...chunks];
  for (let zero: Uint8Array = new Uint8Array(32); width > 1; width /= 2) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < width; i += 2) next.push(sha256(concatBytes(layer[i] ?? zero, layer[i + 1] ?? zero)));
    layer = next;
    zero = sha256(concatBytes(zero, zero));
  }
  return layer[0] ?? new Uint8Array(32);
}
const packed = (u: Uint8Array) => Array.from({ length: Math.ceil(u.length / 32) }, (_, i) => chunk(u.slice(i * 32, i * 32 + 32)));

export interface BeaconHeader { slot: string; proposer_index: string; parent_root: Hex; state_root: Hex; body_root: Hex }
export const beaconRoot = (h: BeaconHeader) =>
  merkleize([le(h.slot, 8), le(h.proposer_index, 8), b(h.parent_root), b(h.state_root), b(h.body_root)]);

interface Committee { pubkeys: Hex[]; aggregate_pubkey: Hex }
const committeeRoot = (c: Committee) =>
  merkleize([merkleize(c.pubkeys.map((p) => sha256(concatBytes(b(p), new Uint8Array(16))))), sha256(concatBytes(b(c.aggregate_pubkey), new Uint8Array(16)))]);

/** hash_tree_root of an Electra/Fulu ExecutionPayloadHeader (17 fields). */
function executionRoot(e: Record<string, string>) {
  const extra = b(e.extra_data);
  return merkleize([
    b(e.parent_hash), chunk(b(e.fee_recipient)), b(e.state_root), b(e.receipts_root), merkleize(packed(b(e.logs_bloom))),
    b(e.prev_randao), le(e.block_number, 8), le(e.gas_limit, 8), le(e.gas_used, 8), le(e.timestamp, 8),
    sha256(concatBytes(merkleize(packed(extra), 1), le(extra.length, 8))), le(e.base_fee_per_gas, 32), b(e.block_hash),
    b(e.transactions_root), b(e.withdrawals_root), le(e.blob_gas_used, 8), le(e.excess_blob_gas, 8),
  ]);
}

export function branchOk(leaf: Uint8Array, branch: Hex[], depth: number, index: number, root: Hex) {
  if (branch.length !== depth) return false;
  let node = leaf;
  for (let i = 0; i < depth; i++) node = (index >> i) & 1 ? sha256(concatBytes(b(branch[i]), node)) : sha256(concatBytes(node, b(branch[i])));
  return eq(node, b(root));
}

const period = (slot: string | number) => Math.floor(Number(slot) / SLOTS_PER_PERIOD);
const layout = (spec: ChainSpec, slot: string | number) => (Math.floor(Number(slot) / 32) >= spec.gloasEpoch ? BRANCH.gloas : BRANCH.electra);

// Parsing 512 keys is the slow part; a committee serves a whole period (~27 h), so parse once.
const keyCache = new WeakMap<Committee, ReturnType<typeof bls12_381.G1.ProjectivePoint.fromHex>[]>();
const keysOf = (c: Committee) => {
  let k = keyCache.get(c);
  if (!k) keyCache.set(c, (k = c.pubkeys.map((p) => bls12_381.G1.ProjectivePoint.fromHex(p.slice(2)))));
  return k;
};

interface SyncAggregate { sync_committee_bits: Hex; sync_committee_signature: Hex }
/** At least 2/3 of the committee signed this header (BLS aggregate signature over its signing root). */
export function signedByCommittee(spec: ChainSpec, committee: Committee, agg: SyncAggregate, header: BeaconHeader, signatureSlot: string) {
  const bits = b(agg.sync_committee_bits);
  const signers = keysOf(committee).filter((_, i) => (bits[i >> 3] >> (i & 7)) & 1);
  if (signers.length * 3 < committee.pubkeys.length * 2) return false;
  const epoch = Math.floor((Math.max(Number(signatureSlot), 1) - 1) / 32);
  const fork = [...spec.forks].reverse().find(([e]) => epoch >= e);
  if (!fork) return false;
  const forkDataRoot = merkleize([chunk(b(fork[1])), b(spec.genesisValidatorsRoot)]);
  const domain = concatBytes(Uint8Array.of(7, 0, 0, 0), forkDataRoot.slice(0, 28)); // DOMAIN_SYNC_COMMITTEE
  const signingRoot = merkleize([beaconRoot(header), domain]);
  // Ethereum signs with the proof-of-possession ciphersuite, so the message is hashed to G2 with its DST.
  return bls12_381.verify(agg.sync_committee_signature.slice(2), signingRoot, bls12_381.aggregatePublicKeys(signers), { DST });
}

export interface VerifiedHead {
  /** Execution block hash the committee signed. */
  hash: Hex;
  /** Execution block number, when the header carries it (Electra); Gloas heads are resolved by the caller. */
  number?: bigint;
  slot: number;
  /** Unix seconds of the beacon slot. */
  time: number;
}

/** GET a beacon API path, returning parsed JSON (the app routes this through Anon-RPC). */
export type BeaconGet = (path: string) => Promise<any>;

export interface LightClientOptions {
  /** One or more beacon API base URLs' fetchers, tried in order (failover). */
  get: BeaconGet;
  /** A finalized beacon block root to start from (pinned at build time). */
  checkpoint: Hex;
  spec?: ChainSpec;
  /** Reject heads older than this (seconds). */
  maxHeadAgeS?: number;
}

export class LightClient {
  private committees = new Map<number, Committee>();
  private head?: VerifiedHead;
  private refreshing?: Promise<VerifiedHead>;
  private spec: ChainSpec;
  private o: LightClientOptions;
  ready: Promise<void>;

  constructor(o: LightClientOptions) {
    this.o = o;
    this.spec = o.spec ?? SEPOLIA_BEACON;
    this.ready = this.bootstrap();
  }

  private async bootstrap() {
    const r = await this.o.get(`/eth/v1/beacon/light_client/bootstrap/${this.o.checkpoint}`);
    const boot = r?.data;
    if (!boot) throw new Error("light client: bootstrap not served for the pinned checkpoint");
    if (hx(beaconRoot(boot.header.beacon)) !== this.o.checkpoint.toLowerCase()) throw new Error("light client: bootstrap does not match the checkpoint");
    const [d, i] = layout(this.spec, boot.header.beacon.slot).current;
    if (!branchOk(committeeRoot(boot.current_sync_committee), boot.current_sync_committee_branch, d, i, boot.header.beacon.state_root))
      throw new Error("light client: bad bootstrap committee branch");
    this.committees.set(period(boot.header.beacon.slot), boot.current_sync_committee);
  }

  /** Walk the committee forward one period at a time, each signed by the one before. */
  private async committeeFor(p: number): Promise<Committee> {
    while (!this.committees.has(p)) {
      const known = Math.max(...this.committees.keys());
      if (known > p) throw new Error("light client: period before checkpoint");
      const res = await this.o.get(`/eth/v1/beacon/light_client/updates?start_period=${known}&count=1`);
      const u = (Array.isArray(res) ? res[0] : res?.data?.[0])?.data;
      if (!u || period(u.attested_header.beacon.slot) !== known || period(u.signature_slot) !== known) throw new Error(`light client: no update for period ${known}`);
      const [d, i] = layout(this.spec, u.attested_header.beacon.slot).next;
      if (!branchOk(committeeRoot(u.next_sync_committee), u.next_sync_committee_branch, d, i, u.attested_header.beacon.state_root))
        throw new Error("light client: bad next-committee branch");
      if (!signedByCommittee(this.spec, this.committees.get(known)!, u.sync_aggregate, u.attested_header.beacon, u.signature_slot))
        throw new Error("light client: bad update signature");
      this.committees.set(known + 1, u.next_sync_committee);
    }
    return this.committees.get(p)!;
  }

  /** Verify one optimistic update (exported for tests). */
  async verifyUpdate(u: any): Promise<VerifiedHead> {
    const h = u.attested_header;
    const gloas = layout(this.spec, h.beacon.slot) === BRANCH.gloas;
    const leaf = gloas ? b(h.execution_block_hash) : executionRoot(h.execution);
    const [d, i] = layout(this.spec, h.beacon.slot).execution;
    if (!branchOk(leaf, h.execution_branch, d, i, h.beacon.body_root)) throw new Error("light client: bad execution branch");
    if (!signedByCommittee(this.spec, await this.committeeFor(period(u.signature_slot)), u.sync_aggregate, h.beacon, u.signature_slot))
      throw new Error("light client: bad head signature");
    return {
      hash: (gloas ? h.execution_block_hash : h.execution.block_hash).toLowerCase(),
      number: gloas ? undefined : BigInt(h.execution.block_number),
      slot: Number(h.beacon.slot),
      time: this.spec.genesisTime + Number(h.beacon.slot) * 12,
    };
  }

  /** The latest head the committee signed. Fetches at most one update at a time. */
  async latest(): Promise<VerifiedHead> {
    await this.ready;
    this.refreshing ??= (async () => {
      const r = await this.o.get("/eth/v1/beacon/light_client/optimistic_update");
      const next = await this.verifyUpdate(r?.data);
      if (Date.now() / 1000 - next.time > (this.o.maxHeadAgeS ?? 180)) throw new Error("light client: head is stale");
      if (!this.head || next.slot > this.head.slot) this.head = next;
      return this.head;
    })().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }

  /** The last verified head without fetching (for status displays). */
  current() { return this.head; }
}
