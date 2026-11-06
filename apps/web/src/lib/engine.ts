// The live loop: follow the chain through Anon-RPC, verify every block, filter it here on the device.
// Requests name block numbers only. Which wallets you hold or watch never leaves this tab.
import { RpcClient, SEPOLIA_TOKENS, follow, newIsolationKey, scanBlock, type Activity, type VerifiedBlock } from "@bina/sdk";
import type { Address } from "viem";
import { anonFetch } from "./anon";
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
  ac = g.__bpEngine = new AbortController();
  setState(() => ({ status: { phase: "connecting", message: "Opening a route through the mixnet" } }));
  const rpc = new RpcClient(config.feedUrl, anonFetch, newIsolationKey());
  const anchor = new RpcClient(config.anchorUrl, anonFetch, newIsolationKey());
  follow({
    rpc, anchor, compact: config.feedCompact, signal: ac.signal, pollMs: 3000,
    onBlock,
    onError: (e, n) => {
      const msg = (e as Error).message ?? String(e);
      // A not-yet-produced block is normal; anything else is worth showing.
      setState((s) => ({ status: { ...s.status, phase: s.status.phase === "live" ? "live" : "error", message: `Block ${n}: ${msg}` } }));
    },
  }).catch((e) => setState(() => ({ status: { phase: "error", message: String(e) } })));
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

function describe(a: Activity, b: VerifiedBlock): Alert[] {
  const block = b.number.toString();
  const base = { block, t: Number(b.header.timestamp) * 1000, address: a.address, anchored: b.anchored };
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
      const tok = (t: Address) => SEPOLIA_TOKENS.find((x) => x.token === t)?.symbol ?? short(t);
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
        detail: `${fmtToken(i.value, i.token)} ${SEPOLIA_TOKENS.find((x) => x.token === i.token)?.symbol ?? short(i.token)} from ${short(i.from)}` });
  }
  return out;
}

/** Replay recent verified blocks for one address (all local). */
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

  setState((st) => ({
    status: { phase: "live", head: block, message: undefined },
    alerts: [...alerts.filter((a) => !st.alerts.some((x) => x.id === a.id)), ...st.alerts].slice(0, 200),
    tape: [{ number: block, txs: b.receipts.length, accounts: b.bal.length, swaps: b.feed.filter((f) => f.kind === "swap").length,
      bytes: b.bytes, ms: Math.round(b.ms), anchored: b.anchored, hits: acts.length }, ...st.tape].slice(0, 60),
    traders: [...traders, ...st.traders.filter((t) => !traders.some((n) => n.address === t.address))].slice(0, 40),
    ...(landed ? { pendingTx: { ...pending!, landed: block } } : {}),
  }));
}

function notify(alerts: Alert[]) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  for (const a of alerts.slice(0, 3)) {
    try {
      new Notification(a.title, { body: `${a.detail} · block ${a.block}`, tag: a.id });
    } catch {}
  }
}
