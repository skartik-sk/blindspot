// Balance lookups that don't tie an address to you.
//   1. PIR against the relay's table: the relay computes over every row and never learns which one you read.
//   2. Fallback for addresses not in the table: ask a public node through the mixnet on a fresh route.
//      The node learns the address, but not who asked, and two such lookups can't be linked.
import { PirClient, RpcClient, SEPOLIA_USDC, SEPOLIA_WETH, newIsolationKey, unpackRecord, type PirTable } from "@bina/sdk";
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { anonFetch } from "./anon";
import { config } from "./config";

export interface LookupResult {
  eth: bigint;
  usdc: bigint;
  weth: bigint;
  block?: string;
  via: "pir" | "mixnet";
  /** Recent active blocks (newest first), from the PIR record. Only for directory addresses. */
  history?: number[];
  /** Other directory addresses' histories from the same PIR reply: cover for fetching this one's blocks. */
  cover?: { address: Address; history: number[] }[];
  /** What the answering server received. */
  serverSaw: string;
  ms: number;
  steps: { label: string; ms: number }[];
}

let table: { t: PirTable; at: number } | undefined;

export async function pirTable(force = false): Promise<PirTable | undefined> {
  if (!config.relayUrl) return undefined;
  if (!force && table && Date.now() - table.at < 30_000) return table.t;
  const r = await anonFetch(new URL("/pir", config.relayUrl).toString(), { method: "GET", anonOptions: { isolationKey: newIsolationKey() } });
  if (!r.ok) throw new Error(`PIR table: ${r.status}`);
  table = { t: (await r.json()) as PirTable, at: Date.now() };
  return table.t;
}

export async function pirLookup(address: Address, onStep?: (s: string) => void): Promise<LookupResult | undefined> {
  const t0 = performance.now();
  const steps: LookupResult["steps"] = [];
  const mark = (label: string, from: number) => (steps.push({ label, ms: Math.round(performance.now() - from) }), performance.now());
  onStep?.("Downloading the public directory");
  const t = await pirTable(true);
  if (!t) return undefined;
  let at = mark(`Directory: ${t.addresses.length} addresses`, t0);
  const index = t.addresses.indexOf(address.toLowerCase() as Address);
  if (index < 0) return undefined;
  onStep?.("Generating a one-time key");
  const c = await PirClient.create(1024);
  at = mark("One-time Paillier key", at);
  onStep?.("Encrypting the query");
  const q = c.query(t, index);
  at = mark(`${q.q.length} encrypted selectors`, at);
  onStep?.("Server is computing over every row");
  const r = await anonFetch(new URL("/pir", config.relayUrl!).toString(), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q),
    anonOptions: { isolationKey: newIsolationKey() },
  });
  const j = (await r.json()) as { answers?: Hex[]; error?: string };
  if (!j.answers) throw new Error(j.error ?? `PIR query failed (${r.status})`);
  at = mark(`Server answered ${j.answers.length} rows`, at);
  const at0 = parseInt(t.block, 16);
  const b = unpackRecord(c.decode(t, index, j.answers), at0);
  const cover = c.decodeColumn(t, index, j.answers).filter((x) => x.index !== index)
    .map((x) => ({ address: t.addresses[x.index], history: unpackRecord(x.record, at0).history })).filter((x) => x.history.length > 0);
  mark("Decrypted one row on this device", at);
  return { ...b, cover, block: t.block, via: "pir", ms: Math.round(performance.now() - t0), steps,
    serverSaw: `epoch ${t.epoch} and ${q.q.length} ciphertexts. No address, no row number.` };
}

export async function mixnetLookup(address: Address): Promise<LookupResult> {
  const t0 = performance.now();
  const rpc = new RpcClient(config.readUrl, anonFetch, newIsolationKey()); // fresh route per lookup
  const call = (token: Address) =>
    rpc.call<Hex>("eth_call", [{ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [address] }) }, "latest"]);
  const [eth, usdc, weth, head] = await Promise.all([
    rpc.call<Hex>("eth_getBalance", [address, "latest"]), call(SEPOLIA_USDC.token), call(SEPOLIA_WETH.token), rpc.blockNumber(),
  ]);
  const ms = Math.round(performance.now() - t0);
  return { eth: BigInt(eth), usdc: BigInt(usdc), weth: BigInt(weth), block: head.toString(), via: "mixnet", ms,
    steps: [{ label: "3 reads on one fresh mixnet route", ms }],
    serverSaw: "This address, from a mixnet exit. Not your IP, and not linkable to your other lookups." };
}

/** PIR when possible, else a fresh mixnet route. */
export async function privateBalance(address: Address, onStep?: (s: string) => void): Promise<LookupResult> {
  try {
    const r = await pirLookup(address, onStep);
    if (r) return r;
  } catch (e) {
    console.warn("PIR unavailable:", (e as Error).message);
  }
  onStep?.("Not in the private directory; asking on a fresh mixnet route");
  return mixnetLookup(address);
}
