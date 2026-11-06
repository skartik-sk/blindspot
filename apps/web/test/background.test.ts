import { describe, expect, test } from "bun:test";
import { onVisibility, turnOn } from "../src/lib/background";

describe("background watching", () => {
  test("off: pauses when hidden, resumes when visible", () => {
    expect(onVisibility(true, false, true)).toBe("pause");
    expect(onVisibility(false, false, false)).toBe("resume");
  });
  test("on: keeps running while hidden", () => {
    expect(onVisibility(true, true, true)).toBe("none");
    expect(onVisibility(false, true, true)).toBe("none");
  });
  test("nothing to do when already in the right state", () => {
    expect(onVisibility(true, false, false)).toBe("none");
    expect(onVisibility(false, false, true)).toBe("none");
  });
  test("turning on asks for permission only when it's undecided", async () => {
    let asked = 0;
    const ask = async () => { asked++; return "granted" as const; };
    expect(await turnOn("default", ask)).toEqual({ on: true, perm: "granted" });
    expect(await turnOn("granted", ask)).toEqual({ on: true, perm: "granted" });
    expect(asked).toBe(1);
  });
  test("stays off when notifications are refused, blocked or unsupported", async () => {
    expect((await turnOn("default", async () => "denied")).on).toBe(false);
    expect((await turnOn("denied", async () => "granted")).on).toBe(false);
    expect((await turnOn("unsupported", async () => "granted")).on).toBe(false);
    expect((await turnOn("default", () => Promise.reject(new Error("x")))).on).toBe(false);
  });
});
