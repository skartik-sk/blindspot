import { describe, expect, test } from "bun:test";
import { WAIT_MS, pill } from "../src/lib/pill";

const base = { phase: "live" as const, head: "100", lastAt: 1_000, switching: false };

describe("status pill", () => {
  test("live while blocks arrive", () => {
    expect(pill({ ...base, now: 1_000 + WAIT_MS - 1 })).toEqual({ phase: "live", text: "Live", long: " · block 100" });
  });
  test("waiting after 60 s with no new verified block", () => {
    expect(pill({ ...base, now: 1_000 + 87_000 })).toEqual({ phase: "waiting", text: "Waiting · last block 87s ago" });
  });
  test("back to live when a block arrives", () => {
    expect(pill({ ...base, lastAt: 90_000, now: 91_000 }).phase).toBe("live");
  });
  test("switching network wins over live or reconnecting, paused wins over everything", () => {
    expect(pill({ ...base, now: 2_000, switching: true }).text).toBe("Switching network…");
    expect(pill({ ...base, phase: "error", now: 2_000, switching: true }).text).toBe("Switching network…");
    expect(pill({ ...base, phase: "paused", now: 2_000, switching: true }).text).toBe("Paused");
  });
  test("other phases keep their words", () => {
    expect(pill({ ...base, phase: "error", now: 2_000 }).text).toBe("Reconnecting");
    expect(pill({ ...base, phase: "connecting", now: 2_000 }).text).toBe("Connecting");
  });
});
