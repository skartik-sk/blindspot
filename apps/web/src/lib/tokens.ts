// Token symbol/decimals, looked up once through the mixnet and cached on this device.
// A lookup names a token contract, never a wallet. Known tokens never hit the network.
// The engine resolves every token that trades in every block (resolveAll), so which tokens get looked up
// doesn't depend on which wallets you watch. Symbols of unknown tokens are untrusted: anyone can deploy "USDC".
import { RpcClient, SEPOLIA_TOKENS, newIsolationKey } from "@bina/sdk";
import { useEffect, useState } from "react";
import { decodeFunctionResult, encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { anonFetch } from "./anon";
import { config } from "./config";

export interface TokenMeta {
  symbol: string;
  decimals: number;
}

const KEY = "bp.tokens.v1";
const cache: Record<string, TokenMeta> = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
})();
for (const t of SEPOLIA_TOKENS) cache[t.token] = { symbol: t.symbol, decimals: t.decimals };
const inflight = new Map<string, Promise<TokenMeta>>();

async function fetchMeta(token: Address): Promise<TokenMeta> {
  const rpc = new RpcClient(config.readUrl, anonFetch, newIsolationKey());
  const call = async (fn: "symbol" | "decimals") => {
    const data = await rpc.call<Hex>("eth_call", [{ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: fn }) }, "latest"]);
    return decodeFunctionResult({ abi: erc20Abi, functionName: fn, data });
  };
  const [symbol, decimals] = await Promise.all([call("symbol").catch(() => "?"), call("decimals").catch(() => 18)]);
  const m = { symbol: String(symbol).slice(0, 12), decimals: Number(decimals) };
  cache[token] = m;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
  return m;
}

export function tokenMeta(token: Address): Promise<TokenMeta> {
  const t = token.toLowerCase();
  if (cache[t]) return Promise.resolve(cache[t]);
  if (!inflight.has(t)) inflight.set(t, fetchMeta(t as Address).finally(() => inflight.delete(t)));
  return inflight.get(t)!;
}

export const isKnown = (token: Address) => SEPOLIA_TOKENS.some((t) => t.token === token.toLowerCase());

/** Queue lookups for every token seen, a few at a time, so request timing isn't tied to your watchlist. */
const queue: Address[] = [];
let draining = false;
export function resolveAll(tokens: Address[]) {
  for (const t of tokens) if (!cache[t.toLowerCase()] && !queue.includes(t)) queue.push(t);
  if (draining) return;
  draining = true;
  (async () => {
    while (queue.length) await tokenMeta(queue.shift()!).catch(() => {});
    draining = false;
  })();
}

export function useToken(token?: Address): TokenMeta | undefined {
  const [m, setM] = useState(token ? cache[token.toLowerCase()] : undefined);
  useEffect(() => {
    if (token && !m) tokenMeta(token).then(setM).catch(() => {});
  }, [token]); // eslint-disable-line
  return m;
}
