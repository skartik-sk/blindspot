// An EIP-1193 provider for any wallet or dapp: every read goes through the anonymous fetch you pass (Anon-RPC),
// block reads are verified (header hash; plus the light client, if you give one), and anything that would sign or
// send from an account is refused, because keys belong to the wallet, not to a read layer.
//
//   const provider = createProvider({ url: "https://ethereum-sepolia-rpc.publicnode.com", fetch: anonFetch,
//                                     chainId: 11155111, lightClient });
//   new ethers.BrowserProvider(provider)  /  createPublicClient({ transport: custom(provider) })
import { formatTransaction, keccak256, recoverTransactionAddress, serializeTransaction, toHex, toRlp, type Hex } from "viem";
import { verifyHeader } from "./header";
import type { VerifiedHead } from "./lightclient";
import { orderedTrieRoot } from "./receipts";
import { RpcClient, type AnonFetch } from "./rpc";

/** How far below the signed head a block can be proven by walking parent hashes. */
const MAX_WALK = 64;

const lc = (x: unknown) => String(x).toLowerCase();
const int = (n: bigint): Hex => (n === 0n ? "0x" : toHex(n));
const EMPTY_UNCLES = "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347";

/** A transaction re-encoded from its fields; `t.input` is the RPC's name for `data`. Blob sidecars aren't in the block. */
function encodeTx(t: any): Hex {
  const f = formatTransaction(t) as any;
  const sig = f.type === "legacy" ? { r: t.r, s: t.s, v: BigInt(t.v) } : { r: t.r, s: t.s, yParity: Number(t.yParity ?? t.v) };
  return serializeTransaction({ ...f, data: t.input, blobs: undefined, sidecars: undefined }, sig as any);
}

/** transactionsRoot from a block's full transaction objects. */
export function transactionsRoot(txs: any[]): Hex {
  return orderedTrieRoot(txs.map(encodeTx));
}

/**
 * Every field of every transaction is either inside the signed bytes (checked by the root) or derived from them and
 * the verified header: hash, sender, block position, effective gas price. Withdrawals are checked against their root.
 * Throws on the first mismatch.
 */
export async function verifyBody(b: any): Promise<void> {
  const raws = b.transactions.map(encodeTx);
  if (orderedTrieRoot(raws) !== b.transactionsRoot) throw new Error("transactions don't match the header's transactionsRoot");
  const base = b.baseFeePerGas == null ? undefined : BigInt(b.baseFeePerGas);
  await Promise.all(b.transactions.map(async (t: any, i: number) => {
    const bad = (what: string) => { throw new Error(`transaction ${i}: ${what} doesn't match`); };
    if (lc(keccak256(raws[i])) !== lc(t.hash)) bad("hash");
    if (lc(await recoverTransactionAddress({ serializedTransaction: raws[i] as any })) !== lc(t.from)) bad("sender");
    if (lc(t.blockHash) !== lc(b.hash) || BigInt(t.blockNumber) !== BigInt(b.number) || BigInt(t.transactionIndex) !== BigInt(i)) bad("block position");
    if (t.blockTimestamp != null && BigInt(t.blockTimestamp) !== BigInt(b.timestamp)) bad("timestamp");
    if (t.type !== "0x0" && t.yParity != null && t.v != null && BigInt(t.v) !== BigInt(t.yParity)) bad("v/yParity");
    if (t.maxFeePerGas != null && t.gasPrice != null && base !== undefined) {
      const tip = BigInt(t.maxPriorityFeePerGas), max = BigInt(t.maxFeePerGas);
      if (BigInt(t.gasPrice) !== (base + tip < max ? base + tip : max)) bad("effective gas price");
    }
  }));
  if (b.withdrawals) {
    const root = orderedTrieRoot(b.withdrawals.map((w: any) => toRlp([int(BigInt(w.index)), int(BigInt(w.validatorIndex)), w.address, int(BigInt(w.amount))])));
    if (root !== b.withdrawalsRoot) throw new Error("withdrawals don't match the header's withdrawalsRoot");
  }
  if ((b.uncles?.length ?? 0) > 0 || lc(b.sha3Uncles) !== EMPTY_UNCLES) throw new Error("unexpected uncles");
}

export interface ProviderOptions {
  /** The JSON-RPC endpoint reads go to (through `fetch`). */
  url: string;
  /** An anonymous fetch (Anon-RPC's worker.fetch, or the app's anonFetch). */
  fetch: AnonFetch;
  chainId: number;
  /** Optional: block hashes are checked against heads the sync committee signed (see lightclient.ts). */
  lightClient?: { latest(): Promise<VerifiedHead> };
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
  type Block = { hash: Hex; number: Hex; parentHash: Hex; transactions: any[]; transactionsRoot: Hex };
  const fail = (m: string) => new ProviderRpcError(-32603, m);

  /** A header that hashes to what it claims, at the number it claims. */
  const checked = (b: Block | null) => {
    if (!b) throw fail("the RPC has no such block");
    if (verifyHeader(b as never, BigInt(b.number)).toLowerCase() !== b.hash.toLowerCase()) throw fail("block header doesn't match its hash");
    return b;
  };

  /** The block is the signed head, or an ancestor reached by parent hashes (each header checked). */
  async function provenByLightClient(b: Block) {
    const head = await o.lightClient!.latest();
    let cur = checked(await rpc.call<Block>("eth_getBlockByHash", [head.hash, false]));
    if (cur.hash.toLowerCase() !== head.hash) throw fail("couldn't fetch the signed head");
    const want = BigInt(b.number);
    if (want > BigInt(cur.number)) throw fail(`block ${want} isn't proven yet (signed head is ${BigInt(cur.number)})`);
    if (BigInt(cur.number) - want > BigInt(MAX_WALK)) throw fail(`block ${want} is more than ${MAX_WALK} blocks below the signed head`);
    while (BigInt(cur.number) > want) {
      const parent = checked(await rpc.call<Block>("eth_getBlockByNumber", ["0x" + (BigInt(cur.number) - 1n).toString(16), false]));
      if (parent.hash.toLowerCase() !== cur.parentHash.toLowerCase()) throw fail(`block ${parent.number} isn't the signed head's ancestor`);
      cur = parent;
    }
    if (cur.hash.toLowerCase() !== b.hash.toLowerCase()) throw fail(`block ${want} contradicts the signed chain`);
  }

  async function verifiedBlockRead(method: string, params: unknown[]) {
    const [ref, full] = params as [string, boolean | undefined];
    let b: Block | null;
    // Always fetch full transactions: a list of hashes can't be checked against transactionsRoot on its own.
    if (method === "eth_getBlockByNumber" && o.lightClient && (ref === "latest" || ref === "pending")) {
      // "latest" means the latest block the sync committee signed.
      b = await rpc.call<Block>("eth_getBlockByHash", [(await o.lightClient.latest()).hash, true]);
    } else {
      b = await rpc.call<Block>(method, [ref, true]);
    }
    if (!b) return b;
    checked(b);
    // The block returned must be the one asked for.
    if (method === "eth_getBlockByHash" && b.hash.toLowerCase() !== String(ref).toLowerCase()) throw fail("got a different block than the hash asked for");
    if (method === "eth_getBlockByNumber" && /^0x[0-9a-f]+$/i.test(ref) && BigInt(b.number) !== BigInt(ref)) throw fail("got a different block than the number asked for");
    try { await verifyBody(b); } catch (e) { throw fail((e as Error).message); }
    if (o.lightClient) await provenByLightClient(b);
    // Hashes only when asked for: taken from the verified transactions, not from a separate answer.
    return full ? b : { ...b, transactions: b.transactions.map((t) => t.hash) };
  }

  async function request({ method, params = [] }: { method: string; params?: unknown[] }): Promise<unknown> {
    if (method === "eth_chainId") return hexChain;
    if (method === "net_version") return String(o.chainId);
    if (method === "eth_accounts") return [];
    if (REFUSED.test(method)) throw new ProviderRpcError(4200, `${method} isn't supported by a read-only provider: sign with your wallet`);
    if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash") return verifiedBlockRead(method, params);
    return rpc.call(method, params);
  }

  return {
    request,
    on(event: string, fn: (...a: unknown[]) => void) { (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(fn); return this; },
    removeListener(event: string, fn: (...a: unknown[]) => void) { listeners.get(event)?.delete(fn); return this; },
  };
}
