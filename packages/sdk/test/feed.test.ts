import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import {
  ReceiptsMismatch,
  follow,
  RpcClient,
  feedFromReceipts,
  orderedTrieRoot,
  receiptsRoot,
  scanBlock,
  verifiedBlock,
  verifyReceipts,
  type BalJson,
  type CompactReceipt,
  type Header,
} from "../src";
import fx from "./fixtures/block.json";
import rcpts from "./fixtures/receipts.json";

const header = fx.header as Header;
const bal = fx.bal as BalJson;
const rs = rcpts as CompactReceipt[];
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("receipts root", () => {
  test("real Sepolia block matches header.receiptsRoot", () => {
    expect(receiptsRoot(rs)).toBe(header.receiptsRoot);
    expect(() => verifyReceipts(rs, header)).not.toThrow();
  });
  test("empty list = empty trie root", () => {
    expect(orderedTrieRoot([])).toBe("0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421");
  });
  test("editing a log's amount is detected", () => {
    const bad = clone(rs);
    const r = bad.find((x) => x.logs.length)!;
    r.logs[0][2] = `0x${"0".repeat(63)}1`;
    expect(() => verifyReceipts(bad, header)).toThrow(ReceiptsMismatch);
  });
  test("hiding a receipt's logs is detected", () => {
    const bad = clone(rs);
    bad.find((x) => x.logs.length)!.logs = [];
    expect(() => verifyReceipts(bad, header)).toThrow(ReceiptsMismatch);
  });
  test("non-canonical hex is rejected before hashing", () => {
    const bad = clone(rs);
    const r = bad.find((x) => x.logs.length)!;
    r.logs[0][1][0] = r.logs[0][1][0].toUpperCase().replace("0X", "0x") as never;
    expect(() => verifyReceipts(bad, header)).toThrow(/non-canonical/);
  });
  test("dropping a receipt is detected", () => {
    expect(() => verifyReceipts(rs.slice(1), header)).toThrow(ReceiptsMismatch);
  });
});

describe("feed", () => {
  const feed = feedFromReceipts(rs);
  test("extracts transfers and v2/v3 swaps", () => {
    expect(feed.filter((f) => f.kind === "swap").length).toBe(5);
    expect(feed.some((f) => f.kind === "swap" && f.dex === "v3")).toBe(true);
    expect(feed.filter((f) => f.kind === "transfer").length).toBeGreaterThan(50);
  });
  test("a swap's trader is found from the BAL nonce change, not from the relay", () => {
    const trader = "0x389e7b207a77ca4ad4bb61d56fc05461a6f20787" as Address;
    const [a] = scanBlock(bal, feed, [trader]);
    expect(a.sent).toEqual([61]);
    expect(a.swapped).toBe(true);
    expect(a.items.some((f) => f.kind === "swap" && f.dex === "v3")).toBe(true);
  });
  test("unwatched wallets produce nothing", () => {
    expect(scanBlock(bal, feed, ["0x000000000000000000000000000000000000dead"])).toEqual([]);
  });
});

describe("verifiedBlock", () => {
  const fake = (receipts: unknown) =>
    new RpcClient("x", async (_u, init) => {
      const { method, id } = JSON.parse(init.body as string);
      const result = method === "eth_getBlockByNumber" ? header
        : method === "eth_getBlockAccessList" ? bal : receipts;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }));
    });
  test("accepts the honest block", async () => {
    const b = await verifiedBlock(fake(rs), BigInt(header.number), true);
    expect(b?.feed.length).toBe(feedFromReceipts(rs).length);
  });
  test("rejects a relay that hides a swap", async () => {
    const bad = clone(rs);
    bad[61].logs = [];
    expect(verifiedBlock(fake(bad), BigInt(header.number), true)).rejects.toThrow(ReceiptsMismatch);
  });
});

describe("follow", () => {
  const n = BigInt(header.number);
  const client = (h: typeof header) =>
    new RpcClient("x", async (_u, init) => {
      const { method, id, params } = JSON.parse(init.body as string);
      const mine = params[0] === header.number;
      const result = method === "eth_blockNumber" ? header.number
        : !mine ? null
        : method === "eth_getBlockByNumber" ? h
        : method === "eth_getBlockAccessList" ? bal : rs;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }));
    });
  const run = (anchor: RpcClient) =>
    new Promise<{ ok: boolean; err?: unknown }>((done) => {
      const ac = new AbortController();
      follow({ rpc: client(header), anchor, from: n, pollMs: 1, signal: ac.signal, compact: true,
        onBlock: (b) => (ac.abort(), done({ ok: b.anchored })),
        onError: (err) => (ac.abort(), done({ ok: false, err })) });
    });
  test("first block is accepted only when the anchor agrees", async () => {
    expect((await run(client(header))).ok).toBe(true);
    const r = await run(client({ ...header, hash: `0x${"ab".repeat(32)}` }));
    expect(String(r.err)).toContain("anchor disagrees");
  });
});
