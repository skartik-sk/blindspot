import { describe, expect, test } from "bun:test";
import { MAX_BOOT_FAILURES, initialBoot, onFailure, onSuccess } from "../src/lib/fallback";

const anon = () => true;
const TOPO = "NoxWorkerError: kps.exchange.failed on /topology: TOPOLOGY_FETCH_FAILED (all anchors)";

describe("Nox -> Nym fallback", () => {
  test("switches to Nym on the topology boot failure", () => {
    const r = onFailure(initialBoot("sphinx", false), TOPO, anon);
    expect(r.switchTo).toBe("nym");
    expect(r.state).toMatchObject({ network: "nym", fellBack: true });
  });

  test("switches after repeated failures with no success, even without a known error", () => {
    let s = initialBoot("sphinx", false);
    for (let i = 1; i < MAX_BOOT_FAILURES; i++) {
      const r = onFailure(s, "The call did not complete within 25000 ms", anon);
      expect(r.switchTo).toBeUndefined();
      s = r.state;
    }
    expect(onFailure(s, "timeout", anon).switchTo).toBe("nym");
  });

  test("never switches once Nox has worked in this session", () => {
    const s = onSuccess(initialBoot("sphinx", false));
    expect(onFailure(s, TOPO, anon).switchTo).toBeUndefined();
  });

  test("never overrides a network the user picked, or a non-Nox network", () => {
    expect(onFailure(initialBoot("sphinx", true), TOPO, anon).switchTo).toBeUndefined();
    expect(onFailure(initialBoot("nym", false), TOPO, anon).switchTo).toBeUndefined();
  });

  test("never falls back to a network that isn't anonymous", () => {
    expect(onFailure(initialBoot("sphinx", false), TOPO, () => false).switchTo).toBeUndefined();
  });

  test("switches only once", () => {
    const r = onFailure(initialBoot("sphinx", false), TOPO, anon);
    expect(onFailure(r.state, TOPO, anon).switchTo).toBeUndefined();
  });

  test("a network the user picks overrides an earlier fallback", () => {
    expect(initialBoot("sphinx", true, true)).toMatchObject({ network: "sphinx", fellBack: false });
  });

  test("a session that already fell back starts on Nym", () => {
    expect(initialBoot("sphinx", false, true)).toMatchObject({ network: "nym", fellBack: true });
  });
});
