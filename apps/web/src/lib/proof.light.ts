// The app's light client (one per tab): beacon data comes through Anon-RPC like everything else, from the endpoints
// in config.beaconUrls, starting at the checkpoint pinned in pins.json. See packages/sdk/src/lightclient.ts.
import { LightClient, newIsolationKey, type VerifiedHead } from "@blindspot/sdk";
import { anonFetch } from "./anon";
import { config } from "./config";
import pins from "./pins.json";

let lc: LightClient | undefined;
const subs = new Set<() => void>();
let state: { mode: "starting" | "light-client" | "second-provider"; head?: VerifiedHead; error?: string } = { mode: "starting" };
const set = (s: Partial<typeof state>) => { state = { ...state, ...s }; subs.forEach((f) => f()); };

/** Observable proof status for the Network page. */
export const proofState = { get: () => state, subscribe: (f: () => void) => (subs.add(f), () => subs.delete(f)) };

async function beaconGet(path: string) {
  let last: unknown;
  for (const base of config.beaconUrls) {
    try {
      const r = await anonFetch(base.replace(/\/$/, "") + path, { method: "GET", headers: { accept: "application/json" }, anonOptions: { isolationKey: newIsolationKey(), hedge: true } });
      if (!r.ok) throw new Error(`beacon ${r.status}`);
      return await r.json();
    } catch (e) { last = e; }
  }
  throw last;
}

/** The light client, or undefined if it isn't configured. Its `ready` rejects if the checkpoint can't be used. */
export function lightClient(): LightClient | undefined {
  const checkpoint = (pins as { beacon?: { checkpoint: `0x${string}` } }).beacon?.checkpoint;
  if (!checkpoint || !config.beaconUrls.length) return undefined;
  if (!lc) {
    lc = new LightClient({ get: beaconGet, checkpoint });
    const latest = lc.latest.bind(lc);
    lc.latest = async () => { const h = await latest(); set({ mode: "light-client", head: h, error: undefined }); return h; };
  }
  return lc;
}

export const proofFallback = (error: string) => set({ mode: "second-provider", error });
