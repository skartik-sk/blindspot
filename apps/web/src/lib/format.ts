import { SEPOLIA_TOKENS } from "@bina/sdk";
import { formatUnits, type Address } from "viem";

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function fmtAmount(v: bigint, decimals: number, max = 4) {
  const n = Number(formatUnits(v, decimals));
  if (n === 0) return "0";
  if (Math.abs(n) < 10 ** -max) return `<${10 ** -max}`;
  return n.toLocaleString("en-IN", { maximumFractionDigits: n >= 1000 ? 2 : max });
}

export const decimalsOf = (token: Address) =>
  SEPOLIA_TOKENS.find((t) => t.token === token.toLowerCase())?.decimals ?? 18;

export const fmtToken = (v: bigint, token: Address) => fmtAmount(v, decimalsOf(token));

export const fmtBytes = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

export function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}
