import { describe, expect, test } from "bun:test";
import { decodeStrings, encodeStrings, withOwnCopy } from "../src/lib/resolvers";

const urls = [
  "https://raw.githubusercontent.com/hisoka-io/anon-rpc/keccak/b2/37cc68d2539aca6f6513cfcc953a6799d6ec8fe8c0d320d277e7e3da467ba6",
  "https://cdn.jsdelivr.net/npm/@hisoka-io/anon-rpc-worker@0.4.2/dist/anon-rpc-worker.js",
];

describe("specifier ABI helpers", () => {
  test("string[] encodes and decodes", () => {
    expect(decodeStrings(encodeStrings(urls))).toEqual(urls);
    expect(decodeStrings(encodeStrings([]))).toEqual([]);
  });
  test("our own copy goes first, once, and every original URL stays", () => {
    const ours = "https://useblindspot.xyz/w/b237.js";
    expect(withOwnCopy(urls, ours)).toEqual([ours, ...urls]);
    expect(withOwnCopy([ours, ...urls], ours)).toEqual([ours, ...urls]);
    expect(withOwnCopy(urls, undefined)).toEqual(urls);
  });
});
