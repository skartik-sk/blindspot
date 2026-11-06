// Block receipts -> receipts trie root, checked against header.receiptsRoot.
// Every event (Transfer, Swap, ...) lives in a receipt, so a verified receipt list means the relay can't
// invent, edit or hide an event. Blooms are recomputed from the logs, so the wire format can drop them.
import { concat, keccak256, toHex, toRlp, type Address, type Hex } from "viem";
import type { FullHeader } from "./header";

/** A receipt with only the fields the trie commits to (minus the bloom, which is derived). */
export interface CompactReceipt {
  type: number;
  status: 0 | 1;
  /** cumulativeGasUsed */
  gas: Hex;
  logs: [address: Address, topics: Hex[], data: Hex][];
}

/** eth_getBlockReceipts item (only the fields we read). */
export interface RpcReceipt {
  type: Hex;
  status: Hex;
  cumulativeGasUsed: Hex;
  logs: { address: Address; topics: Hex[]; data: Hex }[];
}

export class ReceiptsMismatch extends Error {
  expected: Hex;
  got: Hex;
  constructor(expected: Hex, got: Hex) {
    super(`receipts root mismatch: header ${expected}, computed ${got}`);
    this.name = "ReceiptsMismatch";
    this.expected = expected;
    this.got = got;
  }
}

export const compactReceipts = (rs: RpcReceipt[]): CompactReceipt[] =>
  rs.map((r) => ({
    type: Number(r.type),
    status: Number(r.status) ? 1 : 0,
    gas: r.cumulativeGasUsed,
    logs: r.logs.map((l) => [l.address.toLowerCase() as Address, l.topics, l.data]),
  }));

const int = (n: bigint | number): Hex => (BigInt(n) === 0n ? "0x" : toHex(BigInt(n)));

export function bloom(logs: CompactReceipt["logs"]): Hex {
  const b = new Uint8Array(256);
  const add = (h: Hex) => {
    const d = keccak256(h, "bytes");
    for (let i = 0; i < 6; i += 2) {
      const bit = ((d[i] << 8) | d[i + 1]) & 2047;
      b[255 - (bit >> 3)] |= 1 << (bit & 7);
    }
  };
  for (const [addr, topics] of logs) {
    add(addr);
    topics.forEach(add);
  }
  return toHex(b);
}

export function encodeReceipt(r: CompactReceipt): Hex {
  const body = toRlp([int(r.status), int(BigInt(r.gas)), bloom(r.logs), r.logs.map(([a, t, d]) => [a, t, d])]);
  return r.type === 0 ? body : concat([toHex(r.type, { size: 1 }), body]);
}

// --- Minimal Merkle-Patricia trie root over an ordered list (keys = rlp(index)) ---
type Node = Hex | Node[];
const nibbles = (h: Hex) => [...h.slice(2)].map((c) => parseInt(c, 16));
function hexPrefix(path: number[], leaf: boolean): Hex {
  const flag = (leaf ? 2 : 0) + (path.length % 2);
  const all = path.length % 2 ? [flag, ...path] : [flag, 0, ...path];
  return `0x${all.map((n) => n.toString(16)).join("")}`;
}
/** Child reference: nodes under 32 bytes are inlined, others hashed. */
const ref = (n: Node): Node => {
  const enc = toRlp(n as never);
  return (enc.length - 2) / 2 < 32 ? n : keccak256(enc);
};
function build(items: [number[], Hex][], d: number): Node {
  if (items.length === 1) return [hexPrefix(items[0][0].slice(d), true), items[0][1]];
  // longest common prefix from depth d
  let p = 0;
  while (items.every(([k]) => k.length > d + p && k[d + p] === items[0][0][d + p])) p++;
  if (p > 0) return [hexPrefix(items[0][0].slice(d, d + p), false), ref(build(items, d + p))];
  const branch: Node[] = Array(17).fill("0x");
  for (let nib = 0; nib < 16; nib++) {
    const group = items.filter(([k]) => k.length > d && k[d] === nib);
    if (group.length) branch[nib] = ref(build(group, d + 1));
  }
  const here = items.find(([k]) => k.length === d);
  if (here) branch[16] = here[1];
  return branch;
}
export function orderedTrieRoot(values: Hex[]): Hex {
  if (!values.length) return keccak256(toRlp("0x"));
  const items = values.map((v, i): [number[], Hex] => [nibbles(toRlp(int(i))), v]);
  return keccak256(toRlp(build(items, 0) as never));
}

export const receiptsRoot = (rs: CompactReceipt[]) => orderedTrieRoot(rs.map(encodeReceipt));

/** Throws ReceiptsMismatch unless the receipts are exactly the block's receipts. */
export function verifyReceipts(rs: CompactReceipt[], header: Pick<FullHeader, "receiptsRoot">): Hex {
  const got = receiptsRoot(rs);
  if (got !== header.receiptsRoot.toLowerCase()) throw new ReceiptsMismatch(header.receiptsRoot, got);
  return got;
}
