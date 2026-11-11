import { beforeEach, describe, expect, test } from "bun:test";

// A tiny localStorage for the pin store.
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };

const { currentPin, forgetPin, pinnedProvider, refreshPin } = await import("../src/lib/specifier");
const { SEL_HASH, SEL_RESOLVERS, decodeStrings, encodeStrings } = await import("../src/lib/resolvers");
const pins = (await import("../src/lib/pins.json")).default as Record<string, { address: string; workerHash: string; resolvers: string[] }>;

const NOX = pins.sphinx.address;

describe("pinned specifier", () => {
  beforeEach(() => mem.clear());

  test("answers the two startup reads from the pin, with our own copy first", async () => {
    const p = pinnedProvider("sphinx", NOX, "https://useblindspot.xyz/");
    expect(await p.request({ method: "eth_call", params: [{ to: NOX, data: SEL_HASH }, "latest"] })).toBe(pins.sphinx.workerHash);
    const list = decodeStrings(await p.request({ method: "eth_call", params: [{ to: NOX, data: SEL_RESOLVERS }, "latest"] }));
    expect(list[0]).toBe(`https://useblindspot.xyz/w/${pins.sphinx.workerHash.slice(2)}.js`);
    expect(list.slice(1)).toEqual(pins.sphinx.resolvers);
  });

  test("refuses anything else, so a pinned start never makes a direct request", async () => {
    const p = pinnedProvider("sphinx", NOX, "https://useblindspot.xyz/");
    await expect(p.request({ method: "eth_blockNumber" })).rejects.toThrow(/refusing/);
    await expect(p.request({ method: "eth_call", params: [{ to: "0x0000000000000000000000000000000000000001", data: SEL_HASH }] })).rejects.toThrow(/refusing/);
  });

  test("a newer pin learned through the mixnet is used next time; our old copy isn't offered for it", async () => {
    const newHash = "0x" + "ab".repeat(32);
    const newList = ["https://example.org/new.js"];
    const ethCall = async (_to: string, data: string) => (data === SEL_HASH ? newHash : encodeStrings(newList));
    expect(await refreshPin("sphinx", NOX, ethCall)).toBe("updated");
    expect(currentPin("sphinx")).toMatchObject({ workerHash: newHash, resolvers: newList, own: undefined });
    forgetPin("sphinx");
    expect(currentPin("sphinx")?.workerHash).toBe(pins.sphinx.workerHash);
  });

  test("an unchanged specifier leaves the pin alone", async () => {
    const ethCall = async () => pins.sphinx.workerHash;
    expect(await refreshPin("sphinx", NOX, ethCall)).toBe("same");
    expect(mem.size).toBe(0);
  });
});
