// Tap-triggered watch window: after a tap, scan the next N blocks' verified lists for our one-time addresses.
// Every request is address-free: only block numbers are asked for.
import type { Address } from "viem";
import { verifyBal } from "./bal";
import { findHits, SEPOLIA_USDC, type Erc20Slot, type Hit } from "./extract";
import type { RpcClient } from "./rpc";

export interface WatchOptions {
  rpc: RpcClient;
  addresses: Address[];
  /** First block to scan (usually head at tap time). */
  from: bigint;
  /** How many blocks to watch. Default 10 (~2 min on 12s slots). */
  blocks?: number;
  tokens?: Erc20Slot[];
  pollMs?: number;
  signal?: AbortSignal;
  /** Called once per verified block, hit or not. Useful for the "proven" UI and Spy Panel. */
  onBlock?: (b: { number: bigint; balHash: string; accounts: number; hits: Hit[] }) => void;
  /** Stop at the first block with a hit. Default true. */
  stopOnHit?: boolean;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), r()), { once: true });
  });

export async function watchWindow(o: WatchOptions): Promise<Hit[]> {
  const { rpc, addresses, from, blocks = 10, tokens = [SEPOLIA_USDC], pollMs = 3000, signal } = o;
  const stopOnHit = o.stopOnHit ?? true;
  const all: Hit[] = [];
  for (let n = from; n < from + BigInt(blocks) && !signal?.aborted; ) {
    const header = await rpc.header(n);
    if (!header) {
      await sleep(pollMs, signal); // block not produced yet
      continue;
    }
    const bal = await rpc.bal(n);
    if (!bal) throw new Error(`no access list for block ${n}`);
    const balHash = verifyBal(bal, header); // throws if the server lied
    const hits = findHits(bal, addresses, tokens);
    o.onBlock?.({ number: n, balHash, accounts: bal.length, hits });
    all.push(...hits);
    if (hits.length && stopOnHit) break;
    n++;
  }
  return all;
}
