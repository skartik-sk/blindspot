// The live loop: follow the chain through Anon-RPC, verify every block, filter it here on the device.
// Requests name block numbers only. Which wallets you hold or watch never leaves this tab.
import { ETH_LOGGER, LightClientError, SEPOLIA_TOKENS, SEPOLIA_WETH, follow, newIsolationKey, scanBlock, type Activity, type PendingTx, type VerifiedBlock } from "@blindspot/sdk";
import type { Address } from "viem";
import { anonFetch, anonRpc, checkFailover, noteProgress, resetHealth } from "./anon";
import { resumeFrom } from "./resume";
import { lightClient, proofFallback } from "./proof.light";
import { seenFrom, type Seen } from "./proof";
import { keepWatching, onVisibility } from "./background";
import { config } from "./config";
import { fmtToken, short } from "./format";
import { resolveAll } from "./tokens";
import { getState, labelOf, setBalance, setState, type Alert, type Trader } from "./store";

let ac: AbortController | undefined;
/** Recent verified blocks, kept in memory so a newly watched wallet's recent trades show up without any request. */
const recent: VerifiedBlock[] = [];
const KEEP = 30;

const USDC = SEPOLIA_TOKENS[0].token;
const WETH = SEPOLIA_TOKENS[1].token;

export function startEngine() {
  // One loop per tab, even across dev hot reloads (a second loop would double every alert).
  const g = globalThis as { __bpEngine?: AbortController };
  g.__bpEngine?.abort();
  if (ac) return;
  run();
  // Pause while the app is hidden (no downloads in the background), catch up when it's visible again.
  if (typeof document !== "undefined" && !listening) {
    listening = true;
    document.addEventListener("visibilitychange", () => {
      // "Keep watching in background" (opt-in) keeps the loop running while hidden.
      const step = onVisibility(document.hidden, keepWatching(), !!ac);
      if (step === "pause") {
        hiddenAt = Date.now();
        ac?.abort();
        ac = undefined;
        setState((s) => ({ status: { ...s.status, phase: "paused", message: "Paused while in background" } }));
      } else if (step === "resume") {
        const { from, skipped } = resumeFrom(lastBlock, Date.now() - hiddenAt);
        run(from, skipped);
      }
    });
  }
}

let listening = false;
let hiddenAt = 0;
let lastBlock: bigint | undefined;

let useLightClient = true;

/** A signed head reached this block: mark its alerts and tape row anchored, matching number AND hash. */
function onAnchored(n: bigint, hash: string) {
  const block = n.toString(), h = hash.toLowerCase();
  const hit = (b: string, bh?: string) => b === block && bh === h;
  setState((st) => ({
    alerts: st.alerts.some((a) => hit(a.block, a.blockHash) && !a.anchored) ? st.alerts.map((a) => (hit(a.block, a.blockHash) ? { ...a, anchored: true } : a)) : st.alerts,
    tape: st.tape.some((t) => hit(t.number, t.hash) && !t.anchored) ? st.tape.map((t) => (hit(t.number, t.hash) ? { ...t, anchored: true } : t)) : st.tape,
  }));
}

/** The signed chain contradicts a block the relay served: flag every alert from it, loudly. */
function onContradiction(n: bigint, hash: string) {
  const h = hash.toLowerCase();
  setState((st) => ({
    alerts: st.alerts.map((a) => (a.blockHash === h ? { ...a, contradicted: true, anchored: false } : a)),
    status: { ...st.status, message: `Block ${n} from the relay doesn't match what the sync committee signed. Its alerts are flagged; treat this relay as untrusted.` },
  }));
}

function run(from?: bigint, skipped = 0) {
  const g = globalThis as { __bpEngine?: AbortController };
  ac = g.__bpEngine = new AbortController();
  setState((s) => ({ status: { ...s.status, phase: s.status.head ? "live" : "connecting",
    message: skipped ? `Catching up; skipped ${skipped} older blocks from the break` : s.status.head ? undefined : "Opening a route through the mixnet" } }));
  const rpc = anonRpc(config.feedUrl, newIsolationKey());
  const anchor = anonRpc(config.anchorUrl, newIsolationKey());
  const signal = ac.signal;
  // Block proof: the light client (sync committee signatures) when it starts; otherwise a second provider confirms
  // each block hash, as before. If the light client keeps failing later, the loop restarts on the second provider.
  const lc = useLightClient ? lightClient() : undefined;
  let lcErrors = 0;
  const lcStarted = Date.now();
  // Mid-session failover: if the mixnet stops delivering verified blocks, switch to the other anonymous network.
  resetHealth();
  const watchdog = setInterval(checkFailover, 5000);
  signal.addEventListener("abort", () => clearInterval(watchdog));
  follow({
    rpc, compact: config.feedCompact, signal, pollMs: 3000, from,
    ...(lc ? { lightClient: lc, onAnchored: (n: bigint, h: string) => { lcErrors = 0; onAnchored(n, h); }, onContradiction } : { anchor }),
    onBlock: (b) => { lastBlock = b.number; noteProgress(); return onBlock(b); },
    onError: (e, n) => {
      if (signal.aborted) return;
      const msg = (e as Error).message ?? String(e);
      // Only the light client's own failures count (never relay errors or contradictions), and any anchored block
      // resets them. If it has kept failing for 2 minutes the loop falls back to a second provider, says so, and
      // tries the light client again 10 minutes later.
      if (lc && e instanceof LightClientError && ++lcErrors >= 5 && Date.now() - lcStarted > 120_000) {
        useLightClient = false;
        setTimeout(() => { if (!useLightClient) { useLightClient = true; if (ac && !document.hidden) { ac.abort(); ac = undefined; run(lastBlock !== undefined ? lastBlock + 1n : undefined); } } }, 10 * 60_000);
        proofFallback(msg);
        setState((s) => ({ status: { ...s.status, message: "The light client isn't available, so a second provider now checks each block (see Network)." } }));
        ac?.abort(); ac = undefined;
        run(lastBlock !== undefined ? lastBlock + 1n : undefined);
        return;
      }
      // A not-yet-produced block is normal; anything else is worth showing.
      setState((s) => ({ status: { ...s.status, phase: s.status.phase === "live" ? "live" : "error", message: `Block ${n}: ${msg}` } }));
    },
  }).catch((e) => { if (!signal.aborted) setState(() => ({ status: { phase: "error", message: String(e) } })); });
  if (config.relayUrl) pollPending(signal);
}

const PENDING_POLL_MS = 2000;
const PENDING_TTL_MS = 5 * 60_000;

/**
 * Mempool alerts: every client downloads the same pending snapshot from the relay (no parameters) through
 * Anon-RPC and matches watched wallets locally. Unverified; replaced by the verified alert when the block lands.
 */
async function pollPending(signal: AbortSignal) {
  const url = new URL("/pending", config.relayUrl!).toString();
  const key = newIsolationKey();
  while (!signal.aborted) {
    const watched = new Set(getState().wallets.filter((w) => w.kind === "watch").map((w) => w.address.toLowerCase()));
    if (watched.size) {
      try {
        const r = await anonFetch(url, { method: "GET", anonOptions: { isolationKey: key } });
        const { txs } = (await r.json()) as { txs?: PendingTx[] };
        const found = (txs ?? []).filter((t) => watched.has(t.from)).map(describePending);
        const now = Date.now();
        setState((st) => {
          const fresh = found.filter((a) => !st.pendingAlerts.some((x) => x.id === a.id));
          if (fresh.length) notify(fresh);
          return { pendingAlerts: [...fresh, ...st.pendingAlerts].filter((a) => now - a.t < PENDING_TTL_MS).slice(0, 50) };
        });
      } catch {
        // The feed is best-effort; verified alerts still arrive with the block.
      }
    }
    await new Promise((ok) => setTimeout(ok, PENDING_POLL_MS));
  }
}

function describePending(t: PendingTx): Alert {
  const who = labelOf(t.from) ?? short(t.from);
  const value = BigInt(t.value);
  const base = { id: `p-${t.hash}`, hash: t.hash, pending: true, block: "pending", t: Date.now(), address: t.from, anchored: false };
  if (t.swap) {
    const tokenIn = t.swap.tokenIn === SEPOLIA_WETH.token && value > 0n ? ETH_LOGGER : t.swap.tokenIn;
    const sym = (a: Address) => (a === ETH_LOGGER ? "ETH" : SEPOLIA_TOKENS.find((x) => x.token === a)?.symbol ?? short(a));
    return { ...base, kind: "swap", title: `${who} is swapping`, detail: `${fmtToken(BigInt(t.swap.amountIn), tokenIn)} ${sym(tokenIn)} → ${sym(t.swap.tokenOut)}`,
      sold: { token: tokenIn, value: BigInt(t.swap.amountIn) }, bought: { token: t.swap.tokenOut, value: 0n } };
  }
  return { ...base, kind: "out", title: `${who} sent a transaction`,
    detail: value > 0n ? `${fmtToken(value, ETH_LOGGER)} ETH to ${t.to ? short(t.to) : "a new contract"}` : `Call to ${t.to ? short(t.to) : "a new contract"}` };
}

export function stopEngine() {
  ac?.abort();
  ac = undefined;
}

/** tx position -> sender, from verified BAL nonce changes (index = position + 1). */
function senders(b: VerifiedBlock) {
  const m = new Map<number, Address>();
  for (const a of b.bal) for (const c of a.nonceChanges) m.set(Number(c.index) - 1, a.address.toLowerCase() as Address);
  return m;
}

export function describe(a: Activity, b: VerifiedBlock): Alert[] {
  const block = b.number.toString();
  const base = { block, blockHash: b.hash.toLowerCase(), t: Number(b.header.timestamp) * 1000, address: a.address, anchored: b.anchored };
  const who = labelOf(a.address) ?? short(a.address);
  const out: Alert[] = [];
  for (const tx of a.sent) {
    const items = a.items.filter((i) => i.tx === tx);
    const swaps = items.filter((i) => i.kind === "swap");
    if (swaps.length) {
      const s = swaps[0];
      const legs = items.filter((i) => i.kind === "transfer");
      const sold = legs.find((l) => l.kind === "transfer" && l.from === a.address);
      const bought = legs.findLast((l) => l.kind === "transfer" && l.to === a.address);
      const tok = (t: Address) => (t === ETH_LOGGER ? "ETH" : SEPOLIA_TOKENS.find((x) => x.token === t)?.symbol ?? short(t));
      const detail = sold && bought && sold.kind === "transfer" && bought.kind === "transfer"
        ? `${fmtToken(sold.value, sold.token)} ${tok(sold.token)} → ${fmtToken(bought.value, bought.token)} ${tok(bought.token)}`
        : `Uniswap ${s.kind === "swap" ? s.dex : ""} pool ${short(s.kind === "swap" ? s.pool : a.address)}`;
      out.push({ ...base, id: `${block}-${tx}-${a.address}`, kind: "swap", tx, title: `${who} swapped`, detail,
        sold: sold?.kind === "transfer" ? { token: sold.token, value: sold.value } : undefined,
        bought: bought?.kind === "transfer" ? { token: bought.token, value: bought.value } : undefined });
    }
  }
  for (const i of a.items) {
    if (i.kind !== "transfer" || a.sent.includes(i.tx)) continue;
    if (i.to === a.address)
      out.push({ ...base, id: `${block}-${i.tx}-in-${a.address}`, kind: "in", tx: i.tx, title: `${who} received`,
        detail: `${fmtToken(i.value, i.token)} ${i.token === ETH_LOGGER ? "ETH" : SEPOLIA_TOKENS.find((x) => x.token === i.token)?.symbol ?? short(i.token)} from ${short(i.from)}` });
  }
  return out;
}

/** Replay recent verified blocks for one address (all local). */
// Looked-up addresses whose PIR answer is waiting for a verified balance (see proof.ts). Nothing is requested for them:
// the device only checks blocks it already verifies, plus the recent ones it keeps in memory.
const proofSubs = new Map<string, Set<(s: Seen) => void>>();
function checkProofs(b: VerifiedBlock) {
  if (!proofSubs.size) return;
  for (const a of scanBlock(b.bal, b.feed, [...proofSubs.keys()] as Address[], SEPOLIA_TOKENS)) {
    const s = seenFrom(a, Number(b.number));
    if (s) proofSubs.get(a.address.toLowerCase())?.forEach((f) => f(s));
  }
}
export function watchProof(address: Address, cb: (s: Seen) => void): () => void {
  const k = address.toLowerCase();
  if (!proofSubs.has(k)) proofSubs.set(k, new Set());
  proofSubs.get(k)!.add(cb);
  for (const b of [...recent].sort((x, y) => Number(x.number - y.number))) {
    for (const a of scanBlock(b.bal, b.feed, [k as Address], SEPOLIA_TOKENS)) { const s = seenFrom(a, Number(b.number)); if (s) cb(s); }
  }
  return () => { proofSubs.get(k)?.delete(cb); if (!proofSubs.get(k)?.size) proofSubs.delete(k); };
}

export function rescan(address: Address) {
  const alerts = recent.flatMap((b) => scanBlock(b.bal, b.feed, [address], SEPOLIA_TOKENS).flatMap((a) => describe(a, b)));
  if (!alerts.length) return 0;
  setState((st) => {
    const have = new Set(st.alerts.map((a) => a.id));
    const fresh = alerts.filter((a) => !have.has(a.id));
    return { alerts: [...fresh, ...st.alerts].sort((x, y) => Number(y.block) - Number(x.block)).slice(0, 200) };
  });
  return alerts.length;
}

async function onBlock(b: VerifiedBlock) {
  recent.push(b);
  if (recent.length > KEEP) recent.shift();
  checkProofs(b);
  const s = getState();
  const watched = s.wallets.map((w) => w.address);
  const acts = scanBlock(b.bal, b.feed, watched, SEPOLIA_TOKENS);
  const block = b.number.toString();

  // Verified balances: exact post-block values straight from the access list.
  for (const a of acts) {
    const t = a.tokens;
    const patch: Record<string, bigint> = {};
    if (a.eth !== undefined) patch.eth = a.eth;
    if (t[USDC] !== undefined) patch.usdc = t[USDC];
    if (t[WETH] !== undefined) patch.weth = t[WETH];
    if (Object.keys(patch).length) setBalance(a.address, { ...patch, block, source: "verified" });
  }

  // Names for every token that traded in this block, not only your wallets' tokens (see tokens.ts).
  const swapTxs = new Set(b.feed.filter((f) => f.kind === "swap").map((f) => f.tx));
  resolveAll([...new Set(b.feed.filter((f) => f.kind === "transfer" && swapTxs.has(f.tx)).map((f) => (f as { token: Address }).token))]);
  const alerts = acts.flatMap((a) => describe(a, b));
  if (alerts.length) notify(alerts);

  // Public market activity: who swapped in this block (sender from the verified list, not from the relay).
  const from = senders(b);
  const traders: Trader[] = [];
  for (const f of b.feed)
    if (f.kind === "swap" && from.has(f.tx) && !traders.some((t) => t.address === from.get(f.tx))) traders.push({ address: from.get(f.tx)!, block, pool: f.pool, dex: f.dex });

  const pending = s.pendingTx;
  const landed = pending && !pending.landed && acts.some((a) => a.sent.length && s.wallets.find((w) => w.kind === "device")?.address === a.address);

  // A wallet that sent in this verified block: its pending entries are settled (the verified alert replaces them).
  const settled = new Set(acts.filter((a) => a.sent.length).map((a) => a.address.toLowerCase()));
  setState((st) => ({
    status: { phase: "live", head: block, message: undefined },
    pendingAlerts: st.pendingAlerts.filter((p) => !settled.has(p.address.toLowerCase())),
    alerts: [...alerts.filter((a) => !st.alerts.some((x) => x.id === a.id)), ...st.alerts].slice(0, 200),
    tape: [{ number: block, txs: b.receipts.length, accounts: b.bal.length, swaps: b.feed.filter((f) => f.kind === "swap").length,
      bytes: b.bytes, ms: Math.round(b.ms), anchored: b.anchored, hits: acts.length, at: Date.now(), hash: b.hash.toLowerCase() }, ...st.tape].slice(0, 60),
    traders: [...traders, ...st.traders.filter((t) => !traders.some((n) => n.address === t.address))].slice(0, 40),
    ...(landed ? { pendingTx: { ...pending!, landed: block } } : {}),
  }));
}

function notify(alerts: Alert[]) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  for (const a of alerts.slice(0, 3)) {
    try {
      // Built only from what is already on this device; nothing is sent.
      new Notification(a.title, { body: a.pending ? `${a.detail} · pending, unverified` : `${a.detail} · block ${a.block}`, tag: a.id });
    } catch {}
  }
}
