import { useEffect, useMemo, useState } from "react";
import { isAddress, type Address } from "viem";
import Icon from "../components/Icon";
import { config } from "../lib/config";
import { ago, fmtAmount, fmtBytes, short } from "../lib/format";
import { ANONYMITY, crowdFor, privateHistory, type HistoryResult } from "../lib/history";
import { pirTable, privateBalance, type LookupResult } from "../lib/lookup";
import { useStore } from "../lib/store";

type History = { state: "idle" } | { state: "exposed" } | { state: "loading"; done: number; total: number } | { state: "done"; r: HistoryResult } | { state: "error"; msg: string };

export default function Lookup() {
  const [addr, setAddr] = useState("");
  const [step, setStep] = useState<string>();
  const [res, setRes] = useState<LookupResult & { address: Address }>();
  const [err, setErr] = useState<string>();
  const [dir, setDir] = useState<{ count: number; block: string; addresses: string[] }>();
  const [dirFailed, setDirFailed] = useState(false);
  const [hist, setHist] = useState<History>({ state: "idle" });
  const traders = useStore((s) => s.traders);

  useEffect(() => {
    pirTable()
      .then((t) => (t ? setDir({ count: t.addresses.length, block: t.block, addresses: t.addresses }) : setDirFailed(true)))
      .catch(() => setDirFailed(true));
  }, []);

  // Suggestions: wallets trading right now that the private directory already holds (real, and private to look up).
  const suggestions = useMemo(() => {
    if (!dir) return [];
    const inDir = new Set(dir.addresses);
    const live = [...new Set(traders.map((t) => t.address.toLowerCase()))].filter((a) => inDir.has(a));
    return (live.length ? live : dir.addresses.slice(-3)).slice(0, 3) as Address[];
  }, [dir, traders]);

  const valid = isAddress(addr.trim());
  const lookup = async (raw: string) => {
    setErr(undefined);
    setRes(undefined);
    setHist({ state: "idle" });
    const a = raw.trim().toLowerCase() as Address;
    try {
      const r = await privateBalance(a, setStep);
      setRes({ ...r, address: a });
      if (r.via === "pir" && r.history?.length) {
        // Without other addresses to hide among, the block pattern would point straight at this one: ask first.
        if (crowdFor(r.history, r.cover ?? []).crowd < 2) setHist({ state: "exposed" });
        else loadHistory(a, r);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setStep(undefined);
    }
  };
  const loadHistory = (a: Address, r: LookupResult) => {
    setHist({ state: "loading", done: 0, total: 1 });
    privateHistory(a, r.history ?? [], r.cover ?? [], (done, total) => setHist({ state: "loading", done, total }))
      .then((h) => setHist({ state: "done", r: h }))
      .catch((e) => setHist({ state: "error", msg: (e as Error).message }));
  };
  const run = (e: React.FormEvent) => (e.preventDefault(), valid && lookup(addr));

  return (
    <>
      <header className="head">
        <h1>Private lookup</h1>
        <p>Any address's balance and recent activity, without telling the server which address.</p>
        <dl className="guarantee">
          <dt>Balance</dt><dd>Private lookup (PIR): the server computes over every address it knows and can't tell which one you read.</dd>
          <dt>History</dt><dd>Hidden among up to {ANONYMITY} wallets: the server sees which blocks you download, and they fit {ANONYMITY} wallets equally, so it learns "one of these", not which. It also sees when.</dd>
        </dl>
      </header>

      <section className="panel">
        <form className="form" onSubmit={run}>
          <div className="field">
            <label htmlFor="lookup">Address</label>
            <input id="lookup" type="text" className="mono" placeholder="0x…" value={addr} onChange={(e) => setAddr(e.target.value)}
              autoComplete="off" spellCheck={false} />
          </div>
          {suggestions.length > 0 && (
            <div className="suggest" aria-label="Suggestions">
              <span className="small muted">{traders.length ? "Trading right now:" : "Try:"}</span>
              {suggestions.map((s) => (
                <button key={s} type="button" className="chip-btn mono" onClick={() => { setAddr(s); lookup(s); }} disabled={!!step}>{short(s)}</button>
              ))}
            </div>
          )}
          <div className="actions">
            <button className="btn primary" disabled={!valid || !!step}><Icon name="lookup" />{step ? "Looking up…" : "Look up privately"}</button>
            <span className="small muted">
              {dir ? `Directory: ${dir.count} active Sepolia addresses as of block ${parseInt(dir.block, 16)}`
                : !config.relayUrl ? "No relay configured: lookups use a fresh mixnet route"
                : dirFailed ? "The private directory isn't reachable right now. Lookups still work as a one-off mixnet read (the node sees the address, not you); history needs the directory."
                : "Loading the directory…"}
            </span>
          </div>
        </form>
        {step && <p className="small" aria-live="polite">{step}…</p>}
        {err && <p className="error-text">{err}</p>}
      </section>

      {res && (
        <section className="panel">
          <header>
            <h2 className="mono" style={{ fontSize: 16 }}>{short(res.address)}</h2>
            <span className="chip" data-kind={res.via === "pir" ? "pir" : undefined}>{res.via === "pir" ? "Private lookup" : "Mixnet read"} · {(res.ms / 1000).toFixed(1)} s</span>
          </header>
          <div className="holdings">
            <div className="holding"><span className="sym">ETH</span><span className="qty">{fmtAmount(res.eth, 18)}</span></div>
            <div className="holding"><span className="sym">USDC</span><span className="qty">{fmtAmount(res.usdc, 6, 2)}</span></div>
            <div className="holding"><span className="sym">WETH</span><span className="qty">{fmtAmount(res.weth, 18)}</span></div>
          </div>
          <div className="callout">
            <strong>What the server saw</strong>
            <span>{res.serverSaw}</span>
          </div>
          <ol className="steps">
            {res.steps.map((s) => <li key={s.label}><span>{s.label}</span><span className="muted">{s.ms} ms</span></li>)}
          </ol>
          {res.via === "pir" && (
            <p className="small muted">
              Private, not proven: a dishonest server could return a wrong number. Add the address to Watch or Portfolio and the
              next verified block corrects it.
            </p>
          )}
        </section>
      )}

      {res && (
        <section className="panel" aria-live="polite">
          <header>
            <h2>Recent activity</h2>
            {hist.state === "done" && <span className="chip" data-kind="verified">Hidden among {hist.r.crowd} · {(hist.r.ms / 1000).toFixed(1)} s · {fmtBytes(hist.r.bytes)}</span>}
          </header>
          {res.via !== "pir" && <p className="small muted">History is private only for addresses in the directory. This one isn't, so none was fetched.</p>}
          {res.via === "pir" && !res.history?.length && <p className="small muted">No activity in the relay's recent window for this address.</p>}
          {hist.state === "exposed" && (
            <div className="callout">
              <strong>No cover available right now</strong>
              <span>Too few other addresses have recent activity to hide among, so the relay could tell whose blocks these are.</span>
              <button className="btn small" onClick={() => loadHistory(res.address, res)}>Load anyway</button>
            </div>
          )}
          {hist.state === "loading" && (
            <div className="hist-progress">
              <span className="small">Downloading verified blocks for up to {ANONYMITY} wallets, each on its own mixnet route: {hist.done} of {hist.total}</span>
              <span className="bar"><i style={{ width: `${(100 * hist.done) / Math.max(1, hist.total)}%` }} /></span>
            </div>
          )}
          {hist.state === "error" && <p className="error-text">Couldn't load history: {hist.msg}</p>}
          {hist.state === "done" && (
            <>
              {hist.r.rows.length ? (
                <ul className="rows">
                  {hist.r.rows.map((a) => (
                    <li key={a.id} className="alert-row">
                      <span className="alert-icon" data-kind={a.kind}><Icon name={a.kind} /></span>
                      <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
                        <span className="row-title"><span>{a.title.replace(short(res.address), "").trim() || a.title}</span></span>
                        <span className="row-sub">{a.detail}</span>
                      </div>
                      <div className="row-end small">
                        <span className="muted">{ago(a.t)}</span>
                        <span className="up">block {a.block} ✓</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="small muted">Active in those blocks, but no swaps or token transfers to show (for example, contract calls).</p>}
              {hist.r.failed > 0 && <p className="small muted">{hist.r.failed} block(s) couldn't be verified and were left out.</p>}
              {hist.r.mismatches > 0 && (
                <div className="callout">
                  <strong className="down">The relay's index didn't match the chain</strong>
                  <span>{hist.r.mismatches} listed activity entr{hist.r.mismatches === 1 ? "y" : "ies"} had no matching activity in the verified blocks. Treat this relay as untrusted.</span>
                </div>
              )}
              <div className="callout">
                <strong>What the relay saw</strong>
                <span>
                  {hist.r.blocks} block numbers in random order, each from a different mixnet exit: the combined recent activity of {hist.r.crowd} directory
                  addresses. It can't tell which of the {hist.r.crowd} you looked up. It could see the downloads arrive close together.
                </span>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
