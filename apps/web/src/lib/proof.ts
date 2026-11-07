// Holding a PIR answer to the chain. PIR hides which row you read but doesn't prove the value, so the result starts as
// "private, not yet proven". When this device later verifies a block in which the address's balance changed (its
// own history download, or the live feed), the post-block value from the verified access list is compared with it.
// Display and comparison only: the PIR protocol is unchanged. Pure, so it's testable.
import { SEPOLIA_TOKENS, type Activity } from "@blindspot/sdk";

export interface Bal3 { eth?: bigint; usdc?: bigint; weth?: bigint }
export interface Seen extends Bal3 { block: number }
export type Proof =
  | { status: "unproven" }
  | { status: "proven"; block: number }
  | { status: "mismatch"; block: number; verified: Bal3 }
  | { status: "updated"; block: number; verified: Bal3 };

const USDC = SEPOLIA_TOKENS[0].token;
const WETH = SEPOLIA_TOKENS[1].token;

/** The verified post-block balances of one address in one block (only the fields that changed there). */
export function seenFrom(a: Activity, block: number): Seen | undefined {
  const s: Seen = { block };
  if (a.eth !== undefined) s.eth = a.eth;
  if (a.tokens[USDC] !== undefined) s.usdc = a.tokens[USDC];
  if (a.tokens[WETH] !== undefined) s.weth = a.tokens[WETH];
  return s.eth === undefined && s.usdc === undefined && s.weth === undefined ? undefined : s;
}

const KEYS = ["eth", "usdc", "weth"] as const;

/**
 * pir: the PIR answer, as of the table's block `pirBlock`. lastActive: the newest block the PIR record lists for this
 * address (the last change the answer should reflect). Data older than that can't be compared and is ignored.
 * A difference at or before the PIR block means the server's answer was wrong: "mismatch", sticky.
 * A difference in a newer block is a real change after the snapshot: "updated" (not an accusation).
 */
export function compare(pir: Required<Bal3>, pirBlock: number, lastActive: number | undefined, seen: Seen, prev: Proof): Proof {
  if (prev.status === "mismatch") return prev;
  if (lastActive !== undefined && seen.block < lastActive) return prev;
  const keys = KEYS.filter((k) => seen[k] !== undefined);
  if (!keys.length) return prev;
  const verified: Bal3 = prev.status === "updated" ? { ...prev.verified } : {};
  for (const k of keys) verified[k] = seen[k];
  const same = keys.every((k) => seen[k] === pir[k]);
  if (same && prev.status !== "updated") return { status: "proven", block: seen.block };
  if (seen.block <= pirBlock) return { status: "mismatch", block: seen.block, verified };
  return { status: "updated", block: seen.block, verified };
}

/** What to display: the PIR answer, with any verified value taking its place. */
export const shown = (pir: Required<Bal3>, p: Proof): Required<Bal3> =>
  p.status === "mismatch" || p.status === "updated" ? { ...pir, ...Object.fromEntries(Object.entries(p.verified).filter(([, v]) => v !== undefined)) } as Required<Bal3> : pir;
