// Spy log: records exactly what a provider would see per request, for the demo's side-by-side panel.
export interface SpyEntry {
  t: number;
  lane: "naive" | "bina";
  ip: string;
  method: string;
  params: unknown;
}

export class SpyLog {
  private entries: SpyEntry[] = [];
  private listeners = new Set<(e: SpyEntry) => void>();
  constructor(private max = 500) {}

  add(e: SpyEntry) {
    this.entries.push(e);
    if (this.entries.length > this.max) this.entries.shift();
    for (const fn of this.listeners) fn(e);
  }
  recent() {
    return [...this.entries];
  }
  subscribe(fn: (e: SpyEntry) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  clear() {
    this.entries = [];
  }
}
