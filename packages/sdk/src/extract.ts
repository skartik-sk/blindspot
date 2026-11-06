// Find watched addresses inside a (verified) BAL, locally. Nothing about the address leaves the device.
import { encodeAbiParameters, keccak256, type Address } from "viem";
import type { BalJson } from "./bal";

export interface Erc20Slot {
  token: Address;
  /** Storage slot of the balances mapping. Circle FiatTokenV2_2 (USDC): 9. */
  mappingSlot: bigint;
  /** Mask applied to the raw value. FiatTokenV2_2 packs a blacklist flag in the top bit. */
  mask?: bigint;
}

export const SEPOLIA_USDC: Erc20Slot = {
  token: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
  mappingSlot: 9n,
  mask: (1n << 255n) - 1n,
};

/** WETH9: balanceOf mapping at slot 3 (checked against balanceOf on Sepolia). */
export const SEPOLIA_WETH: Erc20Slot = { token: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", mappingSlot: 3n };

export interface TokenInfo extends Erc20Slot {
  symbol: string;
  decimals: number;
}

/** Tokens whose balances the app can read straight from verified BALs (slot layout known). */
export const SEPOLIA_TOKENS: TokenInfo[] = [
  { ...SEPOLIA_USDC, symbol: "USDC", decimals: 6 },
  { ...SEPOLIA_WETH, symbol: "WETH", decimals: 18 },
];

export function balanceSlot(holder: Address, mappingSlot: bigint): bigint {
  return BigInt(
    keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [holder, mappingSlot])),
  );
}

export interface Hit {
  address: Address;
  /** Post-block ETH balance, if it changed in this block. */
  eth?: bigint;
  /** Post-block token balances keyed by token address, if they changed. */
  tokens: Record<Address, bigint>;
  /** Block access index of the last change (1..n = tx position + 1). */
  index: number;
}

const last = <T>(xs: T[]) => xs[xs.length - 1];

export function findHits(bal: BalJson, watched: Address[], tokens: Erc20Slot[] = [SEPOLIA_USDC]): Hit[] {
  const want = new Set(watched.map((a) => a.toLowerCase()));
  const byAddr = new Map(bal.map((a) => [a.address.toLowerCase(), a]));
  const hits = new Map<string, Hit>();
  const hit = (addr: string) => {
    let h = hits.get(addr);
    if (!h) hits.set(addr, (h = { address: addr as Address, tokens: {}, index: 0 }));
    return h;
  };

  // ETH: the address itself appears with a balance change.
  for (const addr of want) {
    const a = byAddr.get(addr);
    const c = a && last(a.balanceChanges);
    if (c) {
      const h = hit(addr);
      h.eth = BigInt(c.value);
      h.index = Math.max(h.index, Number(c.index));
    }
  }

  // ERC-20: the token contract has a storage change at balances[addr].
  for (const t of tokens) {
    const a = byAddr.get(t.token.toLowerCase());
    if (!a) continue;
    const slots = new Map(a.storageChanges.map((s) => [BigInt(s.key), s]));
    for (const addr of want) {
      const s = slots.get(balanceSlot(addr as Address, t.mappingSlot));
      const c = s && last(s.changes);
      if (!c) continue;
      const h = hit(addr);
      const raw = BigInt(c.value);
      h.tokens[t.token.toLowerCase() as Address] = t.mask ? raw & t.mask : raw;
      h.index = Math.max(h.index, Number(c.index));
    }
  }
  return [...hits.values()];
}
