// Serve the Anon-RPC worker code from our own site instead of a third-party CDN, without weakening anything.
// At boot the harness reads two values from the network's on-chain specifier: workerHash() and workerResolvers()
// (a list of URLs). It downloads the bundle from the first URL that answers and accepts it only if
// keccak256(bytes) equals workerHash. We leave the hash untouched (it still comes from the chain) and put our own copy
// of the same bytes first in the URL list. If our copy is ever stale, the hash check rejects it and the harness moves
// on to the original URLs, so this can't stop the app from starting. Pure ABI helpers, so it's testable.

export const SEL_RESOLVERS = "0x1c67ff29"; // workerResolvers()

/** Our copies, keyed by specifier address (lowercase). File name = the on-chain keccak256 of the bytes. */
export const LOCAL_BUNDLES: Record<string, string> = {
  "0x35133267a8f7ec35046a83dca0f4ca8a6e1b7a9a": "w/d9fa04b080a33062680a27cad828196bfb04615a0ebc76bcbffedb6dcbe838d4.js", // Nox (Sepolia)
  "0x3acd9742c68f6d993066ae25533e09b9e1f60ed0": "w/f13a448a8721b9d0b20da3d5b80ffe00bf4c5bb3aae812a38d3d1e3bc81fceb8.js", // Nym
};

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (h: string) => Uint8Array.from((h.startsWith("0x") ? h.slice(2) : h).match(/../g) ?? [], (x) => parseInt(x, 16));
const word = (n: number) => n.toString(16).padStart(64, "0");
const num = (b: Uint8Array, at: number) => Number(BigInt("0x" + hex(b.slice(at, at + 32))));

/** ABI-decode a `string[]` return value. */
export function decodeStrings(ret: string): string[] {
  const b = bytes(ret);
  const base = num(b, 0) + 32;
  const n = num(b, base - 32);
  return Array.from({ length: n }, (_, i) => {
    const at = base + num(b, base + 32 * i);
    return new TextDecoder().decode(b.slice(at + 32, at + 32 + num(b, at)));
  });
}

/** ABI-encode a `string[]` return value. */
export function encodeStrings(xs: string[]): string {
  const enc = xs.map((s) => {
    const d = hex(new TextEncoder().encode(s));
    return word(d.length / 2) + d.padEnd(Math.ceil(d.length / 64) * 64, "0");
  });
  let off = 32 * xs.length;
  const heads = enc.map((e) => { const h = word(off); off += e.length / 2; return h; });
  return "0x" + word(32) + word(xs.length) + heads.join("") + enc.join("");
}

/** The resolver list with our copy first (if we have one for this specifier). Anything malformed passes through. */
export function withLocalBundle(to: string, ret: string, siteBase: string): string {
  const file = LOCAL_BUNDLES[to.toLowerCase()];
  if (!file || typeof ret !== "string") return ret;
  try {
    const urls = decodeStrings(ret);
    const ours = new URL(file, siteBase).toString();
    return urls.includes(ours) ? ret : encodeStrings([ours, ...urls]);
  } catch {
    return ret;
  }
}
