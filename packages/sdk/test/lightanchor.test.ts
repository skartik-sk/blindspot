import { describe, expect, test } from "bun:test";
import { Contradiction, LightAnchor } from "../src/follow";

const h = (i: number) => ("0x" + i.toString(16).padStart(64, "0")) as `0x${string}`;
const chain = (from: number, to: number) => {
  const la = new LightAnchor();
  for (let n = from; n <= to; n++) la.add(BigInt(n), h(n), h(n - 1));
  return la;
};

describe("light-client anchoring of followed blocks", () => {
  test("a signed head anchors itself and every block that links back to it", () => {
    const la = chain(100, 105);
    expect(la.anchor({ hash: h(103), slot: 1, time: 0 }).map((x) => x.n)).toEqual([100n, 101n, 102n, 103n]);
    expect(la.isAnchored(104n)).toBe(false);
    expect(la.anchor({ hash: h(105), slot: 2, time: 0 }).map((x) => x.n)).toEqual([104n, 105n]);
  });

  test("a head we haven't seen yet anchors nothing (wait for the next one)", () => {
    expect(chain(100, 102).anchor({ hash: h(999), slot: 1, time: 0 })).toEqual([]);
  });

  test("a relay block the signed chain contradicts is caught", () => {
    const la = chain(100, 103);
    expect(() => la.anchor({ hash: h(777), number: 102n, slot: 1, time: 0 })).toThrow(/disagrees/);
    const forked = new LightAnchor();
    forked.add(100n, h(100), h(99));
    forked.add(101n, h(555), h(100)); // relay served a fake 101
    forked.add(102n, h(102), h(101)); // signed 102 points at the real 101
    expect(() => forked.anchor({ hash: h(102), slot: 1, time: 0 })).toThrow(/not an ancestor/);
    try { forked.anchor({ hash: h(102), slot: 1, time: 0 }); } catch (e) {
      expect(e).toBeInstanceOf(Contradiction);
      expect((e as Contradiction).n).toBe(101n); // the app is told exactly which block to flag
      expect((e as Contradiction).hash).toBe(h(555));
    }
  });
});
