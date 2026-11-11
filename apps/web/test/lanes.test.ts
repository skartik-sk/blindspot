import { describe, expect, test } from "bun:test";
import { BOOT_GRACE_MS, COLD_START_MS, DOWN_AFTER, KEEP_WARM_MS, PROBE_MIN_MS, WARM_AFTER_MS, activeLane, hedgeAfter, keepWarmDue, newLane, onResult, order, probeDue, started, wantStandby } from "../src/lib/lanes";

const up = (id: "sphinx" | "nym", ms = 500) => onResult(started(newLane(id), 0), true, ms, 1);

describe("lanes", () => {
  test("a lane is up only after a real success (probe before trust)", () => {
    const l = started(newLane("sphinx"), 0);
    expect(l.status).toBe("booting");
    expect(onResult(l, true, 400, 5).status).toBe("up");
  });

  test("goes down after repeated failures, or at once on a fatal network error", () => {
    let l = up("sphinx");
    for (let i = 0; i < DOWN_AFTER - 1; i++) l = onResult(l, false, 0, 10, "timed out");
    expect(l.status).toBe("up");
    l = onResult(l, false, 0, 10, "timed out");
    expect(l.status).toBe("down");
    expect(onResult(up("sphinx"), false, 0, 10, "NoTunnelExitError: No exit offers TLS tunnels").status).toBe("down");
  });

  test("a down lane is probed after its backoff, and the backoff grows", () => {
    let l = onResult(up("sphinx"), false, 0, 100, "TOPOLOGY_FETCH_FAILED");
    expect(probeDue(l, 100 + PROBE_MIN_MS - 1)).toBe(false);
    expect(probeDue(l, 100 + PROBE_MIN_MS)).toBe(true);
    const again = onResult(l, false, 0, 200, "TOPOLOGY_FETCH_FAILED");
    expect(again.backoffMs).toBe(PROBE_MIN_MS * 2);
    expect(onResult(again, true, 300, 300).status).toBe("up");
  });

  test("order prefers the preferred network when both are up, and skips down lanes", () => {
    const nox = up("sphinx", 600), nym = up("nym", 500);
    expect(order([nox, nym], "sphinx")).toEqual(["sphinx", "nym"]);
    const noxDown = onResult(nox, false, 0, 5, "No exit offers TLS tunnels");
    expect(order([noxDown, nym], "sphinx")).toEqual(["nym"]);
    expect(activeLane([noxDown, nym], "sphinx")).toBe("nym");
  });

  test("when every lane is down it still tries them, so the app recovers", () => {
    const a = onResult(up("sphinx"), false, 0, 5, "No exit offers"), b = onResult(up("nym"), false, 0, 5, "No exit offers");
    expect(order([a, b], "sphinx")).toEqual(["sphinx", "nym"]);
    expect(activeLane([a, b], "sphinx")).toBeUndefined();
  });

  test("the standby starts on the first failure, or when the primary is slow to start", () => {
    const standby = newLane("nym");
    expect(wantStandby(up("sphinx"), standby, 10)).toBe(false);
    expect(wantStandby(onResult(up("sphinx"), false, 0, 5), standby, 10)).toBe(true);
    const cold = started(newLane("sphinx"), 0);
    expect(wantStandby(cold, standby, COLD_START_MS - 1)).toBe(false);
    expect(wantStandby(cold, standby, COLD_START_MS)).toBe(true);
    expect(wantStandby(cold, started(standby, 1), COLD_START_MS)).toBe(false);
  });

  test("a network still starting gets a grace period for ordinary timeouts, but not for fatal errors", () => {
    let l = started(newLane("nym"), 0);
    for (let i = 0; i < DOWN_AFTER + 2; i++) l = onResult(l, false, 0, 30_000, "operation timed out");
    expect(l.status).toBe("booting");
    expect(onResult(l, false, 0, BOOT_GRACE_MS + 1, "operation timed out").status).toBe("down");
    expect(onResult(started(newLane("nym"), 0), false, 0, 1, "TOPOLOGY_FETCH_FAILED").status).toBe("down");
  });

  test("warm standby starts soon after the primary works, and idle lanes are kept warm", () => {
    const nox = { ...up("sphinx"), startedAt: 0 };
    expect(wantStandby(nox, newLane("nym"), WARM_AFTER_MS - 1, true)).toBe(false);
    expect(wantStandby(nox, newLane("nym"), WARM_AFTER_MS, true)).toBe(true);
    expect(wantStandby(nox, newLane("nym"), WARM_AFTER_MS, false)).toBe(false);
    const idle = onResult(started(newLane("nym"), 0), true, 500, 1_000);
    expect(keepWarmDue(idle, 1_000 + KEEP_WARM_MS - 1)).toBe(false);
    expect(keepWarmDue(idle, 1_000 + KEEP_WARM_MS)).toBe(true);
  });

  test("hedging waits a few times the usual latency, within bounds", () => {
    expect(hedgeAfter(up("sphinx", 500))).toBe(3_000);
    expect(hedgeAfter(up("sphinx", 4_000))).toBe(12_000);
    expect(hedgeAfter(started(newLane("nym"), 0))).toBe(20_000);
  });
});
