// Light by default; the toggle choice is remembered on this device. index.html applies it before first paint.
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "bp.theme";
const subs = new Set<() => void>();

const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#0e0d18" : "#fbfafc");
  try { localStorage.setItem(KEY, t); } catch {}
  subs.forEach((f) => f());
}

export const useTheme = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), read);
