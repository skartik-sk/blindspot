// Minimal JSON-RPC client over an injectable fetch, so Anon-RPC's worker.fetch drops in unchanged.
import type { Hex } from "viem";
import type { BalJson } from "./bal";
import type { FullHeader } from "./header";
import { compactReceipts, type CompactReceipt, type RpcReceipt } from "./receipts";

/** Matches AnonRpcWorker.fetch: a standard fetch plus optional anonOptions. */
export type AnonFetch = (
  url: string,
  init: RequestInit & { anonOptions?: { isolationKey?: string } },
) => Promise<Response>;

export type Header = FullHeader;

export class RpcClient {
  private id = 0;
  private url: string;
  private fetchFn: AnonFetch;
  private isolationKey?: string;
  constructor(url: string, fetchFn: AnonFetch = (u, i) => fetch(u, i), isolationKey?: string) {
    this.url = url;
    this.fetchFn = fetchFn;
    this.isolationKey = isolationKey;
  }

  /** Same transport, different isolation key: calls under different keys must not be linkable. */
  isolated(isolationKey: string) {
    return new RpcClient(this.url, this.fetchFn, isolationKey);
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const res = await this.fetchFn(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
      ...(this.isolationKey ? { anonOptions: { isolationKey: this.isolationKey } } : {}),
    });
    const j = (await res.json()) as { result?: T; error?: { code: number; message: string } };
    if (j.error) throw new Error(`${method}: ${j.error.message} (${j.error.code})`);
    return j.result as T;
  }

  blockNumber = async () => BigInt(await this.call<Hex>("eth_blockNumber"));
  header = (n: bigint) => this.call<Header | null>("eth_getBlockByNumber", [toHex(n), false]);
  bal = (n: bigint) => this.call<BalJson | null>("eth_getBlockAccessList", [toHex(n)]);
  receipts = (n: bigint) => this.call<RpcReceipt[] | null>("eth_getBlockReceipts", [toHex(n)]);
  /** Relay-only: receipts without blooms or hashes (about 3x smaller); still checked against receiptsRoot. */
  compactReceipts = (n: bigint) => this.call<CompactReceipt[] | null>("bina_getReceipts", [toHex(n)]);
}

export const toHex = (n: bigint) => `0x${n.toString(16)}` as Hex;

/**
 * Fetch a block's access list, retrying under a fresh isolation key on failure. Through a mixnet or Tor each
 * new key is a new route, and public providers load-balance by region: some backends don't serve
 * eth_getBlockAccessList yet. Returns null only if the block doesn't exist yet.
 */
export async function fetchBal(rpc: RpcClient, n: bigint, attempts = 4): Promise<BalJson | null> {
  let err: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await (i === 0 ? rpc : rpc.isolated(crypto.randomUUID())).bal(n);
    } catch (e) {
      err = e;
    }
  }
  throw err;
}

/** A block's receipts in compact form, with the same retry policy as fetchBal. Verify with verifyReceipts. */
export async function fetchReceipts(rpc: RpcClient, n: bigint, compact = false, attempts = 3): Promise<CompactReceipt[]> {
  let err: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const c = i === 0 ? rpc : rpc.isolated(crypto.randomUUID());
      const r = compact ? await c.compactReceipts(n) : await c.receipts(n).then((x) => x && compactReceipts(x));
      if (!r) throw new Error(`no receipts for block ${n}`);
      return r;
    } catch (e) {
      err = e;
    }
  }
  throw err;
}
