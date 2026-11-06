// A key that lives only on this device, for sending. Demo-grade: stored in localStorage (README trade-offs).
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { addWallet, getState, setState } from "./store";

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

/** The device key, for the user's own backup. Never logged or sent anywhere. */
export const deviceKey = () => (deviceAccount(), localStorage.getItem(KEY) as Hex);

/**
 * Replace this device's key (already validated by parsePrivateKey). The old device wallet leaves the portfolio and the
 * new one takes its place; the caller reloads so every screen starts from the new key.
 */
export function importDeviceKey(key: Hex) {
  const old = deviceAccount().address.toLowerCase();
  localStorage.setItem(KEY, key);
  const next = privateKeyToAccount(key).address.toLowerCase() as Hex;
  setState((s) => ({
    wallets: [
      ...s.wallets.filter((w) => w.kind !== "device" && w.address.toLowerCase() !== old && w.address.toLowerCase() !== next),
      { address: next, label: "This device", kind: "device" as const },
    ],
    pendingTx: undefined,
  }));
}
