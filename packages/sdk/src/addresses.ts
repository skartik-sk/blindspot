// Born-private addresses: one fresh HD-derived account per sale. Keys never leave the device.
import { generateMnemonic, english, mnemonicToAccount } from "viem/accounts";

export const newMnemonic = () => generateMnemonic(english);

/** m/44'/60'/0'/0/{index} — one index per sale. */
export const saleAccount = (mnemonic: string, index: number) =>
  mnemonicToAccount(mnemonic, { addressIndex: index });

/** Random per-sale isolation key for Anon-RPC, so two sales' traffic can't be linked. */
export const newIsolationKey = () => crypto.randomUUID();
