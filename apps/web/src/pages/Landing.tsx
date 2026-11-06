// Landing page: cinematic dark, headline behind the phone, redaction as the signature.
import { motion, useReducedMotion } from "motion/react";
import Icon from "../components/Icon";
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
const scrollTo = (id: string) => (e: React.MouseEvent) => (e.preventDefault(), document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }));

const PROOF = [
  { t: "The header is real", d: "Its fields hash to the block hash, and a second, independent provider confirms that hash.", c: <>keccak(rlp(header)) <em>== hash ✓</em></> },
  { t: "No balance change is missing", d: "The block's access list hashes to the value the header commits to (EIP-7928).", c: <>keccak(rlp(bal)) <em>== balHash ✓</em></> },
  { t: "No trade is hidden or invented", d: "Every receipt goes back into a trie that has to rebuild the header's receipts root.", c: <>trie(receipts) <em>== receiptsRoot ✓</em></> },
  { t: "It's one chain", d: "Each block links to the one before it. Only then does your phone filter it, locally.", c: <>parentHash <em>== prev.hash ✓</em></> },
];

const FAQ = [
  ["Is this a wallet?", "It's a trading companion with a wallet built in. It tracks your wallets and any wallet you watch, alerts you when they trade, and can swap or send from a key kept on your device."],
  ["What does the RPC provider actually see?", "Block numbers, from a mixnet exit. Every user asks for the same blocks, so your requests look like everyone else's. The Spy panel in the app lists every request it sent, exactly as the server received it."],
  ["Why is it a few seconds slower than MetaMask?", "Requests hop through a mixnet, and your phone downloads whole blocks instead of asking a question. For swing and copy trading that's a fair price; for high-frequency trading it isn't."],
  ["Can the relay lie to me?", "Not without being caught. Every block is checked against its header three ways and confirmed by a second provider. A lie fails a hash check before your phone uses it."],
  ["Does it work on mainnet?", "It runs on Sepolia today, because block access lists (EIP-7928) reach mainnet with the Glamsterdam upgrade. The code doesn't change."],
  ["Is it open source?", "Yes, MIT. The private core is a separate SDK any wallet can use."],
];

function Nav() {
  return (
    <header className="L-nav">
      <div className="L-wrap">
        <a className="L-nav-brand" href="#/"><span className="L-logo" aria-hidden /><span>Bina Pooche</span></a>
        <nav className="L-pillnav" aria-label="Sections">
          <a href="#leak" onClick={scrollTo("leak")}>The leak</a>
          <a href="#features" onClick={scrollTo("features")}>Features</a>
          <a href="#proof" onClick={scrollTo("proof")}>Security</a>
          <a href="#faq" onClick={scrollTo("faq")}>FAQ</a>
        </nav>
        <a className="L-btn sm" href="#/portfolio"><Icon name="send" />Launch app</a>
      </div>
    </header>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const status = useStore((s) => s.status);
  const fade = (d: number, y = 24) => (reduce ? {} : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: d, ease } });
  return (
    <section className="L-hero">
      <span className="L-aura" aria-hidden />
      <motion.a className="L-live" href="#/network" {...fade(0, 10)}>
        <span className="L-dot" aria-hidden />
        {status.phase === "live" ? <>Live on Sepolia · block <b>{Number(status.head).toLocaleString("en-US")}</b></> : "Connecting through the Anon-RPC mixnet"}
      </motion.a>
      <div className="L-stage">
        <motion.h1 className="L-mega" {...fade(0.05, 30)}>
          <span className="l1">Watch whales</span>
          <span className="l2">Ask nobody</span>
        </motion.h1>
        <motion.div className="L-phone-wrap" initial={reduce ? false : { opacity: 0, y: 80 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15, ease }}>
          <span className="L-phone-glow" aria-hidden />
          <Phone />
        </motion.div>
        <span className="L-hero-fade" aria-hidden />
      </div>
      <motion.div className="L-hero-foot" {...fade(0.25)}>
        <p>
          A trading companion that never asks about an address. It reads whole blocks through a mixnet, proves them,
          and finds your whales' trades on your phone. Your provider learns nothing.
        </p>
        <div className="L-cta">
          <a className="L-btn primary" href="#/portfolio">Launch the app</a>
          <a className="L-btn" href="#leak" onClick={scrollTo("leak")}>See what your wallet leaks</a>
          {VIDEO && <a className="L-btn" href={VIDEO} target="_blank" rel="noreferrer">Watch the demo</a>}
        </div>
        <span className="L-meaning">बिना पूछे · bina pooche · Hindi for “without asking”</span>
      </motion.div>
    </section>
  );
}

function Intro() {
  const tape = useStore((s) => s.tape);
  const kb = tape.length ? Math.round(tape.reduce((a, b) => a + b.bytes, 0) / tape.length / 1000) : null;
  return (
    <section className="L-sec" style={{ paddingTop: 24 }}>
      <div className="L-wrap">
        <Reveal className="L-card L-center">
          <span className="L-icon-glow" aria-hidden />
          <span className="L-icon" aria-hidden />
          <h2 className="L-h2"><span className="g">Private by default.</span><span className="w">Not by setting.</span></h2>
          <p className="L-sub">
            Every request goes through Anon-RPC. Every block is proven before you see it. Every wallet you hold or watch
            stays on this device. There is nothing to turn on.
          </p>
          <a className="L-btn primary" href="#/portfolio">Start watching</a>
          <div className="L-stats">
            <div className="L-stat"><strong className="L-ok">0</strong><span>addresses sent to any provider</span></div>
            <div className="L-stat"><strong>4</strong><span>proofs checked on every block</span></div>
            <div className="L-stat"><strong>~12s</strong><span>from a whale's trade to your alert</span></div>
            <div className="L-stat"><strong>{kb ? `${kb}KB` : "1.2s"}</strong><span>{kb ? "per block, live average" : "private balance lookup"}</span></div>
          </div>
        </Reveal>
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
        <Intro />

        <section className="L-sec" id="leak">
          <div className="L-wrap">
            <Reveal className="L-head">
              <span className="L-kicker">The leak</span>
              <h2 className="L-h2"><span className="w">Your wallet talks.</span><span className="g">Every twelve seconds.</span></h2>
              <p className="L-sub">A normal wallet asks its provider about your addresses on every block, from your IP. Here's the same screen, two ways.</p>
            </Reveal>
            <Reveal delay={0.05}><SpyWindow /></Reveal>
          </div>
        </section>

        <section className="L-sec" id="features">
          <div className="L-wrap">
            <Reveal className="L-head">
              <span className="L-kicker">Features</span>
              <h2 className="L-h2"><span className="w">Everything a trader checks.</span><span className="g">None of it watched.</span></h2>
            </Reveal>
            <Bento />
          </div>
        </section>

        <section className="L-sec">
          <div className="L-wrap">
            <Reveal className="L-head">
              <span className="L-kicker">The route</span>
              <h2 className="L-h2"><span className="w">Five hops between</span><span className="g">you and the node.</span></h2>
              <p className="L-sub">Anon-RPC wraps each request in layers of encryption and sends it through a Sphinx mixnet. No single hop knows both who you are and what you asked.</p>
            </Reveal>
            <Reveal delay={0.05}><MixnetRoute /></Reveal>
          </div>
        </section>

        <section className="L-sec" id="proof">
          <div className="L-wrap">
            <Reveal className="L-head">
              <span className="L-kicker">Security</span>
              <h2 className="L-h2"><span className="w">Don't trust the relay.</span><span className="g">Verify every block.</span></h2>
              <p className="L-sub">Your phone uses a block only after four checks pass. Change a single byte and a hash stops matching.</p>
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
            <Reveal className="L-head">
              <span className="L-kicker">Straight answers</span>
              <h2 className="L-h2"><span className="w">What it</span><span className="g">doesn't hide.</span></h2>
              <ul className="L-honest">
                <li>Your trade is public once it lands. We hide your reading and your intent, not settled money.</li>
                <li>The mixnet adds a few seconds per request.</li>
                <li>Your phone downloads a few hundred kilobytes per block.</li>
                <li>Testnet until block access lists reach mainnet.</li>
              </ul>
            </Reveal>
            <Reveal className="L-faq" delay={0.05}>
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
            </Reveal>
          </div>
        </section>

        <section className="L-sec">
          <div className="L-wrap">
            <Reveal className="L-card L-final">
              <span className="L-icon" aria-hidden />
              <h2 className="L-h2"><span className="g">Your watchlist is your edge.</span><span className="w">Keep it yours.</span></h2>
              <p className="L-sub">Runs in your browser on phone or desktop. Nothing to install, no account.</p>
              <div className="L-cta">
                <a className="L-btn primary" href="#/portfolio">Launch the app</a>
                <a className="L-btn" href="#/spy">Open the Spy panel</a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="L-foot">
        <div className="L-wrap">
          <a className="L-nav-brand" href="#/"><span className="L-logo" aria-hidden /><span>Bina Pooche</span></a>
          <span>MIT licensed · Built at ETHGlobal Mumbai 2026 · Every request through Anon-RPC</span>
          {REPO && <a href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a>}
        </div>
      </footer>
    </div>
  );
}
