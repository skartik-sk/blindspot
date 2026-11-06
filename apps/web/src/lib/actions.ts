// Small app actions shared by several screens. Kept out of component files so React fast refresh stays clean.
import type { Address } from "viem";
import { rescan } from "./engine";
import { privateBalance } from "./lookup";
import { addWallet, setBalance, type Wallet } from "./store";

export async function loadBalance(a: Address) {
  const r = await privateBalance(a);
  setBalance(a, { eth: r.eth, usdc: r.usdc, weth: r.weth, block: r.block, source: r.via });
  return r;
}

export function watchWallet(w: Wallet) {
  addWallet(w);
  rescan(w.address);
}

export const ONBOARDED_KEY = "bp.onboarded.v1";
export const needsOnboarding = () => {
  try {
    return !localStorage.getItem(ONBOARDED_KEY);
  } catch {
    return false;
  }
};

export const GUIDE_KEY = "bp.guide.v1";
export type GuideFlags = { lookup?: boolean; spy?: boolean; hidden?: boolean };
export const readGuide = (): GuideFlags => { try { return JSON.parse(localStorage.getItem(GUIDE_KEY) ?? "{}"); } catch { return {}; } };
/** Mark a step done from anywhere (Lookup, Spy). */
export function markGuide(k: "lookup" | "spy") {
  try { localStorage.setItem(GUIDE_KEY, JSON.stringify({ ...readGuide(), [k]: true })); } catch {}
}
