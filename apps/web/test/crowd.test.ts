import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import { ANONYMITY, MAX_BLOCKS, crowdFor } from "../src/lib/crowd";

const addr = (i: number) => `0x${i.toString(16).padStart(40, "0")}` as Address;
const cover = (n: number, per: number, start = 1000) =>
  Array.from({ length: n }, (_, i) => ({ address: addr(i + 1), history: Array.from({ length: per }, (_, j) => start + i * per + j) }));
const first = () => 0; // deterministic: always take the first remaining candidate

describe("history crowd", () => {
  test("always includes the real blocks and reaches the target crowd when cover allows", () => {
    const r = crowdFor([1, 2, 3], cover(20, 2), first);
    expect(r.crowd).toBe(ANONYMITY);
    for (const b of [1, 2, 3]) expect(r.blocks).toContain(b);
    for (const c of r.picked) for (const b of c.history) expect(r.blocks).toContain(b);
  });

  test("never exceeds the block cap, and reports the crowd it actually got", () => {
    const r = crowdFor([1, 2, 3, 4, 5, 6], cover(20, 6), first);
    expect(r.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
    expect(r.crowd).toBe(1 + r.picked.length);
  });

  test("skips a cover that would break the cap but keeps trying smaller ones", () => {
    const big = { address: addr(99), history: Array.from({ length: MAX_BLOCKS }, (_, i) => 5000 + i) };
    const r = crowdFor([1], [big, ...cover(3, 1)], first);
    expect(r.picked.map((c) => c.address)).not.toContain(big.address);
    expect(r.crowd).toBe(4);
  });

  test("with no cover, the crowd is 1 (the UI then asks before loading)", () => {
    expect(crowdFor([1, 2], [], first).crowd).toBe(1);
  });
});
