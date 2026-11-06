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
    // Buy what they bought (if we can trade it), paying with what they sold or ETH.
    const target: Asset = bought ?? (sold === "USDC" ? "WETH" : "USDC");
    const pay: Asset = sold && sold !== target ? sold : "ETH";
    setToAsset(target);
    setAsset(pay);
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
      const m = (e as Error).message;
      setErr(route === "private" && /DnsFailed|Tunnel|fetch|network/i.test(m)
        ? "The private route (Flashbots Protect on Sepolia) isn't reachable right now. Switch Route to Public: it still goes through the mixnet, so your IP stays hidden, but bots can see it before it lands."
        : m.split("\n")[0]);
    } finally {
      setStep(undefined);
    }
  }

  const flip = () => {
    if (mode !== "Swap") return;
    const nextPay: Asset = toAsset;
    const nextGet: Asset = asset === "ETH" ? "WETH" : asset;
    if (nextPay === nextGet) return;
    setAsset(nextPay);
    setToAsset(nextGet);
    setAmount("");
  };
  const max = () => have !== undefined && setAmount(formatUnits(asset === "ETH" ? (have * 9n) / 10n : have, DECIMALS[asset]));

  return (
    <>
      <header className="head">
        <h1>{mode === "Swap" ? "Trade" : "Send"}</h1>
        <p>Signed on this device, sent through the mixnet. Nobody sees it before it lands.</p>
      </header>

      {copy && (
        <section className="callout copy-callout">
          <strong>Copying {copy.title.replace(" swapped", "")}</strong>
          <span className="muted">{copy.detail} in block {copy.block}. Pick your own size.</span>
        </section>
      )}

      <form className="trade" onSubmit={submit}>
        <div className="segtabs trade-mode" role="tablist" aria-label="Action">
          {(["Swap", "Send"] as const).map((m) => (
            <button type="button" key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>{m === "Swap" ? "Trade" : "Send"}</button>
          ))}
        </div>

        <div className="tcard">
          <div className="tcard-top">
            <label htmlFor="amt">{mode === "Swap" ? "You pay" : "You send"}</label>
            <span className="small muted">
              Balance {have !== undefined ? fmtAmount(have, DECIMALS[asset]) : "…"}
              {have !== undefined && have > 0n && <button type="button" className="max" onClick={max}>Max</button>}
            </span>
          </div>
          <div className="tcard-row">
            <input id="amt" className="amount" type="text" inputMode="decimal" autoComplete="off" placeholder="0" value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))} aria-invalid={!enough} />
            <div className="toks" role="group" aria-label="Asset">
              {ASSETS.map((a) => <button type="button" key={a} aria-pressed={a === asset} onClick={() => setAsset(a)}>{a}</button>)}
            </div>
          </div>
          {!enough && <span className="error-text">That's more than you have.</span>}
        </div>

        {mode === "Swap" ? (
          <>
            <button type="button" className="flip" onClick={flip} aria-label="Swap direction"><Icon name="swap" /></button>
            <div className="tcard">
              <div className="tcard-top"><span className="lbl">You get</span><span className="small muted">Uniswap v3 · 0.05% pool</span></div>
              <div className="tcard-row">
                <output className="amount" aria-live="polite">
                  {out !== undefined ? fmtAmount(out, DECIMALS[toAsset]) : amt ? <span className="skeleton" style={{ width: "5ch" }} /> : <span className="faint">0</span>}
                </output>
                <div className="toks" role="group" aria-label="Receive">
                  {(["USDC", "WETH"] as Asset[]).map((a) => <button type="button" key={a} aria-pressed={a === toAsset} onClick={() => setToAsset(a)}>{a}</button>)}
                </div>
              </div>
              <span className="small faint">0.5% max slippage. The quote request carries no address.</span>
            </div>
          </>
        ) : (
          <div className="tcard">
            <div className="tcard-top"><label htmlFor="to">To</label></div>
            <input id="to" type="text" className="mono addr-input" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} autoComplete="off"
              aria-invalid={to !== "" && !isAddress(to.trim())} />
            {to !== "" && !isAddress(to.trim()) && <span className="error-text">That doesn't look like an Ethereum address.</span>}
          </div>
        )}

        <fieldset className="routes">
          <legend>Route</legend>
          <label className="route" data-on={route === "private"}>
            <input type="radio" name="route" checked={route === "private"} onChange={() => setRoute("private")} />
            <span><strong>Private</strong><span className="small muted">Flashbots Protect. Skips the public mempool, can't be front-run.</span></span>
          </label>
          <label className="route" data-on={route === "public"}>
            <input type="radio" name="route" checked={route === "public"} onChange={() => setRoute("public")} />
            <span><strong>Public</strong><span className="small muted">Mempool, still through the mixnet. IP hidden, bots see it first.</span></span>
          </label>
        </fieldset>

        {err && <p className="error-text" role="alert">{err}</p>}

        <div className="dock">
          {step && <span className="small dock-step" aria-live="polite">{step}</span>}
          <button className="btn primary dock-btn" disabled={!canSend} aria-busy={!!step}>
            <Icon name="send" />{step ? "Working…" : mode === "Swap" ? `Trade ${asset} for ${toAsset}` : `Send ${asset} privately`}
          </button>
        </div>
      </form>

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
