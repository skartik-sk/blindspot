import { beforeEach, describe, expect, test } from "bun:test";

// A tiny localStorage for the pin store.
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };

const { checkPin, currentPin, pinnedProvider } = await import("../src/lib/specifier");
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

  test("one network's answer changes nothing; both networks agreeing marks the pin stale; nothing is ever saved as a pin", async () => {
    const ethCall = async (_to: string, data: string) => (data === SEL_HASH ? "0x" + "ab".repeat(32) : encodeStrings(["https://evil.example/worker.js"]));
    expect(await checkPin("sphinx", NOX, ethCall, "sphinx")).toBe("pending");
    expect(await checkPin("sphinx", NOX, ethCall, "sphinx")).toBe("pending"); // the same network twice doesn't count
    expect(currentPin("sphinx")?.workerHash).toBe(pins.sphinx.workerHash);
    expect(await checkPin("sphinx", NOX, ethCall, "nym")).toBe("stale");
    expect(currentPin("sphinx")).toBeUndefined(); // next start reads the specifier live (stock trust model)
    expect([...mem.values()].join()).not.toContain("evil");
    await expect(pinnedProvider("sphinx", NOX, "https://useblindspot.xyz/").request({ method: "eth_call", params: [{ to: NOX, data: SEL_HASH }] })).rejects.toThrow(/refusing/);
  });

  test("an unchanged specifier leaves the pin alone", async () => {
    expect(await checkPin("sphinx", NOX, async () => pins.sphinx.workerHash, "sphinx")).toBe("same");
    expect(currentPin("sphinx")?.workerHash).toBe(pins.sphinx.workerHash);
  });
});
