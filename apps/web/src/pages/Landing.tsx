// Landing page: light, product-first. The hero is the real app, fed by the live engine, with real cards around it.
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import Icon from "../components/Icon";
import LeakCompare from "../landing/LeakCompare";
import Reveal from "../landing/Reveal";
import Skyline from "../landing/Skyline";
import "../landing/site.css";
import { short } from "../lib/format";
import { reqlog, trafficShare } from "../lib/reqlog";
import { useStore } from "../lib/store";

const REPO = import.meta.env.VITE_REPO_URL as string | undefined;
const VIDEO = import.meta.env.VITE_VIDEO_URL as string | undefined;
const ease = [0.22, 1, 0.36, 1] as const;
const go = (id: string) => (e: React.MouseEvent) => (e.preventDefault(), document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }));
const fmtBlock = (h?: string) => (h ? Number(h).toLocaleString("en-US") : "…");

const FAQ = [
  ["Is this a wallet?", "A trading companion with a wallet built in. It tracks your wallets and any wallet you watch, alerts you when they trade, and can swap or send from a key kept on your device."],
  ["What does the RPC provider actually see?", "Block numbers, from a mixnet exit. Every user asks for the same blocks, so your requests look like everyone else's. The Spy panel lists every request the app sent, exactly as the server received it."],
  ["Why is it a few seconds slower than MetaMask?", "Requests hop through a mixnet, and your phone downloads whole blocks instead of asking a question. Fine for swing and copy trading; not for high-frequency trading."],
  ["Can the relay lie to me?", "Not without being caught. Every block is checked against its header three ways and confirmed by a second provider. A lie fails a hash check before your phone uses it."],
  ["Does it work on mainnet?", "It runs on Sepolia today, because block access lists (EIP-7928) reach mainnet with the Glamsterdam upgrade. The code doesn't change."],
  ["Is it open source?", "Yes, MIT. The private core is a separate SDK any wallet can use."],
];

const LIMITS = [
  "Your trade is public once it lands. We hide your reading and your intent, not settled money.",
  "On Sepolia there's no private builder, so sends wait in the public mempool. Your IP stays hidden.",
  "Private lookup covers about 1,000 active addresses, not the whole chain.",
  "The mixnet adds a few seconds, and your phone downloads a few hundred KB per block.",
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
  const rows = traders.slice(0, 4);
  return (
    <div className="S-app">
      <div className="S-app-top">
        <span className="S-dots" aria-hidden><i /><i /><i /></span>
        <span className="S-app-title">Watch · trading right now</span>
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
              <span className="S-row-main"><b className="mono">{short(t.address)}</b><small>Swapped on Uniswap {t.dex} · block {fmtBlock(t.block)}</small></span>
              <span className="S-mini">Watch</span>
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
  const status = useStore((s) => s.status);
  const alerts = useStore((s) => s.alerts);
  const share = useShare();
  const swap = alerts.find((a) => a.kind === "swap");
  const enter = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, delay: d, ease } });
  return (
    <section className="S-hero">
      <div className="S-wrap S-hero-copy">
        <motion.a className="S-badge" href="#/network" {...enter(0)}>
          <span className={`S-live ${status.phase === "live" ? "on" : ""}`} aria-hidden />
          {status.phase === "live" ? <>Live on Sepolia · block <b className="mono">{fmtBlock(status.head)}</b></> : "Connecting through the Anon-RPC mixnet…"}
        </motion.a>
        <motion.h1 className="S-h1" {...enter(0.05)}>Watch any wallet.<br />Ask nobody.</motion.h1>
        <motion.p className="S-lead" {...enter(0.1)}>
          Copy-trade alerts, balances and lookups that never tell your RPC provider which addresses you care about.
          Every request goes through Anon-RPC.
        </motion.p>
        <motion.div className="S-ctas" {...enter(0.15)}>
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

            <div className="S-float f1">
              <span className="S-label">Addresses sent to any provider</span>
              <strong className="S-big good">0</strong>
              <span className="S-note">Blocks are asked for by number only</span>
            </div>

            <div className="S-float f2">
              <div className="S-alert">
                <span className="S-av warm" aria-hidden><Icon name="bell" /></span>
                <span className="S-row-main">
                  <b>{swap ? swap.title : "Whale A swapped"}</b>
                  <small>{swap ? `block ${fmtBlock(swap.block)}` : "0.002 ETH → 52.3 USDC"}</small>
                </span>
              </div>
              <a className="S-btn dark xs" href="#/watch">Copy trade</a>
            </div>

            <div className="S-float f3">
              <span className="S-label">Block #{fmtBlock(status.head)}</span>
              <div className="S-checks">
                {["header", "access list", "receipts", "2nd provider"].map((c) => <span key={c}><Icon name="check" />{c}</span>)}
              </div>
            </div>

            <div className="S-float f4">
              <span className="S-av lilac" aria-hidden><Icon name="lock" /></span>
              <span className="S-row-main"><b>Private lookup</b><small>Server saw 32 ciphertexts</small></span>
            </div>

            <div className="S-float f5">
              <span className="S-label">Through Anon-RPC</span>
              {/* Startup is mostly the network bootstrap; wait for a fair sample before showing a number. */}
              <strong className="S-big">{share.total >= 20 ? `${share.pct.toFixed(1)}%` : "measuring…"}</strong>
              <span className="S-bar"><i style={{ width: `${share.total >= 20 ? share.pct : 0}%` }} /></span>
              <span className="S-note">{share.total >= 20 ? `${share.mixnet} of ${share.total} requests this visit` : "Counting this visit's requests"}</span>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="S-wrap S-built">
        <span>Built on</span>
        <ul>
          <li>Ethereum</li><li>Anon-RPC</li><li>Nox mixnet</li><li>EIP-7928</li><li>Uniswap</li><li>Paillier PIR</li>
        </ul>
      </div>
    </section>
  );
}

function Features() {
  const tape = useStore((s) => s.tape);
  const blocks = tape.slice(0, 4);
  return (
    <section className="S-sec" id="features">
      <div className="S-wrap">
        <div className="S-head">
          <span className="S-eyebrow">Features</span>
          <h2 className="S-h2">Everything a trader checks.<br />None of it watched.</h2>
        </div>
        <div className="S-bento">
          <Reveal className="S-tile w3">
            <div className="S-vis">
              <ul className="S-rows tight">
                <li><span className="S-av warm"><Icon name="swap" /></span><span className="S-row-main"><b>Whale A swapped</b><small>12.4 WETH → 41,820 USDC</small></span><span className="S-mini">now</span></li>
                <li><span className="S-av"><Icon name="swap" /></span><span className="S-row-main"><b>Fund wallet swapped</b><small>250,000 USDC → 74.1 WETH</small></span><span className="S-mini">12s</span></li>
              </ul>
            </div>
            <h3>Whale alerts within a block</h3>
            <p>Your phone spots a watched wallet's swap in each verified block and tells you what it sold and bought. Nobody learns who you follow.</p>
          </Reveal>
          <Reveal className="S-tile w3" delay={0.04}>
            <div className="S-vis">
              <div className="S-swap"><span>You pay</span><b>0.5 <em>ETH</em></b></div>
              <div className="S-swap"><span>You get</span><b>≈ 1,690 <em>USDC</em></b></div>
            </div>
            <h3>Copy in one tap</h3>
            <p>Signed on your device and sent out through the mixnet, so no node links the trade to your IP.</p>
          </Reveal>
          <Reveal className="S-tile w2">
            <div className="S-vis S-pir" aria-hidden>{Array.from({ length: 48 }, (_, i) => <i key={i} data-on={i === 29} />)}</div>
            <h3>Look up any balance</h3>
            <p>PIR: the server computes over every row and can't tell which one you read.</p>
          </Reveal>
          <Reveal className="S-tile w2" delay={0.04}>
            <div className="S-vis">
              {["Trading", "Savings", "Hardware"].map((w) => <div className="S-wallet" key={w}><span>{w}</span><i aria-label="hidden balance" /></div>)}
            </div>
            <h3>Wallets nobody can link</h3>
            <p>Balances come from verified blocks, never from asking about your addresses.</p>
          </Reveal>
          <Reveal className="S-tile w2" delay={0.08}>
            <div className="S-vis S-chain">
              {(blocks.length ? blocks.map((b) => b.number) : ["12075790", "12075789", "12075788", "12075787"]).map((n) => (
                <span key={n}><b className="mono">#{fmtBlock(n)}</b><em><Icon name="check" />verified</em></span>
              ))}
            </div>
            <h3>Every block proven</h3>
            <p>Header, access list and receipts are hash-checked, and a second provider confirms each block.</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function How() {
  const steps = [
    { t: "Ask for the block, not the address", d: "Your phone requests block N, the same request every user makes. No address ever leaves the device." },
    { t: "Through the Nox mixnet", d: "Anon-RPC wraps the request in layers of encryption. No single hop knows both who you are and what you asked." },
    { t: "Prove it, then filter locally", d: "Four hash checks pass before the block is used. Then your phone finds your wallets' and whales' activity in it." },
  ];
  return (
    <section className="S-sec" id="how">
      <div className="S-wrap">
        <div className="S-head">
          <span className="S-eyebrow">How it works</span>
          <h2 className="S-h2">Don't ask. Download, prove, filter.</h2>
        </div>
        <div className="S-steps">
          {steps.map((s, i) => (
            <Reveal className="S-step" key={s.t} delay={i * 0.05}>
              <span className="S-step-n">{i + 1}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </Reveal>
          ))}
        </div>
        <div className="S-proofs">
          <code>keccak(rlp(header)) == hash</code>
          <code>keccak(rlp(accessList)) == blockAccessListHash</code>
          <code>trie(receipts) == receiptsRoot</code>
          <code>anchor.hash == hash</code>
        </div>
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
            <div className="S-head">
              <span className="S-eyebrow">The leak</span>
              <h2 className="S-h2">Your wallet talks every twelve seconds.</h2>
              <p className="S-sub">A normal wallet asks its provider about your addresses on every block, from your IP. Here are the same screens, two ways.</p>
            </div>
            <Reveal><LeakCompare /></Reveal>
          </div>
        </section>

        <Features />
        <How />

        <section className="S-sec" id="faq">
          <div className="S-wrap S-two">
            <div>
              <span className="S-eyebrow">Straight answers</span>
              <h2 className="S-h2">What it doesn't hide.</h2>
              <ul className="S-limits">{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
            <div className="S-faq">
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden /></summary><p>{a}</p></details>)}
            </div>
          </div>
        </section>

        <section className="S-sec">
          <div className="S-wrap">
            <div className="S-cta">
              <div className="S-mesh" aria-hidden />
              <h2 className="S-h2">Your watchlist is your edge.<br />Keep it yours.</h2>
              <p className="S-sub">Runs in your browser on phone or desktop. Nothing to install, no account.</p>
              <div className="S-ctas">
                <a className="S-btn dark" href="#/portfolio">Launch the app <Icon name="arrow" /></a>
                <a className="S-btn" href="#/spy">Open the Spy panel</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="S-foot">
        <div className="S-wrap S-foot-grid">
          <div className="S-foot-brand">
            <a className="S-brand" href="#/"><span className="S-mark" aria-hidden />Bina Pooche</a>
            <p>बिना पूछे, Hindi for “without asking”. A private trading companion, built at ETHGlobal Mumbai 2026.</p>
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
        <div className="S-wrap S-foot-base"><span>MIT licensed</span><span>Every request through Anon-RPC</span></div>
      </footer>
    </div>
  );
}
