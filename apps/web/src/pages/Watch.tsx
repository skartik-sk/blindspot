import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import { ago, fmtAmount, short } from "../lib/format";
import { ETH_LOGGER } from "@bina/sdk";
import { isKnown, useToken } from "../lib/tokens";
import { TOKEN } from "../lib/trade";
import { rescan } from "../lib/engine";
import { addWallet, removeWallet, setState, useStore, type Alert, type Wallet } from "../lib/store";
import { AddWallet } from "./Portfolio";

export function watchWallet(w: Wallet) {
  addWallet(w);
  rescan(w.address);
}

function Leg({ leg }: { leg?: { token: `0x${string}`; value: bigint } }) {
  const m = useToken(leg?.token);
  if (!leg) return null;
  const known = isKnown(leg.token);
  return (
    <span title={known ? undefined : `Unverified token ${leg.token}: anyone can name a token anything`}>
      {m ? fmtAmount(leg.value, m.decimals) : "…"}{" "}
      {known ? m?.symbol : <span className="faint">{m?.symbol ?? short(leg.token)}<sup>?</sup></span>}
    </span>
  );
}

const tradable = new Set<string>([TOKEN.USDC, TOKEN.WETH, ETH_LOGGER]);

function AlertRow({ a, fresh }: { a: Alert; fresh: boolean }) {
  const legs = a.sold && a.bought;
  const canCopy = a.kind === "swap" && !!legs && tradable.has(a.sold!.token) && tradable.has(a.bought!.token);
  return (
    <li className="alert-row" data-new={fresh}>
      <span className="alert-icon" data-kind={a.kind}><Icon name={a.kind} /></span>
      <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
        <span className="row-title"><span>{a.title}</span></span>
        <span className="row-sub">{legs ? <><Leg leg={a.sold} /><span aria-label="for">→</span><Leg leg={a.bought} /></> : <span>{a.detail}</span>}</span>
      </div>
      <div className="row-end small">
        <span className="muted">{ago(a.t)}</span>
        <span className={a.anchored ? "up" : "faint"}>block {a.block}{a.anchored ? " ✓" : ""}</span>
        {canCopy && <a className="btn small" href={`#/send?copy=${encodeURIComponent(a.id)}`}>Copy trade</a>}
      </div>
    </li>
  );
}

export default function Watch() {
  const wallets = useStore((s) => s.wallets);
  const alerts = useStore((s) => s.alerts);
  const traders = useStore((s) => s.traders);
  const watch = useMemo(() => wallets.filter((w) => w.kind === "watch"), [wallets]);
  const unreadIds = useMemo(() => new Set(alerts.filter((a) => !a.read).map((a) => a.id)), []); // eslint-disable-line
  const [perm, setPerm] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);

  // Seen once this screen opens.
  useEffect(() => {
    if (alerts.some((a) => !a.read)) setState((s) => ({ alerts: s.alerts.map((a) => ({ ...a, read: true })) }));
  }, [alerts]);

  const watching = new Set(watch.map((w) => w.address));
  const suggestions = [...new Map(traders.filter((t) => !watching.has(t.address)).map((t) => [t.address, t])).values()].slice(0, 8);
  const [tab, setTab] = useState<"alerts" | "watching" | "trending">(watch.length ? "alerts" : "trending");
  const TABS = [
    { id: "alerts", label: "Alerts", count: unreadIds.size },
    { id: "watching", label: "Watching", count: 0 },
    { id: "trending", label: "Trending", count: 0 },
  ] as const;

  return (
    <>
      <header className="head">
        <h1>Watch</h1>
        <p>Follow any wallet and get told the moment it trades. Nobody, not even our relay, learns who you follow.</p>
      </header>

      <div className="segtabs" role="tablist" aria-label="Watch sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} aria-controls={`tab-${t.id}`} onClick={() => setTab(t.id)}>
            {t.label}{t.count > 0 && <span className="count">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === "alerts" && <section className="panel flush" id="tab-alerts" role="tabpanel">
        <header>
          <h2>Alerts</h2>
          {perm === "default" && (
            <button className="btn small" onClick={() => Notification.requestPermission().then(setPerm)}><Icon name="bell" />Turn on notifications</button>
          )}
        </header>
        {alerts.length === 0 ? (
          <div className="empty">
            <span>{watch.length ? "No trades from your wallets yet. Alerts appear here within a block of the trade landing." : "Watch a wallet to get alerts when it trades."}</span>
            {!watch.length && <button className="btn primary small" onClick={() => setTab("trending")}>Find active traders</button>}
          </div>
        ) : (
          <ul className="rows">{alerts.slice(0, 30).map((a) => <AlertRow key={a.id} a={a} fresh={unreadIds.has(a.id)} />)}</ul>
        )}
      </section>}

      {tab === "watching" && <section className="panel flush" id="tab-watching" role="tabpanel">
        <header><h2>Watching</h2><span className="small muted">{watch.length} wallets</span></header>
        <ul className="rows">
          {watch.map((w) => (
            <li key={w.address}>
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <span className="row-title"><span>{w.label}</span></span>
                <span className="row-sub mono" title={w.address}>{short(w.address)}</span>
              </div>
              <button className="btn ghost small" onClick={() => removeWallet(w.address)} aria-label={`Stop watching ${w.label}`}>Stop watching</button>
            </li>
          ))}
        </ul>
        {watch.length === 0 && <div className="empty">You're not watching anyone yet. Paste an address below or pick from Trending.</div>}
        <div style={{ padding: "8px 18px 18px" }}><AddWallet kind="watch" /></div>
      </section>}

      {tab === "trending" && <section className="panel flush" id="tab-trending" role="tabpanel">
        <header>
          <h2>Trading right now</h2>
          <span className="small muted">From verified blocks</span>
        </header>
        {suggestions.length === 0 ? (
          <div className="empty">Wallets that swap on Uniswap show up here as blocks arrive.</div>
        ) : (
          <ul className="rows">
            {suggestions.map((t) => (
              <li key={t.address}>
                <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <span className="row-title mono"><span>{short(t.address)}</span></span>
                  <span className="row-sub">Uniswap {t.dex} · pool {short(t.pool)} · block {t.block}</span>
                </div>
                <button className="btn small" onClick={() => watchWallet({ address: t.address, label: `Trader ${short(t.address)}`, kind: "watch" })}>Watch</button>
              </li>
            ))}
          </ul>
        )}
      </section>}
    </>
  );
}
