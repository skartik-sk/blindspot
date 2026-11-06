import { describe, expect, test } from "bun:test";
import { PirClient, RpcClient, unpackBalances, verifyReceipts, type BalJson, type CompactReceipt, type PirTable } from "@bina/sdk";
import type { Address } from "viem";
import { PirStore } from "../src/pirstore";
import fx from "../../../packages/sdk/test/fixtures/block.json";
import rcpts from "../../../packages/sdk/test/fixtures/receipts.json";
import { bucket, createApp, type AppOptions } from "../src/app";
import { BlockCache } from "../src/relay";
import { SpyLog } from "../src/spy";

const N = BigInt(fx.header.number);
// Fixture receipts back in eth_getBlockReceipts shape.
const raw = (rcpts as CompactReceipt[]).map((r) => ({
  type: `0x${r.type.toString(16)}`, status: `0x${r.status}`, cumulativeGasUsed: r.gas,
  logs: r.logs.map(([address, topics, data]) => ({ address, topics, data })),
}));

function setup(over: Partial<AppOptions> = {}, tamper: boolean | "receipts" = false) {
  const upstreamCalls: string[] = [];
  const upstream = new RpcClient("http://up", async (_u, init) => {
    const { method, params } = JSON.parse(String(init.body));
    upstreamCalls.push(method);
    const result =
      method === "eth_blockNumber" ? fx.header.number
      : BigInt(params[0]) !== N ? null
      : method === "eth_getBlockByNumber" ? fx.header
      : method === "eth_getBlockAccessList" ? (tamper === true ? fx.bal.slice(1) : fx.bal)
      : method === "eth_getBlockReceipts" ? (tamper === "receipts" ? raw.slice(1) : raw)
      : "0x0";
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  });
  const cache = new BlockCache(upstream);
  const spy = new SpyLog();
  const app = createApp({ cache, spy, upstream, chainId: "0xaa36a7", ...over });
  const local = { requestIP: () => ({ address: "127.0.0.1" }) };
  const remote = { requestIP: () => ({ address: "203.0.113.9" }) };
  const post = (path: string, body: unknown, srv = remote) =>
    app(new Request(`http://r${path}`, { method: "POST", body: JSON.stringify(body) }), srv).then((r) => r.json() as any);
  const rpc = (method: string, params: unknown[] = []) => post("/", { jsonrpc: "2.0", id: 1, method, params });
  return { app, cache, spy, post, rpc, local, remote, upstreamCalls };
}

describe("relay", () => {
  test("serves the verified list and header for a polled block", async () => {
    const { cache, rpc } = setup();
    await cache.poll();
    expect((await rpc("eth_getBlockAccessList", [fx.header.number])).result.length).toBe(fx.bal.length);
    expect((await rpc("eth_getBlockByNumber", ["latest", false])).result.hash).toBe(fx.header.hash);
  });

  test("fetches each block from upstream only once", async () => {
    const { cache, rpc, upstreamCalls } = setup();
    await cache.poll();
    for (let i = 0; i < 5; i++) await rpc("eth_getBlockAccessList", [fx.header.number]);
    expect(upstreamCalls.filter((m) => m === "eth_getBlockAccessList").length).toBe(1);
  });

  test("refuses to cache a list that fails the hash check", async () => {
    const { cache } = setup({}, true);
    await expect(cache.poll()).rejects.toThrow();
    expect(cache.get(N)).toBeUndefined();
  });

  test("serves compact receipts that verify against the header", async () => {
    const { cache, rpc } = setup();
    await cache.poll();
    const r = (await rpc("bina_getReceipts", [fx.header.number])).result as CompactReceipt[];
    expect(r.length).toBe(raw.length);
    expect(() => verifyReceipts(r, fx.header as { receiptsRoot: `0x${string}` })).not.toThrow();
  });

  test("refuses to cache receipts that fail the root check", async () => {
    const { cache } = setup({}, "receipts");
    await expect(cache.poll()).rejects.toThrow();
    expect(cache.get(N)).toBeUndefined();
  });

  test("refuses address-carrying methods on the private lane", async () => {
    const { rpc } = setup();
    const r = await rpc("eth_getBalance", ["0x000000000000000000000000000000000000dEaD", "latest"]);
    expect(r.error.code).toBe(-32601);
  });

  test("spy log stores a salted tag, never the raw IP", async () => {
    const { rpc, spy } = setup();
    await rpc("eth_blockNumber");
    const [e] = spy.recent();
    expect(e.client).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(e)).not.toContain("203.0.113.9");
  });

  test("/spy is disabled without a configured token, even from localhost", async () => {
    const { app, remote, local } = setup();
    expect((await app(new Request("http://r/spy"), remote)).status).toBe(403);
    expect((await app(new Request("http://r/spy"), local)).status).toBe(403);
  });

  test("a spoofed x-forwarded-for can't dodge the rate limit behind a proxy", async () => {
    const { app } = setup({ rateLimit: 2, trustProxy: true });
    const call = (spoof: string) =>
      app(new Request("http://r/", { method: "POST", headers: { "x-forwarded-for": `${spoof}, 198.51.100.1` },
        body: JSON.stringify({ id: 1, method: "eth_blockNumber" }) }), {}).then((r) => r.json() as any);
    await call("1.1.1.1"); await call("2.2.2.2");
    expect((await call("3.3.3.3")).error?.code).toBe(-32005);
  });

  test("/spy accepts the configured token", async () => {
    const { app, remote } = setup({ spyToken: "s3cret" });
    expect((await app(new Request("http://r/spy?token=nope"), remote)).status).toBe(403);
    expect((await app(new Request("http://r/spy?token=s3cret"), remote)).status).toBe(200);
  });

  test("/naive is off unless enabled, and caps eth_getLogs ranges", async () => {
    const off = setup();
    expect((await off.app(new Request("http://r/naive", { method: "POST", body: "{}" }), off.remote)).status).toBe(404);
    const on = setup({ enableNaive: true });
    const r = await on.post("/naive", { id: 1, method: "eth_getLogs", params: [{ fromBlock: "0x0", toBlock: "0xffff" }] });
    expect(r.error.code).toBe(-32602);
  });

  test("rate limits per client", async () => {
    const { rpc } = setup({ rateLimit: 3 });
    for (let i = 0; i < 3; i++) expect((await rpc("eth_blockNumber")).error).toBeUndefined();
    expect((await rpc("eth_blockNumber")).error.code).toBe(-32005);
  });

  test("IPv6 spellings of the same /64 share one bucket", () => {
    const a = bucket("2001:db8:0:1::1");
    expect(bucket("2001:0db8:0000:0001:ffff::9")).toBe(a);
    expect(bucket("2001:db8::1:0:0:0:2")).toBe(a);
    expect(bucket("2001:DB8:0:1::5%eth0")).toBe(a);
    expect(bucket("2001:db8:0:2::1")).not.toBe(a);
    expect(bucket("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });
});

describe("public log", () => {
  const ADDR = "0x2077e1b9f57955d36dea89effd395ce43b64033d";
  const get = (app: ReturnType<typeof setup>["app"]) => app(new Request("http://r/log")).then((r) => r.json() as any);

  test("shows the bina lane only, with no addresses even in junk params", async () => {
    const { app, cache, rpc, post } = setup({ enableNaive: true });
    await cache.poll();
    await rpc("eth_getBlockAccessList", [fx.header.number]);
    await rpc("eth_getBlockByNumber", [ADDR, false]); // junk a client could send
    await post("/naive", { jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [ADDR, "latest"] });
    const { entries } = await get(app);
    expect(entries.length).toBe(2);
    expect(entries.every((e: any) => e.lane === undefined && e.client === undefined)).toBe(true);
    expect(entries[0].params).toEqual([fx.header.number]);
    expect(JSON.stringify(entries)).not.toMatch(/0x[0-9a-f]{40}/i);
  });

  test("needs no token, unlike /spy", async () => {
    const { app } = setup({ spyToken: "s3cret" });
    expect((await app(new Request("http://r/log"))).status).toBe(200);
    expect((await app(new Request("http://r/spy"))).status).toBe(403);
  });
});

describe("PIR", () => {
  const read = async (addrs: Address[]) =>
    new Map(addrs.map((a, i) => [a, { eth: BigInt(i + 1), usdc: BigInt(1000 + i), weth: 0n }]));
  test("indexes active accounts from the verified BAL and answers privately", async () => {
    const pir = new PirStore(read);
    const { app, spy } = setup({ pir });
    expect((await app(new Request("http://r/pir"))).status).toBe(503); // no table yet
    await pir.onBlock(N, fx.bal as BalJson);
    const t = (await (await app(new Request("http://r/pir"))).json()) as PirTable;
    expect(t.addresses.length).toBeGreaterThan(10);
    const i = 7;
    const c = await PirClient.create(1024);
    const res = await app(new Request("http://r/pir", { method: "POST", body: JSON.stringify(c.query(t, i)) }));
    const { answers } = (await res.json()) as { answers: `0x${string}`[] };
    const b = unpackBalances(c.decode(t, i, answers));
    expect(b.usdc).toBeGreaterThanOrEqual(1000n);
    // The operator's log has no address and no index.
    const logged = JSON.stringify(spy.recent());
    expect(logged).toContain("pir_query");
    expect(logged).not.toContain(t.addresses[i].slice(2));
  });
  test("rejects a query for an unknown epoch", async () => {
    const pir = new PirStore(read);
    const { app } = setup({ pir });
    await pir.onBlock(N, fx.bal as BalJson);
    const t = pir.table()!;
    const c = await PirClient.create(1024);
    const res = await app(new Request("http://r/pir", { method: "POST", body: JSON.stringify({ ...c.query(t, 0), epoch: 99 }) }));
    expect(res.status).toBe(400);
  });
});
