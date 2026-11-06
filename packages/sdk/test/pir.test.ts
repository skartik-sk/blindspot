import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import { PirClient, packBalances, pirAnswer, pirLayout, unpackBalances, type PirTable } from "../src";

describe("PIR", () => {
  const count = 50;
  const { rows, cols } = pirLayout(count);
  const addresses = Array.from({ length: count }, (_, i) => `0x${i.toString(16).padStart(40, "0")}` as Address);
  const records = addresses.map((_, i) => packBalances({ eth: BigInt(i) * 10n ** 18n, usdc: BigInt(i) * 1_000_000n, weth: BigInt(i) }));
  const table: PirTable = { epoch: 1, block: "0x1", rows, cols, addresses };

  test("packs and unpacks balances", () => {
    const b = { eth: 123n * 10n ** 18n, usdc: 42_000_000n, weth: 7n };
    expect(unpackBalances(packBalances(b))).toEqual(b);
  });

  test("client gets exactly its record; query reveals only ciphertexts", async () => {
    const c = await PirClient.create(1024);
    for (const i of [0, 17, count - 1]) {
      const q = c.query(table, i);
      expect(q.q.length).toBe(cols);
      expect(new Set(q.q).size).toBe(cols); // every selector looks fresh, Enc(1) isn't distinguishable by value
      const rec = c.decode(table, i, pirAnswer(records, table, q));
      expect(unpackBalances(rec).usdc).toBe(BigInt(i) * 1_000_000n);
    }
  });

  test("server rejects malformed queries", async () => {
    const c = await PirClient.create(1024);
    const q = c.query(table, 3);
    expect(() => pirAnswer(records, table, { ...q, q: q.q.slice(1) })).toThrow("bad query size");
    expect(() => pirAnswer(records, table, { ...q, n: "0x10001" })).toThrow("bad modulus");
    expect(() => pirAnswer(records, table, { ...q, q: q.q.map(() => "0x0") })).toThrow("bad ciphertext");
  });
});
