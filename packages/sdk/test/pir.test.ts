import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import { HISTORY_SLOTS, PirClient, packBalances, packRecord, pirAnswer, pirLayout, unpackBalances, unpackRecord, type PirTable } from "../src";

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

describe("PIR records with history", () => {
  const b = { eth: 12345678901234567890n, usdc: 52_300_000n, weth: 7n };
  const at = 12_076_300;

  test("round-trips balances and recent active blocks, newest first", () => {
    const h = [12_076_299, 12_076_204, 12_070_001];
    expect(unpackRecord(packRecord(b, h, at), at)).toEqual({ ...b, history: h });
  });

  test("the snapshot block itself survives (offset 0 is not 'empty')", () => {
    expect(unpackRecord(packRecord(b, [at], at), at).history).toEqual([at]);
  });

  test("keeps at most the slot count, drops blocks out of range", () => {
    const h = Array.from({ length: 9 }, (_, i) => at - i);
    expect(unpackRecord(packRecord(b, h, at), at).history).toEqual(h.slice(0, HISTORY_SLOTS));
    expect(unpackRecord(packRecord(b, [at + 1, at - 2_000_000, at - 5], at), at).history).toEqual([at - 5]);
  });

  test("balance-only readers still read v2 records", () => {
    expect(unpackBalances(packRecord(b, [at - 1], at))).toEqual(b);
  });

  test("fits a 1024-bit Paillier plaintext and survives a PIR round trip", async () => {
    const r = packRecord({ eth: (1n << 128n) - 1n, usdc: (1n << 64n) - 1n, weth: (1n << 128n) - 1n }, [at, at - 1, at - 2, at - 3, at - 4, at - 5], at);
    expect(r.toString(2).length).toBeLessThan(1000);
    const addresses = Array.from({ length: 4 }, (_, i) => `0x${String(i).padStart(40, "0")}` as Address);
    const t: PirTable = { epoch: 1, block: "0x1", addresses, ...pirLayout(addresses.length) };
    const records = addresses.map((_, i) => (i === 2 ? r : packBalances(b)));
    const c = await PirClient.create(1024);
    const q = c.query(t, 2);
    expect(c.decode(t, 2, pirAnswer(records, t, q))).toBe(r);
  });
});
