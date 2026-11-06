import { useMemo, useState } from "react";
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
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li>
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
        <span><strong>{b?.eth !== undefined ? fmtAmount(b.eth, 18) : "–"}</strong> <span className="muted small">ETH</span></span>
        <span className="small muted">
          {b?.usdc !== undefined ? fmtAmount(b.usdc, 6, 2) : "–"} USDC · {b?.weth !== undefined ? fmtAmount(b.weth, 18) : "–"} WETH
        </span>
        <span className="actions">
          <button className="btn ghost small" onClick={refresh} disabled={busy}>{busy ? "Looking up…" : b ? "Refresh" : "Load"}</button>
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

export default function Portfolio() {
  const wallets = useStore((s) => s.wallets);
  const balances = useStore((s) => s.balances);
  const mine = useMemo(() => wallets.filter((w) => w.kind !== "watch"), [wallets]);
  const [adding, setAdding] = useState(false);
  const total = (k: "eth" | "usdc" | "weth") => mine.reduce((a, w) => a + (balances[w.address]?.[k] ?? 0n), 0n);

  return (
    <>
      <header className="head">
        <h1>Portfolio</h1>
        <p>Your balances, kept current from verified blocks. No provider learns which addresses are yours.</p>
      </header>

      <section className="holdings" aria-label="Total holdings">
        <div className="holding"><span className="sym">ETH</span><span className="qty">{fmtAmount(total("eth"), 18)}</span></div>
        <div className="holding"><span className="sym">USDC</span><span className="qty">{fmtAmount(total("usdc"), 6, 2)}</span></div>
        <div className="holding"><span className="sym">WETH</span><span className="qty">{fmtAmount(total("weth"), 18)}</span></div>
      </section>

      <section className="panel flush">
        <header>
          <h2>Wallets</h2>
          <button className="btn small" onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "Add wallet"}</button>
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
