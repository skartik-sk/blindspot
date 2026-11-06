// Device key backup and import: pure helpers (no storage, no network, no logging) so they can be tested.
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

/** secp256k1 group order: a valid private key is 1 <= k < N. */
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export type Parsed = { ok: true; key: Hex; address: Address } | { ok: false; error: string };

/**
 * Accepts a bare key (with or without 0x, any case, surrounding spaces) or the text of a Blindspot backup file
 * (takes the value after "key:"). Returns the normalised key and its address, or a plain-language error.
 */
export function parsePrivateKey(input: string): Parsed {
  const text = input.trim();
  if (!text) return { ok: false, error: "Paste a private key or choose a backup file." };
  const fromFile = text.match(/key:\s*(0x)?([0-9a-fA-F]{64})\b/);
  const bare = text.match(/^(0x)?([0-9a-fA-F]+)$/);
  const hex = fromFile?.[2] ?? bare?.[2];
  if (!hex) return { ok: false, error: "That isn't a private key: it should be 64 hex characters (0-9, a-f)." };
  if (hex.length !== 64) return { ok: false, error: `A private key is 64 hex characters; this has ${hex.length}.` };
  const k = BigInt(`0x${hex}`);
  if (k === 0n || k >= N) return { ok: false, error: "That value isn't a valid Ethereum private key." };
  const key = `0x${hex.toLowerCase()}` as Hex;
  return { ok: true, key, address: privateKeyToAccount(key).address };
}

/** The backup file's text. Plain and human-readable, so it can also be printed or stored in a password manager. */
export function backupText(key: Hex, address: Address, when = new Date()) {
  return [
    "Blindspot device key: KEEP THIS SECRET",
    "Anyone with this key can move the funds in this wallet. Store it offline or in a password manager.",
    "",
    `address: ${address}`,
    `key: ${key}`,
    `saved: ${when.toISOString()}`,
    "",
  ].join("\n");
}
