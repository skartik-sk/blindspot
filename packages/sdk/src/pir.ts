// Single-server PIR (Kushilevitz–Ostrovsky over Paillier): fetch record i of a public table without the
// server learning i. The table is laid out as rows x cols. The client sends one encrypted selector per
// column (Enc(1) at its column, Enc(0) elsewhere); for every row the server folds the selectors into
// Enc(record[row][col]) and returns all rows. The client decrypts only its own row. The server touches every
// record for every query, so its work is identical whatever i is.
//
// Paillier is from paillier-bigint. Not post-quantum; slow on large tables (demo uses ~1k records).
// Hiding, not verifying: a lying server could return a wrong balance. The live feed corrects it from
// verified BALs as soon as the address changes.
import { generateRandomKeys, type PrivateKey, type PublicKey } from "paillier-bigint";
import type { Address, Hex } from "viem";

export interface PirTable {
  epoch: number;
  /** Block the balances were read at. */
  block: string;
  rows: number;
  cols: number;
  /** Public directory: the client finds its index locally. */
  addresses: Address[];
}

export interface PirQuery {
  epoch: number;
  /** Paillier modulus n (public key; g = n + 1). */
  n: Hex;
  /** One ciphertext per column. */
  q: Hex[];
}

export interface Balances {
  eth: bigint;
  usdc: bigint;
  weth: bigint;
}

const MASK128 = (1n << 128n) - 1n;
const MASK64 = (1n << 64n) - 1n;
// record = eth (128 bits) | usdc (64) | weth (128): 320 bits, well under a 1024-bit plaintext.
export const packBalances = (b: Balances) =>
  ((b.eth & MASK128) << 192n) | ((b.usdc & MASK64) << 128n) | (b.weth & MASK128);
export const unpackBalances = (r: bigint): Balances => ({
  eth: (r >> 192n) & MASK128,
  usdc: (r >> 128n) & MASK64,
  weth: r & MASK128,
});

/** Recent active blocks kept per address in a v2 record. */
export const HISTORY_SLOTS = 6;
const DELTA_BITS = 20n; // offsets up to ~1M blocks (~145 days at 12 s)
const MASK_D = (1n << DELTA_BITS) - 1n;
const BAL_BITS = 320n;

/**
 * v2 record: balances in the low 320 bits (unpackBalances still works), then up to 6 recent active blocks,
 * newest first, each stored as (snapshot block − block + 1) in 20 bits; 0 means empty. 440 bits in all.
 */
export function packRecord(b: Balances, history: number[], at: number): bigint {
  let r = packBalances(b);
  const ok = history.filter((n) => n <= at && BigInt(at - n + 1) <= MASK_D).slice(0, HISTORY_SLOTS);
  ok.forEach((n, i) => { r |= BigInt(at - n + 1) << (BAL_BITS + DELTA_BITS * BigInt(i)); });
  return r;
}

export function unpackRecord(r: bigint, at: number): Balances & { history: number[] } {
  const history: number[] = [];
  for (let i = 0; i < HISTORY_SLOTS; i++) {
    const d = (r >> (BAL_BITS + DELTA_BITS * BigInt(i))) & MASK_D;
    if (d) history.push(at - Number(d) + 1);
  }
  return { ...unpackBalances(r & ((1n << BAL_BITS) - 1n)), history };
}

export function pirLayout(count: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  return { rows: Math.max(1, Math.ceil(count / cols)), cols };
}

const hex = (n: bigint) => `0x${n.toString(16)}` as Hex;

export function modPow(b: bigint, e: bigint, m: bigint) {
  let r = 1n;
  b %= m;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

/** Client side: one key pair per lookup, so two lookups can't be linked by key. */
export class PirClient {
  private pk: PublicKey;
  private sk: PrivateKey;
  private constructor(pk: PublicKey, sk: PrivateKey) {
    this.pk = pk;
    this.sk = sk;
  }
  static async create(bits = 1024) {
    const { publicKey, privateKey } = await generateRandomKeys(bits);
    return new PirClient(publicKey, privateKey);
  }
  query(t: PirTable, index: number): PirQuery {
    if (index < 0 || index >= t.addresses.length) throw new Error("index out of range");
    const col = index % t.cols;
    return { epoch: t.epoch, n: hex(this.pk.n), q: Array.from({ length: t.cols }, (_, j) => hex(this.pk.encrypt(j === col ? 1n : 0n))) };
  }
  decode(t: PirTable, index: number, answers: Hex[]): bigint {
    const row = Math.floor(index / t.cols);
    if (answers.length !== t.rows) throw new Error("bad answer size");
    return this.sk.decrypt(BigInt(answers[row]));
  }
}

/** Accepted key sizes (bits of n): server cost scales with n, so only the two sizes clients use. */
export const PIR_BITS = [1024, 2048];

/** Server side. records.length <= rows * cols; missing cells are 0. Validates the query to bound CPU. */
export function pirAnswer(records: bigint[], t: Pick<PirTable, "rows" | "cols">, query: Pick<PirQuery, "n" | "q">): Hex[] {
  const n = BigInt(query.n);
  const bits = n.toString(2).length;
  if (!PIR_BITS.some((b) => bits === b || bits === b - 1) || n % 2n === 0n) throw new Error("bad modulus");
  if (!Array.isArray(query.q) || query.q.length !== t.cols) throw new Error("bad query size");
  const n2 = n * n;
  const q = query.q.map((c) => {
    const v = BigInt(c);
    if (v <= 0n || v >= n2) throw new Error("bad ciphertext");
    return v;
  });
  const out: Hex[] = [];
  for (let r = 0; r < t.rows; r++) {
    let acc = 1n;
    for (let c = 0; c < t.cols; c++) {
      const m = records[r * t.cols + c] ?? 0n;
      if (m) acc = (acc * modPow(q[c], m, n2)) % n2;
    }
    out.push(hex(acc));
  }
  return out;
}
