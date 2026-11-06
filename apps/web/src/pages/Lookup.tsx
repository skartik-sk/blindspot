import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import Icon from "../components/Icon";
import { config } from "../lib/config";
import { fmtAmount, short } from "../lib/format";
import { pirTable, privateBalance, type LookupResult } from "../lib/lookup";

export default function Lookup() {
  const [addr, setAddr] = useState("");
  const [step, setStep] = useState<string>();
  const [res, setRes] = useState<LookupResult & { address: Address }>();
  const [err, setErr] = useState<string>();
  const [dir, setDir] = useState<{ count: number; block: string }>();

  useEffect(() => {
    pirTable().then((t) => t && setDir({ count: t.addresses.length, block: t.block })).catch(() => {});
  }, []);

  const valid = isAddress(addr.trim());
  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setErr(undefined);
    setRes(undefined);
    const a = addr.trim().toLowerCase() as Address;
    try {
      const r = await privateBalance(a, setStep);
      setRes({ ...r, address: a });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setStep(undefined);
    }
  };

  return (
    <>
      <header className="head">
        <h1>Private lookup</h1>
        <p>Check any address's balance. The server does the same work for every address it knows, so it can't tell which one you asked about.</p>
      </header>

      <section className="panel">
        <form className="form" onSubmit={run}>
          <div className="field">
            <label htmlFor="lookup">Address</label>
            <input id="lookup" type="text" className="mono" placeholder="0x…" value={addr} onChange={(e) => setAddr(e.target.value)}
              autoComplete="off" spellCheck={false} />
          </div>
          <div className="actions">
            <button className="btn primary" disabled={!valid || !!step}><Icon name="lookup" />{step ? "Looking up…" : "Look up privately"}</button>
            <span className="small muted">
              {dir ? `Directory: ${dir.count} active Sepolia addresses as of block ${parseInt(dir.block, 16)}` :
                config.relayUrl ? "Loading the directory…" : "No relay configured: lookups use a fresh mixnet route"}
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
    </>
  );
}
