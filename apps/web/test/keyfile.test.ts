import { describe, expect, test } from "bun:test";
import { privateKeyToAccount } from "viem/accounts";
import { backupText, parsePrivateKey } from "../src/lib/keyfile";

const KEY = "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
const ADDR = privateKeyToAccount(KEY).address;

describe("device key import", () => {
  test("accepts a key with or without 0x, any case, with spaces", () => {
    for (const k of [KEY, KEY.slice(2), `  ${KEY.toUpperCase().replace("0X", "0x")}\n`]) {
      const r = parsePrivateKey(k);
      expect(r).toEqual({ ok: true, key: KEY, address: ADDR });
    }
  });

  test("reads our own backup file", () => {
    expect(parsePrivateKey(backupText(KEY, ADDR))).toEqual({ ok: true, key: KEY, address: ADDR });
  });

  test("rejects wrong lengths, non-hex, zero and out-of-range keys with a clear reason", () => {
    expect(parsePrivateKey("")).toMatchObject({ ok: false });
    expect(parsePrivateKey("0x1234")).toMatchObject({ ok: false, error: expect.stringContaining("64 hex") });
    expect(parsePrivateKey("hello world")).toMatchObject({ ok: false, error: expect.stringContaining("isn't a private key") });
    expect(parsePrivateKey("0x" + "0".repeat(64))).toMatchObject({ ok: false, error: expect.stringContaining("isn't a valid") });
    expect(parsePrivateKey("0x" + "f".repeat(64))).toMatchObject({ ok: false, error: expect.stringContaining("isn't a valid") });
  });

  test("an address or a seed phrase is not mistaken for a key", () => {
    expect(parsePrivateKey(ADDR)).toMatchObject({ ok: false });
    expect(parsePrivateKey("test test test test test test test test test test test junk")).toMatchObject({ ok: false });
  });

  test("the backup file names the address and warns", () => {
    const t = backupText(KEY, ADDR, new Date("2026-11-07T00:00:00Z"));
    expect(t).toContain(`address: ${ADDR}`);
    expect(t).toContain(`key: ${KEY}`);
    expect(t).toContain("KEEP THIS SECRET");
  });
});
