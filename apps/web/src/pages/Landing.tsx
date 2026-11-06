// Landing page: light, product-first. The hero is the real app, fed by the live engine, with real cards around it.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import Icon from "../components/Icon";
import LeakCompare from "../landing/LeakCompare";
import Reveal from "../landing/Reveal";
import Skyline from "../landing/Skyline";
import "../landing/site.css";
import { short } from "../lib/format";
import { reqlog, trafficShare } from "../lib/reqlog";
import { useStore } from "../lib/store";
import { isKnown } from "../lib/tokens";
import { quote } from "../lib/trade";
import { formatUnits } from "viem";
import { watchWallet } from "./Watch";

const REPO = import.meta.env.VITE_REPO_URL as string | undefined;
const VIDEO = import.meta.env.VITE_VIDEO_URL as string | undefined;
const ease = [0.22, 1, 0.36, 1] as const;
const go = (id: string) => (e: React.MouseEvent) => (e.preventDefault(), document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }));
const fmtBlock = (h?: string) => (h ? Number(h).toLocaleString("en-US") : "…");

const FAQ = [
  ["How is this different from a private RPC or wallet?", "They hide who you are, but still ask a server about the addresses you care about. Bina Pooche never asks: everyone downloads the same verified blocks, and your phone filters them."],
  ["What does the RPC provider see?", "Block numbers, from a mixnet exit. No address, no IP. The Spy panel shows every request exactly as the server received it."],
  ["Can the relay lie to me?", "Not without getting caught. Every block is hash-checked against its header and confirmed by a second, independent provider."],
  ["How does the private lookup work?", "PIR: the server computes over its whole table, encrypted, and can't tell which row you read. It covers about 1,000 active addresses."],
  ["Why is it a few seconds slower?", "Requests hop through a mixnet. Fine for copy trading; not for high-frequency trading."],
  ["Does it work on mainnet?", "Sepolia today. It needs block access lists (EIP-7928), which reach mainnet with Glamsterdam. The code stays the same."],
  ["Is it open source?", "Yes, MIT. The private core is an SDK any wallet can use."],
];

const LIMITS = [
  "Trades are public once they land.",
  "On Sepolia, sends pass the public mempool. Your IP stays hidden.",
  "Private lookup covers about 1,000 active addresses.",
  "A few seconds slower, a few hundred KB per block.",
];


function useShare() {
  useSyncExternalStore(reqlog.subscribe, reqlog.get);
  return trafficShare();
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className="S-nav" data-scrolled={scrolled}>
      <div className="S-wrap S-nav-in">
        <a className="S-brand" href="#/"><span className="S-mark" aria-hidden />Bina Pooche</a>
        <nav className="S-links" aria-label="Sections">
          <a href="#leak" onClick={go("leak")}>The leak</a>
          <a href="#features" onClick={go("features")}>Features</a>
          <a href="#how" onClick={go("how")}>How it works</a>
          <a href="#faq" onClick={go("faq")}>FAQ</a>
        </nav>
        <a className="S-btn dark sm" href="#/portfolio">Launch app</a>
      </div>
    </header>
  );
}

/** The real app's Watch screen, as a card: wallets swapping in verified blocks right now. */
function AppCard() {
  const traders = useStore((s) => s.traders);
  const tape = useStore((s) => s.tape);
  const head = useStore((s) => s.status.head);
  const wallets = useStore((s) => s.wallets);
  const watched = new Set(wallets.map((w) => w.address.toLowerCase()));
  const rows = traders.slice(0, 4);
  return (
    <div className="S-app">
      <div className="S-app-top">
        <span className="S-dots" aria-hidden><i /><i /><i /></span>
        <span className="S-app-title">Watch · live from verified blocks</span>
        <span className="S-pill good"><Icon name="check" />Verified</span>
      </div>
      <div className="S-app-body">
        <div className="S-app-head">
          <small>Block #{fmtBlock(head)}</small>
          <strong>Who's trading right now?</strong>
        </div>
        <ul className="S-rows">
          {rows.length ? rows.map((t) => (
            <li key={t.address + t.block}>
              <span className="S-av" aria-hidden><Icon name="swap" /></span>
              <span className="S-row-main"><b className="mono">{short(t.address)}</b><small>Swapped in #{fmtBlock(t.block)}</small></span>
              {watched.has(t.address.toLowerCase())
                ? <a className="S-mini on" href="#/watch"><Icon name="check" />Watching</a>
                : <button type="button" className="S-mini" onClick={() => watchWallet({ address: t.address, label: `Trader ${short(t.address)}`, kind: "watch" })}
                    aria-label={`Watch ${short(t.address)} privately`}>Watch</button>}
            </li>
          )) : Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="S-skel"><span className="S-av" /><span className="S-row-main"><b /><small /></span></li>
          ))}
        </ul>
        <div className="S-app-foot">
          <span>{tape[0] ? `${tape[0].txs} txs checked in the last block` : "Reading the first verified block…"}</span>
          <span className="mono">0 addresses asked</span>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const head = useStore((s) => s.status.head);
  const alerts = useStore((s) => s.alerts);
  const traders = useStore((s) => s.traders);
  const wallets = useStore((s) => s.wallets);
  const share = useShare();
  // Counted, not claimed: requests from this visit that contain any of your wallets' addresses.
  const exposed = new Set(reqlog.get().flatMap((e) => wallets.map((w) => w.address.toLowerCase()).filter((a) => e.detail.toLowerCase().includes(a)))).size;
  const latest = traders[0];
  const ready = share.total >= 20;
  // Prefer a copyable swap (both legs known tokens); the app marks unknown tokens and won't copy them.
  const swap = alerts.find((a) => a.kind === "swap" && a.sold && a.bought && isKnown(a.sold.token) && isKnown(a.bought.token));
  const enter = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, delay: d, ease } });
  const pop = (d: number) => (reduce ? {} : { initial: { opacity: 0, scale: 0.92, y: 16 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { type: "spring" as const, stiffness: 260, damping: 22, delay: d } });
  return (
    <section className="S-hero">
      <div className="S-wrap S-hero-copy">
        <motion.h1 className="S-h1" {...enter(0)}>Follow the whales.<br />Leave no trace.</motion.h1>
        <motion.p className="S-lead" {...enter(0.08)}>Copy-trade alerts and balances, without telling any RPC provider who you watch.</motion.p>
        <motion.div className="S-ctas" {...enter(0.14)}>
          <a className="S-btn dark" href="#/portfolio">Launch the app <Icon name="arrow" /></a>
          <a className="S-btn" href="#leak" onClick={go("leak")}>See what your wallet leaks</a>
          {VIDEO && <a className="S-btn" href={VIDEO} target="_blank" rel="noreferrer">Watch the demo</a>}
        </motion.div>
      </div>

      <div className="S-wrap">
        <motion.div className="S-board" {...enter(0.2)}>
          <div className="S-mesh" aria-hidden />
          <div className="S-stage">
            <AppCard />

            <motion.div className="S-float f1" {...pop(0.55)}>
              <span className="S-label">Your addresses sent to providers</span>
              <strong className={`S-big ${exposed ? "" : "good"}`}>{exposed}</strong>
            </motion.div>

            <motion.div className="S-float f2" {...pop(0.7)}>
              <div className="S-alert">
                <span className="S-av warm" aria-hidden><Icon name="bell" />{(swap || latest) && <i className="S-ping" />}</span>
                <span className="S-row-main">
                  <b>{swap ? swap.title : latest ? `${short(latest.address)} swapped` : "Waiting for a swap…"}</b>
                  <small>{swap ? `block ${fmtBlock(swap.block)}` : latest ? `in block ${fmtBlock(latest.block)}` : "Live from verified blocks"}</small>
                </span>
              </div>
              {swap ? <a className="S-btn dark xs" href="#/watch">Copy trade</a> : <a className="S-btn dark xs" href="#/watch">Open</a>}
            </motion.div>

            <motion.div className="S-float f3" {...pop(0.85)}>
              <span className="S-label">Block #{fmtBlock(head)}</span>
              <div className="S-checks">
                {["header", "access list", "receipts", "2nd provider"].map((c, i) => (
                  <motion.span key={c + head} initial={reduce ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.12, duration: 0.25 }}>
                    <Icon name="check" />{c}
                  </motion.span>
                ))}
              </div>
            </motion.div>

            <motion.div className="S-float f4" {...pop(1)}>
              <span className="S-av lilac" aria-hidden><Icon name="lock" /></span>
              <span className="S-row-main"><b>Private balance lookup</b><small>32 ciphertexts, no address</small></span>
            </motion.div>

            <motion.div className="S-float f5" {...pop(1.15)}>
              <span className="S-label">Through Anon-RPC</span>
              <strong className={`S-big ${ready ? "" : "wait"}`}>{ready ? `${share.pct.toFixed(1)}%` : "Measuring…"}</strong>
              <span className="S-bar"><i style={{ width: `${ready ? share.pct : 0}%` }} /></span>
              <span className="S-note">{share.mixnet} of {share.total} requests so far</span>
            </motion.div>
          </div>
        </motion.div>
      </div>

      <div className="S-built" aria-label="Built on">
        <span>Built on</span>
        <div className="S-marquee">
          <ul>{["Ethereum", "Anon-RPC", "Nox mixnet", "EIP-7928", "Paillier PIR", "Sepolia"].concat(["Ethereum", "Anon-RPC", "Nox mixnet", "EIP-7928", "Paillier PIR", "Sepolia"]).map((x, i) => <li key={i} aria-hidden={i >= 6}>{x}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}

/** Real swaps from the live verified feed, newest first. */
function LiveSwaps() {
  const traders = useStore((s) => s.traders).slice(0, 2);
  if (!traders.length) return <ul className="S-rows tight"><li className="S-skel"><span className="S-av" /><span className="S-row-main"><b /><small /></span></li></ul>;
  return (
    <ul className="S-rows tight">
      <AnimatePresence initial={false} mode="popLayout">
        {traders.map((t, i) => (
          <motion.li key={t.address + t.block} layout initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} transition={{ duration: 0.35, ease }}>
            <span className={`S-av ${i === 0 ? "warm" : ""}`}><Icon name="swap" /></span>
            <span className="S-row-main"><b className="mono">{short(t.address)} swapped</b><small>in block {fmtBlock(t.block)}</small></span>
            <span className="S-mini">{i === 0 ? "latest" : "before"}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

/** A live quote through the mixnet: names two tokens and an amount, never an address. */
function useLiveQuote() {
  const [usdc, setUsdc] = useState<string>();
  useEffect(() => {
    let live = true;
    quote("ETH", "USDC", 10n ** 16n).then((v) => live && setUsdc(Number(formatUnits(v, 6)).toFixed(2))).catch(() => {});
    return () => { live = false; };
  }, []);
  return usdc;
}

function Features() {
  const usdc = useLiveQuote();
  const tape = useStore((s) => s.tape);
  const blocks = (tape.length ? tape.slice(0, 4).map((b) => b.number) : ["12075790", "12075789", "12075788", "12075787"]);
  return (
    <section className="S-sec" id="features">
      <div className="S-wrap">
        <Reveal className="S-head">
          <span className="S-eyebrow">Features</span>
          <h2 className="S-h2">Everything a trader checks.<br />None of it watched.</h2>
        </Reveal>
        <div className="S-bento">
          <Reveal className="S-tile w3">
            <div className="S-vis"><LiveSwaps /></div>
            <h3>Whale alerts within a block</h3>
            <p>Real swaps from the latest verified blocks. Nobody learns who you follow.</p>
          </Reveal>
          <Reveal className="S-tile w3" delay={0.05}>
            <div className="S-vis">
              <div className="S-swap"><span>0.01 ETH buys</span><b>{usdc ? <>{usdc} <em>USDC</em></> : <em>quoting…</em>}</b></div>
              <div className="S-path" aria-hidden><span>Your device</span><i /><span>Mixnet</span><i /><span>Chain</span></div>
            </div>
            <h3>Copy in one tap</h3>
            <p>Live Sepolia quote. Signed on your device, sent without your IP.</p>
          </Reveal>
          <Reveal className="S-tile w2">
            <div className="S-vis S-pir" aria-hidden>{Array.from({ length: 48 }, (_, i) => <i key={i} data-on={i === 29} style={{ "--i": i } as React.CSSProperties} />)}</div>
            <h3>Look up any balance</h3>
            <p>The server can't tell which row you read.</p>
          </Reveal>
          <Reveal className="S-tile w2" delay={0.05}>
            <div className="S-vis">
              {["Trading", "Savings", "Hardware"].map((w) => <div className="S-wallet" key={w}><span>{w}</span><i aria-label="hidden balance" /></div>)}
            </div>
            <h3>Wallets nobody can link</h3>
            <p>Balances from verified blocks, never asked for.</p>
          </Reveal>
          <Reveal className="S-tile w2" delay={0.1}>
            <ul className="S-vis S-chain">
              <AnimatePresence initial={false}>
                {blocks.map((n) => (
                  <motion.li key={n} layout initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease }}>
                    <b className="mono">#{fmtBlock(n)}</b><em><Icon name="check" />verified</em>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <h3>Every block proven</h3>
            <p>Four hash checks, live, every 12 seconds.</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function How() {
  const steps = [
    { t: "Ask for the block", d: "Block N, the same request everyone makes. Never an address." },
    { t: "Through the Nox mixnet", d: "Layered encryption. No hop knows who asked what." },
    { t: "Prove it, filter locally", d: "Four hash checks, then your phone finds your wallets." },
  ];
  return (
    <section className="S-sec" id="how">
      <div className="S-wrap">
        <Reveal className="S-head">
          <span className="S-eyebrow">How it works</span>
          <h2 className="S-h2">Don't ask. Download, prove, filter.</h2>
        </Reveal>
        <div className="S-flow" aria-hidden><i /><b /></div>
        <div className="S-steps">
          {steps.map((s, i) => (
            <Reveal className="S-step" key={s.t} delay={i * 0.08}>
              <span className="S-step-n">{i + 1}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="S-proofs" delay={0.1}>
          <code>keccak(rlp(header)) == hash</code>
          <code>keccak(rlp(accessList)) == blockAccessListHash</code>
          <code>trie(receipts) == receiptsRoot</code>
          <code>anchor.hash == hash</code>
        </Reveal>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="S">
      <Nav />
      <main>
        <Hero />

        <section className="S-sec" id="leak">
          <div className="S-wrap">
            <Reveal className="S-head">
              <span className="S-eyebrow">The leak</span>
              <h2 className="S-h2">Your wallet talks every twelve seconds.</h2>
              <p className="S-sub">Same screens, two ways. Left: a normal wallet. Right: us.</p>
            </Reveal>
            <Reveal><LeakCompare /></Reveal>
          </div>
        </section>

        <Features />
        <How />

        <section className="S-sec" id="faq">
          <div className="S-wrap S-two">
            <Reveal>
              <span className="S-eyebrow">Straight answers</span>
              <h2 className="S-h2">What it doesn't hide.</h2>
              <ul className="S-limits">{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
            </Reveal>
            <Reveal className="S-faq" delay={0.05}>
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden /></summary><p>{a}</p></details>)}
            </Reveal>
          </div>
        </section>

        <section className="S-sec">
          <div className="S-wrap">
            <Reveal className="S-cta">
              <div className="S-mesh" aria-hidden />
              <h2 className="S-h2">Your watchlist is your edge.<br />Keep it yours.</h2>
              <p className="S-sub">Runs in your browser. No install, no account.</p>
              <div className="S-ctas">
                <a className="S-btn dark" href="#/portfolio">Launch the app <Icon name="arrow" /></a>
                <a className="S-btn" href="#/spy">Open the Spy panel</a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="S-foot">
        <div className="S-wrap S-foot-grid">
          <div className="S-foot-brand">
            <a className="S-brand" href="#/"><span className="S-mark" aria-hidden />Bina Pooche</a>
            <p>बिना पूछे, Hindi for “without asking”. A private trading companion.</p>
          </div>
          <nav aria-label="App">
            <b>App</b>
            <a href="#/portfolio">Portfolio</a><a href="#/watch">Watch</a><a href="#/lookup">Lookup</a><a href="#/send">Trade</a>
          </nav>
          <nav aria-label="Privacy">
            <b>Privacy</b>
            <a href="#/spy">Spy panel</a><a href="#/network">Network</a><a href="#faq" onClick={go("faq")}>Limits</a>
            {REPO && <a href={REPO} target="_blank" rel="noreferrer">Source</a>}
          </nav>
        </div>
        <Skyline />
        <div className="S-foot-base"><div className="S-wrap"><span>© 2026 Bina Pooche · MIT</span><span>Every request through Anon-RPC</span></div></div>
      </footer>
    </div>
  );
}
