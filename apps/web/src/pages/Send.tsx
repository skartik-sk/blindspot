import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress, parseUnits, type Address, type Hex } from "viem";
import Icon from "../components/Icon";
import { deviceAccount } from "../lib/device";
import { fmtAmount, short } from "../lib/format";
import { setState, useStore } from "../lib/store";
import { DECIMALS, TOKEN, execute, quote, swapPlan, transferPlan, type Asset, type Route } from "../lib/trade";
import { Source, loadBalance } from "./Portfolio";

const ASSETS: Asset[] = ["ETH", "USDC", "WETH"];
const assetOf = (t?: Address): Asset | undefined =>
  t === TOKEN.USDC ? "USDC" : t === TOKEN.WETH ? "WETH" : undefined;

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button type="button" key={o} aria-pressed={o === value} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  );
}

export default function Send({ query }: { query: URLSearchParams }) {
  const me = deviceAccount().address.toLowerCase() as Address;
  const bal = useStore((s) => s.balances[me]);
  const alerts = useStore((s) => s.alerts);
  const pending = useStore((s) => s.pendingTx);
  const copy = useMemo(() => alerts.find((a) => a.id === query.get("copy")), [alerts, query]);

  const [mode, setMode] = useState<"Swap" | "Send">(copy ? "Swap" : "Send");
  const [asset, setAsset] = useState<Asset>("ETH");
  const [toAsset, setToAsset] = useState<Asset>("USDC");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [route, setRoute] = useState<Route>("private");
  const [out, setOut] = useState<bigint>();
  const [step, setStep] = useState<string>();
  const [err, setErr] = useState<string>();

  // Copy trade: same direction as the watched wallet, your own size.
  useEffect(() => {
    if (!copy) return;
    const sold = assetOf(copy.sold?.token);
    const bought = assetOf(copy.bought?.token);
    setMode("Swap");
    if (sold && bought) {
      setAsset(sold === "WETH" ? "ETH" : sold);
      setToAsset(bought === "WETH" && sold !== "ETH" ? "WETH" : bought);
    }
  }, [copy]);

  const amt = useMemo(() => {
    try {
      return amount ? parseUnits(amount, DECIMALS[asset]) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, asset]);

  // Live quote (names tokens and an amount, never you).
  useEffect(() => {
    setOut(undefined);
    if (mode !== "Swap" || !amt || asset === toAsset) return;
    const t = setTimeout(() => quote(asset, toAsset, amt).then(setOut).catch(() => setOut(undefined)), 500);
    return () => clearTimeout(t);
  }, [mode, amt, asset, toAsset]);

  useEffect(() => {
    if (!bal) loadBalance(me).catch(() => {});
  }, []); // eslint-disable-line

  const have = asset === "ETH" ? bal?.eth : asset === "USDC" ? bal?.usdc : bal?.weth;
  const enough = have === undefined || amt <= have;
  const canSend = amt > 0n && enough && !step && (mode === "Swap" ? asset !== toAsset && toAsset !== "ETH" : isAddress(to.trim()));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    try {
      if (mode === "Swap" && !out) throw new Error("No quote yet. Wait a moment and try again.");
      const plan = mode === "Send"
        ? transferPlan(asset, to.trim() as Address, amt)
        : await swapPlan(asset, toAsset, amt, out ? (out * 995n) / 1000n : 0n);
      const hashes = await execute(plan, route, setStep);
      const last = hashes.at(-1) as Hex;
      setState(() => ({ pendingTx: { hash: last, to: (mode === "Send" ? to.trim() : TOKEN[toAsset as "USDC"]) as Address,
        label: plan.at(-1)!.label, sentAt: Date.now() } }));
      setAmount("");
    } catch (e) {
      setErr((e as Error).message.split("\n")[0]);
    } finally {
      setStep(undefined);
    }
  }

  return (
    <>
      <header className="head">
        <h1>{mode === "Swap" ? "Trade" : "Send"}</h1>
        <p>Signed on this device, sent through the mixnet straight to a private builder. Nobody sees it before it lands.</p>
      </header>

      {copy && (
        <section className="callout">
          <strong>Copying {copy.title.replace(" swapped", "")}</strong>
          <span className="muted">{copy.detail} in block {copy.block}. Pick your own size below.</span>
        </section>
      )}

      <section className="panel">
        <header>
          <Seg label="Action" value={mode} options={["Swap", "Send"] as const} onChange={setMode} />
          <span className="small muted">From This device · <span className="mono">{short(me)}</span></span>
        </header>
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label>{mode === "Swap" ? "You pay" : "Asset"}</label>
            <div className="actions"><Seg label="Pay with" value={asset} options={ASSETS} onChange={setAsset} /></div>
          </div>
          <div className="field">
            <label htmlFor="amt">Amount</label>
            <input id="amt" type="text" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
            <span className="small muted">
              Balance {have !== undefined ? `${fmtAmount(have, DECIMALS[asset])} ${asset}` : "loading"}{" "}
              {have !== undefined && have > 0n && (
                <button type="button" className="btn ghost small" onClick={() => setAmount(formatUnits(asset === "ETH" ? (have * 9n) / 10n : have, DECIMALS[asset]))}>
                  {asset === "ETH" ? "Use 90%" : "Use all"}
                </button>
              )}
              {!enough && <span className="error-text"> More than you have</span>}
            </span>
          </div>
          {mode === "Swap" ? (
            <div className="field">
              <label>You get</label>
              <div className="actions">
                <Seg label="Receive" value={toAsset} options={["USDC", "WETH"] as Asset[]} onChange={setToAsset} />
                <span>{out !== undefined ? <><strong>≈ {fmtAmount(out, DECIMALS[toAsset])}</strong> {toAsset}</> : amt ? <span className="muted">Getting a quote…</span> : null}</span>
              </div>
              <span className="small faint">Uniswap v3, 0.05% pool, 0.5% max slippage. The quote request carries no address.</span>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="to">To</label>
              <input id="to" type="text" className="mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} autoComplete="off" />
            </div>
          )}
          <div className="field">
            <label>Route</label>
            <div className="actions">
              <Seg label="Route" value={route === "private" ? "Private" : "Public"} options={["Private", "Public"] as const}
                onChange={(v) => setRoute(v === "Private" ? "private" : "public")} />
              <span className="small muted">
                {route === "private" ? "Flashbots Protect: skips the public mempool, can't be front-run." : "Public mempool: visible to bots before it lands."}
              </span>
            </div>
          </div>
          <div className="actions">
            <button className="btn primary" disabled={!canSend}><Icon name="send" />{step ? "Working…" : mode === "Swap" ? "Trade privately" : "Send privately"}</button>
            {step && <span className="small" aria-live="polite">{step}</span>}
          </div>
          {err && <p className="error-text">{err}</p>}
        </form>
      </section>

      {pending && (
        <section className="panel">
          <header>
            <h2>{pending.landed ? "Landed" : "Waiting to land"}</h2>
            {pending.landed ? <span className="chip" data-kind="verified">Verified · block {pending.landed}</span> : <span className="chip">Private, not public yet</span>}
          </header>
          <dl className="kv">
            <dt>Transaction</dt><dd>{pending.label}</dd>
            <dt>Hash</dt><dd><a className="mono small" href={`https://sepolia.etherscan.io/tx/${pending.hash}`} target="_blank" rel="noreferrer">{short(pending.hash)}</a></dd>
          </dl>
          <p className="small muted">
            {pending.landed ? "Seen in a verified block on this device. Your balance above is already updated from it."
              : "Private builders include it in a block when they win one; this can take a few blocks on Sepolia."}
          </p>
          {pending.landed && <button className="btn small" onClick={() => setState(() => ({ pendingTx: undefined }))}>Dismiss</button>}
        </section>
      )}

      <section className="panel">
        <header><h2>Funding this device</h2><Source b={bal} /></header>
        <p className="small muted">
          Testnet only. Send Sepolia ETH and USDC (faucet.circle.com) to <span className="mono">{me}</span>. The key stays in this browser.
        </p>
      </section>
    </>
  );
}
