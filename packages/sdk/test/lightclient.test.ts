import { describe, expect, test } from "bun:test";
import { LightClient, SEPOLIA_BEACON, beaconRoot, branchOk } from "../src/lightclient";
import { verifyHeader } from "../src/header";

// Real Sepolia data from lodestar-sepolia.chainsafe.io (Gloas), saved Nov 11.
const dir = `${import.meta.dir}/fixtures/lc`;
const [checkpoint] = (await Bun.file(`${dir}/finalized.txt`).text()).trim().split(" ");
const bootstrap = await Bun.file(`${dir}/bootstrap.json`).json();
const optimistic = await Bun.file(`${dir}/optimistic.json`).json();
const exec = (await Bun.file(`${dir}/exec-header.json`).json()).result;

const served = (overrides: Record<string, unknown> = {}) => async (path: string) => {
  for (const [k, v] of Object.entries(overrides)) if (path.includes(k)) return v;
  if (path.includes("/bootstrap/")) return bootstrap;
  if (path.includes("optimistic_update")) return optimistic;
  throw new Error("unexpected " + path);
};

describe("light client", () => {
  test("the bootstrap header hashes to the pinned checkpoint", () => {
    expect("0x" + Buffer.from(beaconRoot(bootstrap.data.header.beacon)).toString("hex")).toBe(checkpoint);
  });

  test("verifies a real Gloas optimistic update: committee branch, execution branch, BLS signature", async () => {
    const lc = new LightClient({ get: served(), checkpoint: checkpoint as `0x${string}`, spec: SEPOLIA_BEACON });
    await lc.ready;
    const head = await lc.verifyUpdate(optimistic.data);
    expect(head.hash).toBe(optimistic.data.attested_header.execution_block_hash.toLowerCase());
    // The execution header from a normal RPC hashes to exactly what the committee signed.
    expect(verifyHeader(exec, BigInt(exec.number)).toLowerCase()).toBe(head.hash);
  }, 30_000);

  test("rejects a bootstrap that isn't the pinned checkpoint", async () => {
    const lc = new LightClient({ get: served(), checkpoint: ("0x" + "11".repeat(32)) as `0x${string}` });
    await expect(lc.ready).rejects.toThrow(/does not match the checkpoint/);
  });

  test("rejects a forged head: tampered block hash or tampered signature", async () => {
    const lc = new LightClient({ get: served(), checkpoint: checkpoint as `0x${string}` });
    await lc.ready;
    const forged = structuredClone(optimistic.data);
    forged.attested_header.execution_block_hash = "0x" + "ab".repeat(32);
    await expect(lc.verifyUpdate(forged)).rejects.toThrow(/execution branch/);
    const badSig = structuredClone(optimistic.data);
    badSig.sync_aggregate.sync_committee_signature = optimistic.data.sync_aggregate.sync_committee_signature.replace(/.$/, (c: string) => (c === "0" ? "1" : "0"));
    await expect(lc.verifyUpdate(badSig)).rejects.toThrow();
  }, 30_000);

  test("branch check fails on a wrong root", () => {
    const h = optimistic.data.attested_header;
    expect(branchOk(Buffer.from(h.execution_block_hash.slice(2), "hex"), h.execution_branch, 11, 808, h.beacon.body_root)).toBe(true);
    expect(branchOk(Buffer.from(h.execution_block_hash.slice(2), "hex"), h.execution_branch, 11, 808, h.beacon.state_root)).toBe(false);
  });
});
