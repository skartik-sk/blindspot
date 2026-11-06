import { describe, expect, test } from "bun:test";
import { BLOCK_MS, MAX_CATCH_UP, resumeFrom } from "../src/lib/resume";

describe("resume after background", () => {
  test("no block seen yet: start from the head", () => {
    expect(resumeFrom(undefined, 60_000)).toEqual({ skipped: 0 });
  });
  test("short break: continue right after the last verified block (nothing skipped)", () => {
    expect(resumeFrom(100n, 5 * BLOCK_MS)).toEqual({ from: 101n, skipped: 0 });
    expect(resumeFrom(100n, 0)).toEqual({ from: 101n, skipped: 0 });
  });
  test("long break: catch up at most MAX_CATCH_UP blocks", () => {
    const r = resumeFrom(100n, (MAX_CATCH_UP + 50) * BLOCK_MS);
    expect(r).toEqual({ from: 151n, skipped: 50 });
  });
});
