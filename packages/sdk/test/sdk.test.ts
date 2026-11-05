import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import {
  BalHashMismatch,
  EMPTY_BAL_HASH,
  HeaderInvalid,
  verifyHeader,
  RpcClient,
  SEPOLIA_USDC,
  balanceSlot,
  findHits,
  hashBal,
  saleAccount,
  verifyBal,
  watchWindow,
  type BalJson,
  type Header,
} from "../src";
import fx from "./fixtures/block.json";

const header = fx.header as Header;
const bal = fx.bal as BalJson;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("BAL hash", () => {
  test("empty list matches the EIP constant", () => {
    expect(hashBal([])).toBe(EMPTY_BAL_HASH);
  });

  test("real Sepolia block verifies against its header", () => {
    expect(verifyBal(bal, header)).toBe(header.blockAccessListHash);
  });

  test("a tampered balance is rejected", () => {
    const bad = clone(bal);
    const acct = bad.find((a) => a.balanceChanges.length)!;
    acct.balanceChanges[0].value = "0x1";
    expect(() => verifyBal(bad, header)).toThrow(BalHashMismatch);
  });

  test("a dropped account is rejected", () => {
    expect(() => verifyBal(bal.slice(1), header)).toThrow(BalHashMismatch);
  });
});

describe("header", () => {
  test("real Sepolia header hashes to its own hash", () => {
    expect(verifyHeader(header, BigInt(header.number))).toBe(header.hash);
  });

  test("swapping in a different access-list hash breaks the header hash", () => {
    const bad = { ...header, blockAccessListHash: hashBal([]) };
    expect(() => verifyHeader(bad)).toThrow(HeaderInvalid);
  });

  test("a header for the wrong block number is rejected", () => {
    expect(() => verifyHeader(header, BigInt(header.number) + 1n)).toThrow(HeaderInvalid);
  });
});

describe("findHits", () => {
  const usdc = bal.find((a) => a.address.toLowerCase() === SEPOLIA_USDC.token)!;

  test("finds a USDC holder by its balance slot, without asking anyone", () => {
    // Recover a holder whose slot changed: the fixture block has USDC activity.
    // Build a synthetic list where we know the holder, since we can't invert keccak.
    const holder = "0x00000000000000000000000000000000000000aa" as Address;
    const key = `0x${balanceSlot(holder, 9n).toString(16)}` as const;
    const list: BalJson = [
      { ...clone(usdc), storageChanges: [{ key, changes: [{ index: "0x3", value: "0x1312d00" }] }] },
    ];
    const [h] = findHits(list, [holder]);
    expect(h.tokens[SEPOLIA_USDC.token]).toBe(20_000_000n); // 20 USDC
    expect(h.index).toBe(3);
  });

  test("masks the FiatToken blacklist bit", () => {
    const holder = "0x00000000000000000000000000000000000000bb" as Address;
    const key = `0x${balanceSlot(holder, 9n).toString(16)}` as const;
    const raw = (1n << 255n) | 5n;
    const list: BalJson = [
      { ...clone(usdc), storageChanges: [{ key, changes: [{ index: "0x1", value: `0x${raw.toString(16)}` }] }] },
    ];
    expect(findHits(list, [holder])[0].tokens[SEPOLIA_USDC.token]).toBe(5n);
  });

  test("finds an ETH balance change for a watched address in the real block", () => {
    const a = bal.find((x) => x.balanceChanges.length)!;
    const [h] = findHits(bal, [a.address]);
    expect(h.eth).toBe(BigInt(a.balanceChanges.at(-1)!.value));
  });

  test("an unwatched list yields nothing", () => {
    expect(findHits(bal, [saleAccount("test test test test test test test test test test test junk", 0).address])).toEqual([]);
  });
});

describe("watchWindow", () => {
  // Fake transport: serves the fixture block and records every request body (a mini spy log).
  function fakeRpc(tamper = false) {
    const seen: string[] = [];
    const n = BigInt(header.number);
    const fetchFn = async (_u: string, init: RequestInit) => {
      const { method, params } = JSON.parse(String(init.body));
      seen.push(`${method} ${JSON.stringify(params)}`);
      let result: unknown = null;
      if (BigInt(params[0]) === n) {
        if (method === "eth_getBlockByNumber") result = header;
        if (method === "eth_getBlockAccessList") result = tamper ? bal.slice(1) : bal;
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    };
    return { rpc: new RpcClient("http://fake", fetchFn), seen };
  }

  test("detects a payment and never sends the address", async () => {
    const target = bal.find((x) => x.balanceChanges.length)!.address;
    const { rpc, seen } = fakeRpc();
    const hits = await watchWindow({ rpc, addresses: [target], from: BigInt(header.number), blocks: 1 });
    expect(hits.length).toBe(1);
    expect(seen.join("\n").toLowerCase()).not.toContain(target.toLowerCase().slice(2));
  });

  test("hit is confirmed by an independent anchor", async () => {
    const target = bal.find((x) => x.balanceChanges.length)!.address;
    const anchored: boolean[] = [];
    await watchWindow({
      rpc: fakeRpc().rpc, anchor: fakeRpc().rpc, addresses: [target], from: BigInt(header.number), blocks: 1,
      onBlock: (b) => anchored.push(b.anchored),
    });
    expect(anchored).toEqual([true]);
  });

  test("a forged chain the anchor disagrees with is rejected", async () => {
    const target = bal.find((x) => x.balanceChanges.length)!.address;
    const other = { ...header, hash: hashBal([]) }; // anchor reports a different hash for this number
    const anchor = new RpcClient("http://anchor", async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: other })));
    await expect(
      watchWindow({ rpc: fakeRpc().rpc, anchor, addresses: [target], from: BigInt(header.number), blocks: 1 }),
    ).rejects.toThrow(HeaderInvalid);
  });

  test("refuses a list the header does not commit to", async () => {
    const { rpc } = fakeRpc(true);
    await expect(
      watchWindow({ rpc, addresses: [], from: BigInt(header.number), blocks: 1 }),
    ).rejects.toThrow(BalHashMismatch);
  });
});
