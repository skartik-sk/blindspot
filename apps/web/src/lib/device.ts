// A key that lives only on this device, for sending. Demo-grade: stored in localStorage (README trade-offs).
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { addWallet, getState } from "./store";

const KEY = "bp.device.key";

export function deviceAccount() {
  let k = localStorage.getItem(KEY) as Hex | null;
  if (!k) localStorage.setItem(KEY, (k = generatePrivateKey()));
  return privateKeyToAccount(k);
}

/** Make sure the device wallet is in the portfolio (it's yours, so it's tracked like any other). */
export function ensureDeviceWallet() {
  const a = deviceAccount().address.toLowerCase() as Hex;
  if (!getState().wallets.some((w) => w.address === a)) addWallet({ address: a, label: "This device", kind: "device" });
}
