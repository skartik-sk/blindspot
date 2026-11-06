import { useEffect, useMemo, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import Icon from "../components/Icon";
import { fmtAmount, short } from "../lib/format";
import { rescan } from "../lib/engine";
import { privateBalance } from "../lib/lookup";
import { addWallet, removeWallet, setBalance, useStore, type Bal, type Wallet } from "../lib/store";

export function Source({ b }: { b?: Bal }) {
  if (!b) return <span className="chip">Not loaded</span>;
  const at = b.block ? ` · block ${b.block}` : "";
  if (b.source === "verified") return <span className="chip" data-kind="verified" title="Read from a block's verified access list">Verified{at}</span>;
  if (b.source === "pir") return <span className="chip" data-kind="pir" title="Private lookup: the server never learned which row">Private lookup{at}</span>;
  return <span className="chip" title="Read on a one-off mixnet route">Mixnet read{at}</span>;
}

export async function loadBalance(a: Address) {
  const r = await privateBalance(a);
  setBalance(a, { eth: r.eth, usdc: r.usdc, weth: r.weth, block: r.block, source: r.via });
  return r;
}

const AVATAR = ["#4c6ef5", "#e8590c", "#0ca678", "#ae3ec9", "#1098ad", "#d6336c"];
const avatarColor = (a: string) => AVATAR[parseInt(a.slice(2, 6), 16) % AVATAR.length];

function WalletRow({ w }: { w: Wallet }) {
  const b = useStore((s) => s.balances[w.address]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const refresh = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      await loadBalance(w.address);
    } catch (e) {
      setErr(`Couldn't load: ${(e as Error).message}. Try again.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="wallet-row">
      <span className="wallet-ic" style={{ background: avatarColor(w.address) }} aria-hidden>{w.label.replace(/^0x/, "").slice(0, 1).toUpperCase()}</span>
      <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <div className="row-title">
          <span>{w.label}</span>
          {w.kind === "device" && <span className="chip">Can send</span>}
        </div>
        <div className="row-sub">
          <span className="mono" title={w.address}>{short(w.address)}</span>
          <Source b={b} />
        </div>
        {err && <span className="error-text">{err}</span>}
      </div>
      <div className="row-end">
        <span><strong>{b?.eth !== undefined ? fmtAmount(b.eth, 18) : busy ? <span className="skeleton" /> : "–"}</strong> <span className="muted small">ETH</span></span>
        <span className="small muted">
          {b?.usdc !== undefined ? fmtAmount(b.usdc, 6, 2) : "–"} USDC · {b?.weth !== undefined ? fmtAmount(b.weth, 18) : "–"} WETH
        </span>
        <span className="actions">
          <button className="btn ghost small" onClick={refresh} disabled={busy} aria-busy={busy}>{busy ? "Looking up…" : b ? "Refresh" : "Load"}</button>
          {w.kind !== "device" && (
            <button className="btn ghost small" onClick={() => removeWallet(w.address)} aria-label={`Remove ${w.label}`}><Icon name="trash" /></button>
          )}
        </span>
      </div>
    </li>
  );
}

export function AddWallet({ kind, onDone }: { kind: "mine" | "watch"; onDone?: () => void }) {
  const [addr, setAddr] = useState("");
  const [label, setLabel] = useState("");
  const valid = isAddress(addr.trim());
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const a = addr.trim().toLowerCase() as Address;
    addWallet({ address: a, label: label.trim() || short(a), kind });
    if (kind === "mine") loadBalance(a).catch(() => {});
    rescan(a);
    setAddr("");
    setLabel("");
    onDone?.();
  };
  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <div className="field">
          <label htmlFor={`addr-${kind}`}>Address</label>
          <input id={`addr-${kind}`} type="text" className="mono" placeholder="0x…" value={addr} onChange={(e) => setAddr(e.target.value)}
            autoComplete="off" spellCheck={false} aria-invalid={addr !== "" && !valid} />
        </div>
        <div className="field">
          <label htmlFor={`label-${kind}`}>Name</label>
          <input id={`label-${kind}`} type="text" placeholder={kind === "watch" ? "e.g. Whale 1" : "e.g. Trading"} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
      </div>
      <div className="actions">
        <button className="btn primary" disabled={!valid}><Icon name="plus" />{kind === "watch" ? "Watch wallet" : "Add wallet"}</button>
        <span className="small muted">Saved on this device only. No server is told.</span>
      </div>
    </form>
  );
}

function LiveStrip() {
  const tape = useStore((s) => s.tape);
  const status = useStore((s) => s.status);
  const ref = useRef<HTMLDivElement>(null);
  // New blocks arrive at the front; keep the newest in view unless the user has scrolled away.
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollLeft < 160) el.scrollTo({ left: 0 });
  }, [tape[0]?.number]); // eslint-disable-line
  return (
    <section className="live-strip" style={{ display: "grid", gap: 10 }} aria-label="Verified blocks">
      <div className="sec-title"><h2>Verified blocks</h2><a href="#/network">Details</a></div>
      <div className="strip" ref={ref}>
        {tape.length === 0
          ? Array.from({ length: 3 }, (_, i) => (
              <div className="strip-item" key={i}><b><span className="skeleton" style={{ width: "9ch" }} /></b><span className="faint">{status.phase === "error" ? "Retrying route" : "Connecting"}</span></div>
            ))
          : tape.slice(0, 12).map((b) => (
              <div className="strip-item" key={b.number} data-hit={b.hits > 0}>
                <b>#{Number(b.number).toLocaleString("en-US")}</b>
                <span className="ok">{b.anchored ? "Verified ✓" : "Checked"}</span>
                <span className="faint">{b.hits ? `${b.hits} for you` : `${b.swaps} swaps · ${b.txs} txs`}</span>
              </div>
            ))}
      </div>
    </section>
  );
}

export default function Portfolio() {
  const wallets = useStore((s) => s.wallets);
  const balances = useStore((s) => s.balances);
  const status = useStore((s) => s.status);
  const mine = useMemo(() => wallets.filter((w) => w.kind !== "watch"), [wallets]);
  const [adding, setAdding] = useState(false);
  const total = (k: "eth" | "usdc" | "weth") => mine.reduce((a, w) => a + (balances[w.address]?.[k] ?? 0n), 0n);
  const loaded = mine.some((w) => balances[w.address]);

  return (
    <>
      <header className="head">
        <h1>Portfolio</h1>
        <p>Your balances, kept current from verified blocks. No provider learns which addresses are yours.</p>
      </header>

      <section className="hero-card" aria-label="Total holdings">
        <div className="hc-top">
          <span className="hc-label">Across {mine.length} wallet{mine.length === 1 ? "" : "s"}</span>
          <span className="hc-chip"><span className="dot" style={{ background: status.phase === "live" ? "#3ddc97" : "#f5b53d" }} aria-hidden />{status.phase === "live" ? "Private · live" : "Connecting"}</span>
        </div>
        <div className="hc-big">{loaded ? fmtAmount(total("eth"), 18) : <span className="skeleton" style={{ width: "4ch", height: "0.8em" }} />}<small>ETH</small></div>
        <div className="hc-row">
          <span className="hc-pill">{fmtAmount(total("usdc"), 6, 2)} USDC</span>
          <span className="hc-pill">{fmtAmount(total("weth"), 18)} WETH</span>
        </div>
      </section>

      <nav className="quick" aria-label="Quick actions">
        <a href="#/send" className="primary"><span className="q-ic"><Icon name="swap" /></span>Trade</a>
        <a href="#/watch"><span className="q-ic"><Icon name="watch" /></span>Watch</a>
        <a href="#/lookup"><span className="q-ic"><Icon name="lookup" /></span>Lookup</a>
        <a href="#/spy"><span className="q-ic"><Icon name="spy" /></span>Spy</a>
      </nav>

      <LiveStrip />

      <section className="panel flush">
        <header>
          <h2>Wallets</h2>
          <button className="btn small" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>{adding ? "Cancel" : <><Icon name="plus" />Add</>}</button>
        </header>
        {adding && <div style={{ padding: "4px 18px 18px" }}><AddWallet kind="mine" onDone={() => setAdding(false)} /></div>}
        <ul className="rows">
          {mine.map((w) => <WalletRow key={w.address} w={w} />)}
        </ul>
      </section>

      <section className="callout">
        <strong>How the numbers stay private</strong>
        <span className="muted">
          The first balance comes from a private lookup: the server computes over every address it has and can't tell which
          one you read. After that, each new block's verified change list updates it here on your phone.
        </span>
      </section>
    </>
  );
}
