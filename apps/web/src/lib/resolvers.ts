// ABI helpers for the two specifier reads the Anon-RPC harness makes at boot: workerHash() and workerResolvers().
// specifier.ts answers them from pins; here we only encode and decode. Pure, so it's testable.

export const SEL_HASH = "0x3898587d"; // workerHash()
export const SEL_RESOLVERS = "0x1c67ff29"; // workerResolvers()

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

/** The resolver list with our own copy first. `ours` is undefined when we don't host this exact bundle. */
export const withOwnCopy = (resolvers: string[], ours?: string) => (ours && !resolvers.includes(ours) ? [ours, ...resolvers] : resolvers);
