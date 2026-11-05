// Block header hashing, so header fields (incl. blockAccessListHash) can't be edited without changing the hash.
import { keccak256, toRlp, type Hex } from "viem";

const int = (h: Hex | undefined): Hex => {
  const n = BigInt(h ?? 0);
  if (n === 0n) return "0x";
  const s = n.toString(16);
  return `0x${s.length % 2 ? "0" + s : s}`;
};

/** Field order of the post-Glamsterdam (Amsterdam) execution header. */
export const HEADER_FIELDS = [
  ["parentHash", "bytes"], ["sha3Uncles", "bytes"], ["miner", "bytes"], ["stateRoot", "bytes"],
  ["transactionsRoot", "bytes"], ["receiptsRoot", "bytes"], ["logsBloom", "bytes"], ["difficulty", "int"],
  ["number", "int"], ["gasLimit", "int"], ["gasUsed", "int"], ["timestamp", "int"], ["extraData", "bytes"],
  ["mixHash", "bytes"], ["nonce", "bytes"], ["baseFeePerGas", "int"], ["withdrawalsRoot", "bytes"],
  ["blobGasUsed", "int"], ["excessBlobGas", "int"], ["parentBeaconBlockRoot", "bytes"], ["requestsHash", "bytes"],
  ["blockAccessListHash", "bytes"], ["slotNumber", "int"],
] as const;

export type FullHeader = Record<(typeof HEADER_FIELDS)[number][0], Hex> & { hash: Hex };

export function hashHeader(h: FullHeader): Hex {
  return keccak256(toRlp(HEADER_FIELDS.map(([k, t]) => (t === "int" ? int(h[k]) : h[k]))));
}

export class HeaderInvalid extends Error {}

/** Header hash matches its fields, and it is the block number we asked for. */
export function verifyHeader(h: FullHeader, expectNumber?: bigint) {
  const got = hashHeader(h);
  if (got !== h.hash.toLowerCase()) throw new HeaderInvalid(`header hash mismatch: ${h.hash} vs ${got}`);
  if (expectNumber !== undefined && BigInt(h.number) !== expectNumber)
    throw new HeaderInvalid(`asked for block ${expectNumber}, got ${BigInt(h.number)}`);
  return got;
}
