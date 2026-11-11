import { describe, expect, test } from "bun:test";
import { createProvider } from "../src/provider";

// Real Sepolia blocks with full transactions: an unrelated block, and the signed head with its two parents.
const fx = `${import.meta.dir}/fixtures`;
const raw = await Bun.file(`${fx}/block-fulltx.json`).json();
const block = raw.result ?? raw;
const [head, parent, grandparent] = await Bun.file(`${fx}/lc/chain-full.json`).json();
const chain = [head, parent, grandparent];

const calls: string[] = [];
const fakeFetch = (answer: (method: string) => unknown) => (async (_url: string, init: RequestInit) => {
  const { method, id } = JSON.parse(String(init.body));
  calls.push(method);
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: answer(method) }));
}) as any;

// A fake RPC that answers block reads from a set of real blocks (by number or hash).
const blockRpc = (blocks: any[], tamper: (b: any) => any = (b) => b) => (async (_url: string, init: RequestInit) => {
  const { method, params, id } = JSON.parse(String(init.body));
  const b = blocks.find((x) => (method === "eth_getBlockByHash" ? x.hash === params[0] : BigInt(x.number) === BigInt(params[0])));
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: b ? tamper(b) : null }));
}) as any;
const provider = (fetch: any, extra = {}) => createProvider({ url: "https://rpc.example", fetch, chainId: 11155111, ...extra });
const editTx = (i: number, edit: object) => (b: any) => ({ ...b, transactions: b.transactions.map((t: any, j: number) => (j === i ? { ...t, ...edit } : t)) });

describe("EIP-1193 provider", () => {
  test("answers chain id locally and refuses anything that signs", async () => {
    const p = provider(fakeFetch(() => null));
    calls.length = 0;
    expect(await p.request({ method: "eth_chainId" })).toBe("0xaa36a7");
    expect(await p.request({ method: "eth_accounts" })).toEqual([]);
    for (const m of ["eth_sendTransaction", "personal_sign", "eth_signTypedData_v4", "eth_requestAccounts"])
      await expect(p.request({ method: m })).rejects.toMatchObject({ code: 4200 });
    expect(calls).toEqual([]); // nothing left the device
  });

  test("passes other reads through the anonymous fetch", async () => {
    expect(await provider(fakeFetch(() => "0x1")).request({ method: "eth_getBalance", params: ["0x0000000000000000000000000000000000000001", "latest"] })).toBe("0x1");
  });

  test("a block whose header fields were edited is rejected", async () => {
    const p = provider(blockRpc([block], (b) => ({ ...b, gasUsed: "0x1" })));
    await expect(p.request({ method: "eth_getBlockByNumber", params: [block.number, false] })).rejects.toThrow(/header/);
  });

  test("a valid block at a different number or hash is rejected", async () => {
    const p = provider(fakeFetch(() => block));
    await expect(p.request({ method: "eth_getBlockByNumber", params: ["0x1", false] })).rejects.toThrow(/different block/);
    await expect(p.request({ method: "eth_getBlockByHash", params: ["0x" + "11".repeat(32), false] })).rejects.toThrow(/different block/);
  });
});

describe("provider: transactions and withdrawals", () => {
  test("a real block with 430 transactions verifies; a hashes-only read returns hashes taken from the verified body", async () => {
    const p = provider(blockRpc([block]));
    const full = (await p.request({ method: "eth_getBlockByNumber", params: [block.number, true] })) as any;
    expect(full.transactions.length).toBe(430);
    const hashes = (await p.request({ method: "eth_getBlockByNumber", params: [block.number, false] })) as any;
    expect(hashes.transactions).toEqual(block.transactions.map((t: any) => t.hash));
  }, 30_000);

  test("a dropped or edited transaction is caught by the root", async () => {
    const drop = provider(blockRpc([block], (b) => ({ ...b, transactions: b.transactions.slice(1) })));
    await expect(drop.request({ method: "eth_getBlockByNumber", params: [block.number, true] })).rejects.toThrow(/transactionsRoot/);
    await expect(provider(blockRpc([block], editTx(0, { value: "0x1" }))).request({ method: "eth_getBlockByNumber", params: [block.number, true] })).rejects.toThrow(/transactionsRoot/);
  });

  test("fields outside the signed bytes are checked too: hash, sender, block position, gas price", async () => {
    const t0 = block.transactions[0];
    const cases: [object, RegExp][] = [
      [{ hash: "0x" + "22".repeat(32) }, /hash/],
      [{ from: "0x000000000000000000000000000000000000dEaD" }, /sender/],
      [{ blockHash: "0x" + "33".repeat(32) }, /block position/],
      [{ transactionIndex: "0x5" }, /block position/],
      [{ gasPrice: "0x" + (BigInt(t0.gasPrice) + 1n).toString(16) }, /gas price/],
    ];
    for (const [edit, why] of cases)
      await expect(provider(blockRpc([block], editTx(0, edit))).request({ method: "eth_getBlockByNumber", params: [block.number, true] })).rejects.toThrow(why);
  }, 30_000);

  test("an edited withdrawal is caught", async () => {
    const p = provider(blockRpc([block], (b) => ({ ...b, withdrawals: [{ ...b.withdrawals[0], amount: "0x1" }, ...b.withdrawals.slice(1)] })));
    await expect(p.request({ method: "eth_getBlockByNumber", params: [block.number, false] })).rejects.toThrow(/withdrawalsRoot/);
  }, 30_000);
});

describe("provider: only verified data reaches the caller", () => {
  test("a missing or emptied withdrawals list is rejected (fails closed)", async () => {
    for (const tamper of [(b: any) => { const { withdrawals: _, ...rest } = b; return rest; }, (b: any) => ({ ...b, withdrawals: [] })])
      await expect(provider(blockRpc([block], tamper)).request({ method: "eth_getBlockByNumber", params: [block.number, false] })).rejects.toThrow(/withdrawals/);
  }, 30_000);

  test("keys nobody verified are dropped, in the block and in each transaction", async () => {
    const extra = (b: any) => ({ ...b, size: "0x1", totalDifficulty: "0x99", injected: "x",
      transactions: b.transactions.map((t: any, i: number) => (i === 0 ? { ...t, data: "0xdeadbeef", gasLimit: "0x1" } : t)) });
    const got = (await provider(blockRpc([block], extra)).request({ method: "eth_getBlockByNumber", params: [block.number, true] })) as any;
    for (const k of ["size", "totalDifficulty", "injected"]) expect(got[k]).toBeUndefined();
    expect(got.transactions[0].data).toBeUndefined();
    expect(got.transactions[0].gasLimit).toBeUndefined();
    expect(got.transactions[0].input).toBe(block.transactions[0].input);
  }, 30_000);
});

describe("provider: blocks proven by the light client", () => {
  const lightClient = { latest: async () => ({ hash: head.hash.toLowerCase(), number: BigInt(head.number) }) as any };

  test("latest is the signed head; an ancestor is proven by walking parent hashes", async () => {
    const p = provider(blockRpc(chain), { lightClient });
    expect(((await p.request({ method: "eth_getBlockByNumber", params: ["latest", false] })) as any).hash).toBe(head.hash);
    expect(((await p.request({ method: "eth_getBlockByNumber", params: [grandparent.number, false] })) as any).hash).toBe(grandparent.hash);
  }, 30_000);

  test("a block above the signed head isn't proven yet", async () => {
    const p = provider(blockRpc(chain), { lightClient: { latest: async () => ({ hash: grandparent.hash, number: BigInt(grandparent.number) }) as any } });
    await expect(p.request({ method: "eth_getBlockByNumber", params: [parent.number, false] })).rejects.toThrow(/isn't proven yet/);
  }, 30_000);

  test("an old block can't be proven: rejected, not passed through", async () => {
    // Signed head is 256 blocks above the block asked for.
    const p = provider(blockRpc([block, grandparent]), { lightClient: { latest: async () => ({ hash: block.hash, number: BigInt(block.number) }) as any } });
    await expect(p.request({ method: "eth_getBlockByHash", params: [grandparent.hash, false] })).rejects.toThrow(/more than 64/);
  }, 30_000);

  test("a valid block that isn't the signed head's parent breaks the walk", async () => {
    // The RPC answers "block head-1" with an unrelated (self-consistent) block.
    const p = provider(blockRpc(chain, (b) => (b === parent ? block : b)), { lightClient });
    await expect(p.request({ method: "eth_getBlockByNumber", params: [grandparent.number, false] })).rejects.toThrow(/ancestor/);
  }, 30_000);
});
