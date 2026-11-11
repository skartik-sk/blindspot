// An EIP-1193 provider for any wallet or dapp: every read goes through the anonymous fetch you pass (Anon-RPC),
// block reads are verified (header hash; plus the light client, if you give one), and anything that would sign or
// send from an account is refused, because keys belong to the wallet, not to a read layer.
//
//   const provider = createProvider({ url: "https://ethereum-sepolia-rpc.publicnode.com", fetch: anonFetch,
//                                     chainId: 11155111, lightClient });
//   new ethers.BrowserProvider(provider)  /  createPublicClient({ transport: custom(provider) })
import type { Hex } from "viem";
import { verifyHeader } from "./header";
import type { LightClient } from "./lightclient";
import { RpcClient, type AnonFetch } from "./rpc";

export interface ProviderOptions {
  /** The JSON-RPC endpoint reads go to (through `fetch`). */
  url: string;
  /** An anonymous fetch (Anon-RPC's worker.fetch, or the app's anonFetch). */
  fetch: AnonFetch;
  chainId: number;
  /** Optional: block hashes are checked against heads the sync committee signed (see lightclient.ts). */
  lightClient?: Pick<LightClient, "latest">;
}

export class ProviderRpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) { super(message); this.code = code; this.data = data; }
}

/** Methods that act for an account: a read layer must never answer them. */
const REFUSED = /^(eth_(sendTransaction|sign|signTransaction|signTypedData.*|requestAccounts|accounts)|personal_sign|wallet_.*)$/;

export function createProvider(o: ProviderOptions) {
  const rpc = new RpcClient(o.url, o.fetch);
  const hexChain = ("0x" + o.chainId.toString(16)) as Hex;
  const listeners = new Map<string, Set<(...a: unknown[]) => void>>();

  async function request({ method, params = [] }: { method: string; params?: unknown[] }): Promise<unknown> {
    if (method === "eth_chainId") return hexChain;
    if (method === "net_version") return String(o.chainId);
    if (method === "eth_accounts") return [];
    if (REFUSED.test(method)) throw new ProviderRpcError(4200, `${method} isn't supported by a read-only provider: sign with your wallet`);
    if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash") {
      const block = (await rpc.call(method, params)) as { hash: Hex; number: Hex } | null;
      if (!block) return block;
      // The header must hash to the hash it claims (a relay can't edit fields of a real block).
      const h = verifyHeader(block as never, BigInt(block.number));
      if (h.toLowerCase() !== block.hash.toLowerCase()) throw new ProviderRpcError(-32603, "block header doesn't match its hash");
      if (o.lightClient && !params[1]) {
        // Optional: the latest signed head must be this block or a descendant we can reach by parent hashes.
        const head = await o.lightClient.latest();
        const blk = block as unknown as { number: Hex; hash: Hex };
        if (head.number !== undefined && head.number === BigInt(blk.number) && head.hash !== blk.hash.toLowerCase())
          throw new ProviderRpcError(-32603, "block contradicts the light client's signed head");
      }
      return block;
    }
    return rpc.call(method, params);
  }

  return {
    request,
    on(event: string, fn: (...a: unknown[]) => void) { (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(fn); return this; },
    removeListener(event: string, fn: (...a: unknown[]) => void) { listeners.get(event)?.delete(fn); return this; },
  };
}
