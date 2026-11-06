import { describe, expect, test } from "bun:test";
import { encodeFunctionData, parseAbi, type Address } from "viem";
import { compactPending, SEPOLIA_USDC, SEPOLIA_WETH } from "../src";

const router = "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e";
const abi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[])",
]);
const from = "0x00000000000000000000000000000000000000aa" as Address;
const single = encodeFunctionData({ abi, functionName: "exactInputSingle",
  args: [{ tokenIn: SEPOLIA_WETH.token, tokenOut: SEPOLIA_USDC.token, fee: 500, recipient: from, amountIn: 10n ** 15n, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }] });
const raw = (input: string, extra = {}) => ({ hash: "0x" + "11".repeat(32), from, to: router, nonce: "0x7", value: "0x38d7ea4c68000", input, ...extra });

describe("pending feed", () => {
  test("decodes a direct exactInputSingle swap", () => {
    const p = compactPending(raw(single))!;
    expect(p).toMatchObject({ from, to: router, nonce: 7, sel: "0x04e45aaf" });
    expect(p.swap).toEqual({ tokenIn: SEPOLIA_WETH.token, tokenOut: SEPOLIA_USDC.token, amountIn: "0x38d7ea4c68000" });
  });

  test("decodes a swap wrapped in multicall", () => {
    const wrapped = encodeFunctionData({ abi, functionName: "multicall", args: [9999999999n, [single]] });
    expect(compactPending(raw(wrapped))!.swap?.tokenOut).toBe(SEPOLIA_USDC.token);
  });

  test("keeps plain transfers small and drops calldata", () => {
    const p = compactPending(raw("0x", { to: "0x00000000000000000000000000000000000000bb" }))!;
    expect(p.swap).toBeUndefined();
    expect(p.sel).toBe("0x");
    expect(JSON.stringify(p).length).toBeLessThan(260);
  });

  test("rejects malformed entries", () => {
    expect(compactPending({ from: "nope" })).toBeUndefined();
    expect(compactPending(null)).toBeUndefined();
  });
});
