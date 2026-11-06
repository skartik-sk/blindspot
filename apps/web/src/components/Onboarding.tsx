// First run: three short slides, then a real connection through the mixnet (live progress), then pick wallets.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import { network } from "../lib/anon";
import { friendly } from "../lib/errors";
import { rescan } from "../lib/engine";
import { short } from "../lib/format";
import { addWallet, useStore } from "../lib/store";
import { ONBOARDED_KEY, loadBalance } from "../lib/actions";
import Icon from "./Icon";

const finish = () => {
  try {
    localStorage.setItem(ONBOARDED_KEY, String(Date.now()));
  } catch {}
};

function LeakVisual() {
  const reduce = useReducedMotion();
  const [covered, setCovered] = useState(!!reduce);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setCovered(true), 900);
    return () => clearTimeout(t);
  }, [reduce]);
  return (
    <div className="ob-vis ob-leak" aria-hidden>
      <div className="ob-req"><span className="mono">eth_getBalance(</span><span className="ob-addr" data-covered={covered}><span className="mono">0x8d48…25dc</span></span><span className="mono">)</span></div>
      <div className="ob-req faint"><span className="mono">from 49.36.xxx.xxx</span></div>
      <div className="ob-arrow">↓</div>
      <div className="ob-req good"><span className="mono">eth_getBlockAccessList(12,074,105)</span></div>
      <div className="ob-req faint"><span className="mono">from a mixnet exit</span></div>
    </div>
  );
}

function AlertsVisual() {
  return (
    <div className="ob-vis ob-alerts" aria-hidden>
      {[["Whale 1 swapped", "12.4 WETH → 41,820 USDC"], ["Fund wallet swapped", "250k USDC → 74.1 WETH"], ["Trader 0x389e swapped", "3,100 USDC → 0.92 WETH"]].map(([t, d], i) => (
        <motion.div key={t} className="ob-alert" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08, duration: 0.25, ease: [0, 0, 0.2, 1] }}>
          <span className="alert-icon" data-kind="swap"><Icon name="swap" /></span>
          <div><b>{t}</b><span>{d}</span></div>
        </motion.div>
      ))}
    </div>
  );
}

function ProofVisual() {
  return (
    <div className="ob-vis ob-proof" aria-hidden>
      {["Header hash", "Access list hash", "Receipts root", "Second provider"].map((t, i) => (
        <motion.div key={t} className="ob-check" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08, duration: 0.2, ease: [0, 0, 0.2, 1] }}>
          <span className="ob-tick"><Icon name="check" /></span>{t}<span className="ob-match">matches</span>
        </motion.div>
      ))}
    </div>
  );
}

const SLIDES = [
  { title: "Your wallet talks too much.", body: "Every few seconds it tells its RPC provider your addresses, from your IP. That's your portfolio and your strategy, handed over.", vis: <LeakVisual /> },
  { title: "Watch whales without being watched.", body: "Blindspot reads whole blocks through a mixnet and finds the trades you care about on this device. Nobody learns who you follow.", vis: <AlertsVisual /> },
  { title: "Every block is proven.", body: "Before anything reaches your screen, four checks confirm the data is exactly what the chain committed to.", vis: <ProofVisual /> },
];

function Connect({ onNext }: { onNext: () => void }) {
  const status = useStore((s) => s.status);
  const tape = useStore((s) => s.tape);
  const steps = [
    { t: `Start Anon-RPC (${network().short} mixnet)`, done: status.phase !== "idle" },
    { t: "Open a private route", done: status.phase === "live" || tape.length > 0 },
    { t: "Verify the latest block", done: tape.length > 0 },
    { t: "Confirm with a second provider", done: tape.some((b) => b.anchored) },
  ];
  const ready = steps.every((s) => s.done);
  const current = steps.findIndex((s) => !s.done);
  return (
    <div className="ob-body">
      <div className="ob-vis ob-steps">
        {steps.map((s, i) => (
          <div key={s.t} className="ob-step" data-state={s.done ? "done" : i === current ? "run" : "wait"}>
            <span className="ob-dot">{s.done ? <Icon name="check" /> : null}</span>
            <span>{s.t}</span>
          </div>
        ))}
        {ready && <p className="small muted">Block {tape[0]?.number} verified in {tape[0].ms < 1000 ? `${tape[0].ms} ms` : `${(tape[0].ms / 1000).toFixed(1)} s`}. You're connected without revealing anything.</p>}
        {status.phase === "error" && !ready && <p className="small muted">Still trying: mixnet routes sometimes take a few tries. {friendly(status.message)}</p>}
      </div>
      <h2 className="ob-title">{ready ? "You're connected, privately." : "Connecting privately…"}</h2>
      <p className="ob-text">This takes a few seconds the first time. Every request from now on goes through the mixnet.</p>
      <button className="btn primary ob-cta" onClick={onNext} disabled={!ready} aria-busy={!ready}>{ready ? "Continue" : "Connecting…"}</button>
      {!ready && <button className="btn ghost ob-skip" onClick={onNext}>Continue in the background</button>}
    </div>
  );
}

function Wallets({ onDone }: { onDone: () => void }) {
  const traders = useStore((s) => s.traders);
  const [addr, setAddr] = useState("");
  const [picked, setPicked] = useState<Address[]>([]);
  const valid = isAddress(addr.trim());
  const done = () => {
    if (valid) {
      const a = addr.trim().toLowerCase() as Address;
      addWallet({ address: a, label: "My wallet", kind: "mine" });
      loadBalance(a).catch(() => {});
      rescan(a);
    }
    for (const t of picked) {
      addWallet({ address: t, label: `Trader ${short(t)}`, kind: "watch" });
      rescan(t);
    }
    onDone();
  };
  const suggestions = [...new Map(traders.map((t) => [t.address, t])).values()].slice(0, 4);
  return (
    <div className="ob-body">
      <h2 className="ob-title">Add your wallets.</h2>
      <p className="ob-text">Saved on this device only. No server is ever told which addresses are yours.</p>
      <div className="field">
        <label htmlFor="ob-addr">Your wallet address (optional)</label>
        <input id="ob-addr" type="text" className="mono" placeholder="0x…" value={addr} onChange={(e) => setAddr(e.target.value)}
          autoComplete="off" spellCheck={false} inputMode="text" aria-invalid={addr !== "" && !valid} />
        {addr !== "" && !valid && <span className="error-text">That doesn't look like an Ethereum address.</span>}
      </div>
      <div className="field">
        <label>Watch someone trading right now</label>
        {suggestions.length === 0 ? (
          <p className="small muted">Active traders appear here as blocks arrive. You can add some later from Watch.</p>
        ) : (
          <div className="ob-picks">
            {suggestions.map((t) => {
              const on = picked.includes(t.address);
              return (
                <button key={t.address} type="button" className="ob-pick" aria-pressed={on}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== t.address) : [...p, t.address]))}>
                  <span className="mono">{short(t.address)}</span>
                  <span className="small muted">Uniswap {t.dex} · block {t.block}</span>
                  <span className="ob-pick-mark">{on ? <Icon name="check" /> : <Icon name="plus" />}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button className="btn primary ob-cta" onClick={done}>{valid || picked.length ? "Start" : "Start without wallets"}</button>
    </div>
  );
}

export default function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  const total = SLIDES.length + 2;
  const close = () => (finish(), onClose());
  const next = () => setI((x) => Math.min(x + 1, total - 1));

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-label="Welcome to Blindspot">
      <div className="ob-card">
        <div className="ob-top">
          <div className="ob-dots" aria-label={`Step ${i + 1} of ${total}`}>
            {Array.from({ length: total }, (_, k) => <span key={k} data-on={k === i} data-done={k < i} />)}
          </div>
          {i < total - 1 && <button className="btn ghost small" onClick={close}>Skip</button>}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={i} className="ob-slide"
            initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -24 }}
            transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}>
            {i < SLIDES.length ? (
              <div className="ob-body">
                {SLIDES[i].vis}
                <h2 className="ob-title">{SLIDES[i].title}</h2>
                <p className="ob-text">{SLIDES[i].body}</p>
                <button className="btn primary ob-cta" onClick={next}>{i === 0 ? "Show me" : "Next"}</button>
              </div>
            ) : i === SLIDES.length ? (
              <Connect onNext={next} />
            ) : (
              <Wallets onDone={close} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
