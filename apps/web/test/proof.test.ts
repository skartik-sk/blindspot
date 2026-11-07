import { describe, expect, test } from "bun:test";
import { compare, shown, type Proof } from "../src/lib/proof";

const pir = { eth: 100n, usdc: 5n, weth: 0n };
const un: Proof = { status: "unproven" };

describe("PIR proof badge", () => {
  test("a matching verified value proves the answer", () => {
    expect(compare(pir, 1000, 990, { block: 990, eth: 100n }, un)).toEqual({ status: "proven", block: 990 });
  });
  test("a different value at or before the PIR block is a mismatch, and the verified value is shown", () => {
    const p = compare(pir, 1000, 990, { block: 995, eth: 70n }, un);
    expect(p).toEqual({ status: "mismatch", block: 995, verified: { eth: 70n } });
    expect(shown(pir, p)).toEqual({ eth: 70n, usdc: 5n, weth: 0n });
  });
  test("a mismatch stays a mismatch", () => {
    const p = compare(pir, 1000, 990, { block: 995, eth: 70n }, un);
    expect(compare(pir, 1000, 990, { block: 1001, eth: 100n }, p).status).toBe("mismatch");
  });
  test("a change after the PIR block is an update, not an accusation", () => {
    const p = compare(pir, 1000, 990, { block: 1005, usdc: 9n }, { status: "proven", block: 990 });
    expect(p).toEqual({ status: "updated", block: 1005, verified: { usdc: 9n } });
    expect(shown(pir, p).usdc).toBe(9n);
  });
  test("blocks older than the record's last activity are ignored", () => {
    expect(compare(pir, 1000, 990, { block: 980, eth: 1n }, un)).toBe(un);
  });
  test("a block with no balance fields changes nothing", () => {
    expect(compare(pir, 1000, 990, { block: 995 }, un)).toBe(un);
  });
});
