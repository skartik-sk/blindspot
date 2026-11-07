import { describe, expect, test } from "bun:test";
import { MAX_SWITCHES, PROBE_MS, decide, initialFailover, onProgress } from "../src/lib/failover";

const anon = () => true;
const ok = { failedReads: 0, sinceProgressMs: 1_000 };
const failing = { failedReads: 3, sinceProgressMs: 1_000 };
const stalledNox = { failedReads: 0, sinceProgressMs: 61_000 };

describe("mid-session failover", () => {
  test("switches Nox -> Nym after 3 failed reads", () => {
    const d = decide(initialFailover("sphinx"), failing, false, anon, 0);
    expect(d.kind).toBe("switch");
    if (d.kind === "switch") {
      expect(d.to).toBe("nym");
      expect(d.reason).toBe("Nox stopped responding");
      expect(d.next.probeAt).toBe(PROBE_MS);
    }
  });

  test("switches after ~60 s without a verified block on Nox, but gives Nym longer", () => {
    expect(decide(initialFailover("sphinx"), stalledNox, false, anon, 0).kind).toBe("switch");
    expect(decide({ ...initialFailover("sphinx"), active: "nym" }, stalledNox, false, anon, 0).kind).toBe("none");
  });

  test("does nothing while healthy", () => {
    expect(decide(initialFailover("sphinx"), ok, false, anon, 0).kind).toBe("none");
  });

  test("goes back to Nox when the retry is due, and stays once it works", () => {
    const away = (decide(initialFailover("sphinx"), failing, false, anon, 0) as { next: ReturnType<typeof initialFailover> }).next;
    expect(decide(away, ok, false, anon, PROBE_MS - 1).kind).toBe("none");
    const back = decide(away, ok, false, anon, PROBE_MS);
    expect(back.kind).toBe("switch");
    if (back.kind !== "switch") return;
    expect(back.to).toBe("sphinx");
    const recovered = onProgress(back.next);
    expect(recovered).toMatchObject({ active: "sphinx", probes: 0, probeAt: undefined, reason: undefined });
  });

  test("a failed retry of Nox backs off before the next one", () => {
    const away = (decide(initialFailover("sphinx"), failing, false, anon, 0) as any).next;
    const retry = (decide(away, ok, false, anon, PROBE_MS) as any).next;
    const again = decide(retry, failing, false, anon, PROBE_MS + 5_000);
    expect(again.kind).toBe("switch");
    if (again.kind === "switch") expect(again.next.probeAt).toBe(PROBE_MS + 5_000 + 2 * PROBE_MS);
  });

  test("respects a network the user picked: suggests, never switches", () => {
    const d = decide(initialFailover("sphinx"), failing, true, anon, 0);
    expect(d).toEqual({ kind: "suggest", to: "nym", reason: "Nox stopped responding" });
  });

  test("never switches to a network that isn't anonymous, and never from one with no pair", () => {
    expect(decide(initialFailover("sphinx"), failing, false, () => false, 0).kind).toBe("none");
    expect(decide(initialFailover("tor"), failing, false, anon, 0).kind).toBe("none");
    expect(decide(initialFailover("passthrough" as any), failing, false, anon, 0).kind).toBe("none");
  });

  test("stops flapping when both networks are down", () => {
    const s = { ...initialFailover("sphinx"), recent: Array.from({ length: MAX_SWITCHES }, (_, i) => i * 1000) };
    expect(decide(s, failing, false, anon, 10_000).kind).toBe("stuck");
    // the window passes: switching is allowed again
    expect(decide(s, failing, false, anon, 10_000 + 16 * 60_000).kind).toBe("switch");
  });
});
