// Pending (mempool) transactions, compacted for a feed that every client downloads identically.
// Unverified by nature: nothing here is checked against a block. The app labels it "pending, unverified" and
// replaces it with the verified alert once the block lands.
import { decodeFunctionData, isAddress, parseAbi, type Address, type Hex } from "viem";

export interface PendingTx {
  hash: Hex;
  from: Address;
  to: Address | null;
  nonce: number;
  /** Wei, hex. */
  value: Hex;
  /** 4-byte selector, or "0x" for a plain transfer. */
  sel: Hex;
  /** Decoded Uniswap swap (exactInputSingle, direct or inside multicall). */
  swap?: { tokenIn: Address; tokenOut: Address; amountIn: Hex };
}

const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[])",
  "function multicall(bytes[] data) payable returns (bytes[])",
]);

function decodeSwap(input: Hex, depth = 0): PendingTx["swap"] {
  try {
    const d = decodeFunctionData({ abi: routerAbi, data: input });
    if (d.functionName === "exactInputSingle") {
      const p = d.args[0];
      return { tokenIn: p.tokenIn.toLowerCase() as Address, tokenOut: p.tokenOut.toLowerCase() as Address, amountIn: `0x${p.amountIn.toString(16)}` };
    }
    if (d.functionName === "multicall" && depth < 1) {
      const calls = (d.args.length === 2 ? d.args[1] : d.args[0]) as readonly Hex[];
      for (const c of calls) {
        const s = decodeSwap(c, depth + 1);
        if (s) return s;
      }
    }
  } catch {}
  return undefined;
}

const HEX = /^0x[0-9a-fA-F]*$/;

export function compactPending(tx: unknown): PendingTx | undefined {
  if (!tx || typeof tx !== "object") return undefined;
  const t = tx as Record<string, unknown>;
  if (typeof t.from !== "string" || !isAddress(t.from) || typeof t.hash !== "string" || !HEX.test(t.hash)) return undefined;
  const input = typeof t.input === "string" && HEX.test(t.input) ? (t.input as Hex) : "0x";
  const to = typeof t.to === "string" && isAddress(t.to) ? (t.to.toLowerCase() as Address) : null;
  return {
    hash: t.hash as Hex, from: t.from.toLowerCase() as Address, to,
    nonce: typeof t.nonce === "string" && HEX.test(t.nonce) ? Number(BigInt(t.nonce)) : 0,
    value: typeof t.value === "string" && HEX.test(t.value) ? (t.value as Hex) : "0x0",
    sel: (input.length >= 10 ? input.slice(0, 10) : "0x") as Hex,
    swap: input.length >= 10 ? decodeSwap(input) : undefined,
  };
}
