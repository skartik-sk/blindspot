// Minimal JSON-RPC client over an injectable fetch, so Anon-RPC's worker.fetch drops in unchanged.
import type { Hex } from "viem";
import type { BalJson } from "./bal";

/** Matches AnonRpcWorker.fetch: a standard fetch plus optional anonOptions. */
export type AnonFetch = (
  url: string,
  init: RequestInit & { anonOptions?: { isolationKey?: string } },
) => Promise<Response>;

export interface Header {
  number: Hex;
  hash: Hex;
  parentHash: Hex;
  blockAccessListHash: Hex;
  timestamp: Hex;
}

export class RpcClient {
  private id = 0;
  constructor(
    private url: string,
    private fetchFn: AnonFetch = (u, i) => fetch(u, i),
    private isolationKey?: string,
  ) {}

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
}

export const toHex = (n: bigint) => `0x${n.toString(16)}` as Hex;
