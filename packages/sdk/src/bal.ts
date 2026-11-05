// EIP-7928 Block-Level Access List: JSON (eth_getBlockAccessList) -> canonical RLP -> keccak.
// The header commits to keccak256(rlp(bal)), so a relay can't alter the list without failing this check.
import { keccak256, toRlp, type Hex } from "viem";

export type BalJson = AccountChangesJson[];
export interface AccountChangesJson {
  address: Hex;
  storageChanges: { key: Hex; changes: { index: Hex; value: Hex }[] }[];
  storageReads: Hex[];
  balanceChanges: { index: Hex; value: Hex }[];
  nonceChanges: { index: Hex; value: Hex }[];
  codeChanges: { index: Hex; code: Hex }[];
}

export const EMPTY_BAL_HASH =
  "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347" as const;

// RLP scalar: minimal big-endian, zero = empty string.
function int(h: Hex | string): Hex {
  const n = BigInt(h);
  if (n === 0n) return "0x";
  const s = n.toString(16);
  return `0x${s.length % 2 ? "0" + s : s}`;
}

export function balToRlpInput(bal: BalJson) {
  return bal.map((a) => [
    a.address.toLowerCase() as Hex,
    a.storageChanges.map((s) => [int(s.key), s.changes.map((c) => [int(c.index), int(c.value)])]),
    a.storageReads.map(int),
    a.balanceChanges.map((c) => [int(c.index), int(c.value)]),
    a.nonceChanges.map((c) => [int(c.index), int(c.value)]),
    a.codeChanges.map((c) => [int(c.index), c.code]),
  ]);
}

export function encodeBal(bal: BalJson): Hex {
  return toRlp(balToRlpInput(bal) as any);
}

export function hashBal(bal: BalJson): Hex {
  return keccak256(encodeBal(bal));
}

export class BalHashMismatch extends Error {
  block: bigint;
  expected: Hex;
  got: Hex;
  constructor(block: bigint, expected: Hex, got: Hex) {
    super(`BAL hash mismatch at block ${block}: header ${expected}, list ${got}`);
    this.block = block;
    this.expected = expected;
    this.got = got;
  }
}

/** Throws unless keccak(rlp(bal)) equals the header's blockAccessListHash. */
export function verifyBal(bal: BalJson, header: { number: Hex | bigint; blockAccessListHash: Hex }) {
  const got = hashBal(bal);
  if (got.toLowerCase() !== header.blockAccessListHash.toLowerCase())
    throw new BalHashMismatch(BigInt(header.number), header.blockAccessListHash, got);
  return got;
}
