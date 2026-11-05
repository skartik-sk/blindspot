// EIP-681 payment request for an ERC-20 transfer, e.g.
//   ethereum:0x1c7d…7238@11155111/transfer?address=0xSALE&uint256=240000
// Read by the customer page; also understood by most wallets.
import { getAddress, isAddress, type Address } from "viem";

export interface PayReq {
  token: Address;
  chainId: number;
  to: Address;
  amount: bigint; // token base units
}

export const encodePayReq = (r: PayReq) =>
  `ethereum:${r.token}@${r.chainId}/transfer?address=${r.to}&uint256=${r.amount}`;

const RE = /^ethereum:(0x[0-9a-fA-F]{40})@(\d+)\/transfer\?(.+)$/;

/** Strict parse: rejects anything that isn't exactly a token transfer request. */
export function decodePayReq(s: string): PayReq {
  const m = s.trim().match(RE);
  if (!m) throw new Error("not a payment request");
  const q = new URLSearchParams(m[3]);
  const to = q.get("address") ?? "";
  const amt = q.get("uint256") ?? "";
  if (!isAddress(m[1]) || !isAddress(to) || !/^\d{1,30}$/.test(amt)) throw new Error("malformed payment request");
  const amount = BigInt(amt);
  if (amount <= 0n) throw new Error("amount must be positive");
  return { token: getAddress(m[1]), chainId: Number(m[2]), to: getAddress(to), amount };
}
