// Build, sign and send transactions. Signing happens here; the signed tx goes to Flashbots Protect through the
// mixnet, so it never sits in the public mempool and the sender's IP is never attached to it.
// Disclosed: preparing a tx (nonce, gas) names your address to a read node, on a fresh one-off mixnet route.
import { RpcClient, SEPOLIA_USDC, SEPOLIA_WETH, newIsolationKey } from "@bina/sdk";
import {
  createPublicClient, encodeFunctionData, erc20Abi, http, parseAbi, type Address, type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { anonFetch } from "./anon";
import { config } from "./config";
import { deviceAccount } from "./device";

export const ROUTER: Address = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E"; // Uniswap SwapRouter02 (Sepolia)
const QUOTER: Address = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3"; // QuoterV2 (Sepolia)
export const POOL_FEE = 500; // deepest USDC/WETH pool on Sepolia

export type Asset = "ETH" | "USDC" | "WETH";
export const TOKEN: Record<Exclude<Asset, "ETH">, Address> = { USDC: SEPOLIA_USDC.token, WETH: SEPOLIA_WETH.token };
export const DECIMALS: Record<Asset, number> = { ETH: 18, USDC: 6, WETH: 18 };

/** viem transport whose every request goes through Anon-RPC under one isolation key. */
const anonTransport = (url: string, isolationKey: string) =>
  http(url, {
    fetchFn: (input, init) => anonFetch(String(input instanceof Request ? input.url : input), { ...init!, anonOptions: { isolationKey } }),
  });

const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)",
]);

/** A quote names two tokens and an amount, never your address. */
export async function quote(from: Asset, to: Asset, amountIn: bigint): Promise<bigint> {
  const c = createPublicClient({ chain: sepolia, transport: anonTransport(config.readUrl, newIsolationKey()) });
  const tokenIn = from === "ETH" ? TOKEN.WETH : TOKEN[from];
  const tokenOut = to === "ETH" ? TOKEN.WETH : TOKEN[to];
  const { result } = await c.simulateContract({
    address: QUOTER, abi: quoterAbi, functionName: "quoteExactInputSingle",
    args: [{ tokenIn, tokenOut, amountIn, fee: POOL_FEE, sqrtPriceLimitX96: 0n }],
  });
  return result[0];
}

export interface TxPlan {
  label: string;
  to: Address;
  data?: Hex;
  value?: bigint;
}

export function transferPlan(asset: Asset, to: Address, amount: bigint): TxPlan[] {
  if (asset === "ETH") return [{ label: `Send ${asset}`, to, value: amount }];
  return [{ label: `Send ${asset}`, to: TOKEN[asset], data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }) }];
}

export async function swapPlan(from: Asset, to: Asset, amountIn: bigint, minOut: bigint): Promise<TxPlan[]> {
  if (from === to || to === "ETH") throw new Error("Swap ETH or USDC or WETH into USDC or WETH");
  const me = deviceAccount().address;
  const tokenIn = from === "ETH" ? TOKEN.WETH : TOKEN[from];
  const swap: TxPlan = {
    label: `Swap ${from} for ${to}`, to: ROUTER, value: from === "ETH" ? amountIn : undefined, // router wraps ETH itself
    data: encodeFunctionData({ abi: routerAbi, functionName: "exactInputSingle",
      args: [{ tokenIn, tokenOut: TOKEN[to], fee: POOL_FEE, recipient: me, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] }),
  };
  if (from === "ETH") return [swap];
  const c = createPublicClient({ chain: sepolia, transport: anonTransport(config.readUrl, newIsolationKey()) });
  const allowance = await c.readContract({ address: tokenIn, abi: erc20Abi, functionName: "allowance", args: [me, ROUTER] });
  const approve: TxPlan = { label: `Allow Uniswap to use ${from}`, to: tokenIn,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ROUTER, amountIn] }) };
  return allowance >= amountIn ? [swap] : [approve, swap];
}

export type Route = "private" | "public";

/** Sign each step on this device and send it. Returns the tx hashes in order. */
export async function execute(plan: TxPlan[], route: Route, onStep?: (s: string) => void): Promise<Hex[]> {
  const account = deviceAccount();
  const key = newIsolationKey(); // one route for this trade's prep reads; unlinkable from anything else
  const reader = createPublicClient({ chain: sepolia, transport: anonTransport(config.readUrl, key) });
  const sender = new RpcClient(route === "private" ? config.sendUrl : config.readUrl, anonFetch, newIsolationKey());
  let nonce = await reader.getTransactionCount({ address: account.address, blockTag: "pending" });
  const fees = await reader.estimateFeesPerGas();
  const hashes: Hex[] = [];
  for (const step of plan) {
    onStep?.(`${step.label}: signing on this device`);
    const gas = await reader.estimateGas({ account: account.address, to: step.to, data: step.data, value: step.value })
      .catch(() => 250_000n); // the swap after an approve can't be estimated until the approve lands
    const signed = await account.signTransaction({
      chainId: sepolia.id, type: "eip1559", nonce: nonce++, to: step.to, data: step.data, value: step.value ?? 0n,
      gas: (gas * 12n) / 10n, maxFeePerGas: fees.maxFeePerGas! * 2n, maxPriorityFeePerGas: fees.maxPriorityFeePerGas! * 2n,
    });
    onStep?.(`${step.label}: sending ${route === "private" ? "privately via Flashbots Protect" : "to the public mempool"}`);
    hashes.push(await sender.call<Hex>("eth_sendRawTransaction", [signed]));
  }
  return hashes;
}
