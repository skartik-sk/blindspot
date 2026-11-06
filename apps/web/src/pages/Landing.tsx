// Landing page.
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import Bento from "../landing/Bento";
import MixnetRoute from "../landing/MixnetRoute";
import Phone from "../landing/Phone";
import Reveal from "../landing/Reveal";
import SpyWindow from "../landing/SpyWindow";
import "../landing/landing.css";
import { useStore } from "../lib/store";

const REPO = import.meta.env.VITE_REPO_URL as string | undefined;
const VIDEO = import.meta.env.VITE_VIDEO_URL as string | undefined;
const ease = [0.22, 1, 0.36, 1] as const;

const PROOF = [
  { t: "The header is real", d: "Its fields hash to the block hash. A second, independent provider confirms that hash.", c: <>keccak(rlp(header)) <em>== hash ✓</em></> },
  { t: "No balance change is missing", d: "The block's access list hashes to the value the header commits to (EIP-7928).", c: <>keccak(rlp(bal)) <em>== header.balHash ✓</em></> },
  { t: "No trade is hidden or invented", d: "Every receipt goes back into a trie that must rebuild the header's receipts root.", c: <>trieRoot(receipts) <em>== receiptsRoot ✓</em></> },
  { t: "It's one chain", d: "Each block links to the one before it. Only then does your phone filter it, locally.", c: <>block.parentHash <em>== prev.hash ✓</em></> },
];

const FAQ = [
  ["Is this a wallet?", "It's a trading companion with a wallet built in. It tracks your wallets and any wallet you watch, alerts you on trades, and can swap or send from a key kept on your device."],
  ["What does the RPC provider actually see?", "Block numbers, from a mixnet exit. Every user asks for the same blocks, so your requests look like everyone else's. The Spy panel in the app shows every request it sent, exactly as the server got it."],
  ["Why is it a few seconds slower than MetaMask?", "Requests hop through a mixnet, and your phone downloads whole blocks instead of asking a question. For swing and copy trading that's a fair price; for high-frequency trading it isn't."],
  ["Can the relay lie to me?", "Not without being caught. Every block is checked against its header three ways and confirmed by a second provider. A lie fails a hash check before your phone uses it."],
  ["Does it work on mainnet?", "It runs on Sepolia today, because block access lists (EIP-7928) arrive on mainnet with the Glamsterdam upgrade. The code doesn't change."],
  ["Is it open source?", "Yes, MIT. The private core is a separate SDK any wallet can use."],
];

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  const go = (id: string) => (e: React.MouseEvent) => (e.preventDefault(), document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }));
  return (
    <header className="L-nav" data-scrolled={scrolled}>
      <div className="L-wrap">
        <a className="L-brand" href="#/"><span className="L-mark" aria-hidden />Bina Pooche</a>
        <nav className="L-links" aria-label="Sections">
          <a href="#leak" onClick={go("leak")}>The leak</a>
          <a href="#features" onClick={go("features")}>Features</a>
          <a href="#proof" onClick={go("proof")}>Security</a>
          <a href="#faq" onClick={go("faq")}>FAQ</a>
          {REPO && <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>}
        </nav>
        <a className="L-btn sm primary" href="#/portfolio">Launch app</a>
      </div>
    </header>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const status = useStore((s) => s.status);
  const tape = useStore((s) => s.tape);
  const kb = tape.length ? Math.round(tape.reduce((a, b) => a + b.bytes, 0) / tape.length / 1000) : null;
  const up = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: d, ease } });
  return (
    <section className="L-hero">
      <span className="L-glow a" aria-hidden /><span className="L-glow b" aria-hidden />
      <div className="L-wrap L-hero-grid">
        <div>
          <motion.a className="L-pill" href="#/network" {...up(0)}>
            <span className="L-live-dot" aria-hidden />
            {status.phase === "live" ? `Live on Sepolia · block ${Number(status.head).toLocaleString("en-US")}` : "Connecting through the mixnet"}
            <b>Anon-RPC</b>
          </motion.a>
          <motion.h1 className="L-h1" {...up(0.05)}>
            Watch whales.<br />Copy trades.<br /><span className="hot">Ask nobody.</span>
          </motion.h1>
          <motion.p className="L-lede" {...up(0.1)}>
            Your wallet tells its RPC provider what you hold, who you follow and what you're about to trade.
            Bina Pooche never asks about an address. It reads whole blocks through a mixnet, proves them,
            and finds your trades on your phone.
          </motion.p>
          <motion.div className="L-cta" {...up(0.15)}>
            <a className="L-btn primary" href="#/portfolio">Launch app</a>
            <a className="L-btn" href="#leak" onClick={(e) => (e.preventDefault(), document.getElementById("leak")?.scrollIntoView({ behavior: "smooth" }))}>See what leaks</a>
            {VIDEO && <a className="L-btn" href={VIDEO} target="_blank" rel="noreferrer">Watch demo</a>}
          </motion.div>
          <motion.div className="L-stats" {...up(0.2)}>
            <div className="L-stat"><strong className="L-ok">0</strong><span>addresses sent to any provider</span></div>
            <div className="L-stat"><strong>4</strong><span>proofs checked per block</span></div>
            <div className="L-stat"><strong>~12s</strong><span>from whale trade to your alert</span></div>
            <div className="L-stat"><strong>{kb ? `${kb} KB` : "1.2s"}</strong><span>{kb ? "per block, live average" : "private balance lookup"}</span></div>
          </motion.div>
          <p className="L-meaning">बिना पूछे · bina pooche · Hindi for “without asking”</p>
        </div>
        <Phone />
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="L">
      <Nav />
      <main>
        <Hero />

        <div className="L-strip">
          <div className="L-wrap">
            <div className="L-strip-row">
              <span>Anon-RPC</span><span>Sphinx mixnet</span><span className="mono">EIP-7928</span><span>Uniswap v3</span><span>Flashbots Protect</span><span>Paillier PIR</span><span>Ethereum</span>
            </div>
            <p>Built on open infrastructure. Every request goes through Anon-RPC by default.</p>
          </div>
        </div>

        <section className="L-sec" id="leak">
          <div className="L-wrap">
            <Reveal>
              <div className="L-kicker">The leak</div>
              <p className="L-statement">
                Every wallet polls its provider about your addresses. <span>Twelve seconds at a time, your provider learns your
                portfolio, your copy-trade list and where you live.</span>
              </p>
            </Reveal>
            <Reveal delay={0.05}><SpyWindow /></Reveal>
          </div>
        </section>

        <section className="L-sec" id="features">
          <div className="L-wrap">
            <Reveal>
              <div className="L-kicker">Features</div>
              <h2 className="L-h2">Everything a trader checks. None of it watched.</h2>
            </Reveal>
            <Bento />
          </div>
        </section>

        <section className="L-sec">
          <div className="L-wrap">
            <Reveal>
              <div className="L-kicker">The route</div>
              <h2 className="L-h2">Five hops between you and the node.</h2>
              <p className="L-sub">Anon-RPC wraps every request in layers of encryption and sends it through a Sphinx mixnet. No single hop knows both who you are and what you asked.</p>
            </Reveal>
            <Reveal delay={0.05}><MixnetRoute /></Reveal>
          </div>
        </section>

        <section className="L-sec" id="proof">
          <div className="L-wrap">
            <Reveal>
              <div className="L-kicker">Security</div>
              <h2 className="L-h2">Don't trust the relay. Verify every block.</h2>
              <p className="L-sub">Your phone uses a block only after four checks pass. Change one byte anywhere and a hash stops matching.</p>
            </Reveal>
            <div className="L-proof">
              {PROOF.map((p, i) => (
                <Reveal className="L-step" key={p.t} delay={i * 0.05}>
                  <span className="L-step-n">{i + 1}</span>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                  <code>{p.c}</code>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="L-sec" id="faq">
          <div className="L-wrap L-two">
            <Reveal>
              <div className="L-kicker">Straight answers</div>
              <h2 className="L-h2">What it doesn't hide.</h2>
              <ul className="L-honest">
                <li>Your trade is public once it lands. We hide your reading and your intent, not settled money.</li>
                <li>The mixnet adds a few seconds per request.</li>
                <li>Your phone downloads a few hundred kilobytes per block.</li>
                <li>Testnet until block access lists reach mainnet.</li>
              </ul>
            </Reveal>
            <Reveal className="L-faq" delay={0.05}>
              {FAQ.map(([q, a]) => (
                <details key={q}><summary>{q}</summary><p>{a}</p></details>
              ))}
            </Reveal>
          </div>
        </section>

        <section className="L-sec">
          <div className="L-wrap">
            <Reveal className="L-final">
              <div className="L-kicker">Start now</div>
              <h2>Your watchlist is your edge. Keep it yours.</h2>
              <p className="L-sub" style={{ marginTop: 0 }}>Runs in your browser on phone or desktop. Nothing to install, no account.</p>
              <div className="L-cta" style={{ marginTop: 4 }}>
                <a className="L-btn primary" href="#/portfolio">Launch app</a>
                <a className="L-btn" href="#/spy">Open the Spy panel</a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="L-foot">
        <div className="L-wrap">
          <span>© 2026 Bina Pooche · MIT licensed · Built at ETHGlobal Mumbai</span>
          <span>{REPO ? <a href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a> : "Every request through Anon-RPC"}</span>
        </div>
      </footer>
    </div>
  );
}
