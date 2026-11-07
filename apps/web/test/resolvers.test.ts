import { describe, expect, test } from "bun:test";
import { decodeStrings, encodeStrings, withLocalBundle } from "../src/lib/resolvers";

const NOX = "0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A";
const urls = [
  "https://raw.githubusercontent.com/hisoka-io/anon-rpc/keccak/d9/fa04b080a33062680a27cad828196bfb04615a0ebc76bcbffedb6dcbe838d4",
  "https://cdn.jsdelivr.net/npm/@hisoka-io/anon-rpc-worker@0.4.1/dist/anon-rpc-worker.js",
];

describe("self-hosted worker bundle", () => {
  test("string[] encodes and decodes", () => {
    expect(decodeStrings(encodeStrings(urls))).toEqual(urls);
    expect(decodeStrings(encodeStrings([]))).toEqual([]);
  });
  test("puts our copy first and keeps every original URL after it", () => {
    const out = decodeStrings(withLocalBundle(NOX, encodeStrings(urls), "https://useblindspot.xyz/"));
    expect(out[0]).toBe("https://useblindspot.xyz/w/d9fa04b080a33062680a27cad828196bfb04615a0ebc76bcbffedb6dcbe838d4.js");
    expect(out.slice(1)).toEqual(urls);
  });
  test("leaves other specifiers and malformed data alone", () => {
    const r = encodeStrings(urls);
    expect(withLocalBundle("0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e", r, "https://useblindspot.xyz/")).toBe(r);
    expect(withLocalBundle(NOX, "0xdead", "https://useblindspot.xyz/")).toBe("0xdead");
  });
});
