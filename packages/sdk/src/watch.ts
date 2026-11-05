// Tap-triggered watch window: after a tap, scan the next N blocks' verified lists for our one-time addresses.
// Every request is address-free: only block numbers are asked for.
//
// Trust chain per block:  header fields --keccak--> header.hash   (header can't be edited)
//                         access list   --keccak--> header.blockAccessListHash (list can't be edited)
//                         header.parentHash == previous block's hash (window is one chain)
//                         anchor (independent provider) agrees on the hit block's hash (relay can't forge a chain)
// A light client (e.g. Helios) would replace the anchor; until then, faking a payment needs the relay AND
// the anchor provider to collude.
import type { Address, Hex } from "viem";
import { verifyBal } from "./bal";
import { findHits, SEPOLIA_USDC, type Erc20Slot, type Hit } from "./extract";
import { HeaderInvalid, verifyHeader } from "./header";
import { fetchBal, type RpcClient } from "./rpc";

export interface WatchOptions {
  rpc: RpcClient;
  addresses: Address[];
  /** First block to scan (usually head at tap time). */
  from: bigint;
  /** How many blocks to watch. Default 10 (~2 min on 12s slots). */
  blocks?: number;
  tokens?: Erc20Slot[];
  /** Independent provider used to confirm the hash of any block with a hit. Strongly recommended. */
  anchor?: RpcClient;
  pollMs?: number;
  signal?: AbortSignal;
  /** Called once per verified block, hit or not. Useful for the "proven" UI and Spy Panel. */
  onBlock?: (b: { number: bigint; hash: Hex; balHash: Hex; accounts: number; hits: Hit[]; anchored: boolean }) => void;
  /** Stop at the first block with a hit. Default true. */
  stopOnHit?: boolean;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), r()), { once: true });
  });

export async function watchWindow(o: WatchOptions): Promise<Hit[]> {
  const { rpc, addresses, from, blocks = 10, tokens = [SEPOLIA_USDC], pollMs = 3000, signal, anchor } = o;
  const stopOnHit = o.stopOnHit ?? true;
  const all: Hit[] = [];
  let prevHash: Hex | undefined;
  for (let n = from; n < from + BigInt(blocks) && !signal?.aborted; ) {
    const header = await rpc.header(n);
    if (!header) {
      await sleep(pollMs, signal); // block not produced yet
      continue;
    }
    const hash = verifyHeader(header, n);
    if (prevHash && header.parentHash.toLowerCase() !== prevHash)
      throw new HeaderInvalid(`block ${n} does not extend block ${n - 1n}`);
    prevHash = hash;

    const bal = await fetchBal(rpc, n);
    if (!bal) throw new Error(`no access list for block ${n}`);
    const balHash = verifyBal(bal, header); // throws if the server lied
    const hits = findHits(bal, addresses, tokens);

    let anchored = false;
    if (hits.length && anchor) {
      const ref = await anchor.header(n);
      if (!ref || ref.hash.toLowerCase() !== hash)
        throw new HeaderInvalid(`anchor disagrees on block ${n}: relay ${hash}, anchor ${ref?.hash}`);
      anchored = true;
    }
    o.onBlock?.({ number: n, hash, balHash, accounts: bal.length, hits, anchored });
    all.push(...hits);
    if (hits.length && stopOnHit) break;
    n++;
  }
  return all;
}
