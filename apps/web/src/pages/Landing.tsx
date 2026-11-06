// Landing page. One moment of motion: a normal wallet request gets its address redacted and becomes ours.
import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import Tape from "../components/Tape";
import { network } from "../lib/anon";
import { useStore } from "../lib/store";

const REPO = import.meta.env.VITE_REPO_URL as string | undefined;
const VIDEO = import.meta.env.VITE_VIDEO_URL as string | undefined;
const SAMPLE = "0x8d48be79d5be14bfec88dfd1276601e9b5ac25dc";

function Redaction() {
  const head = useStore((s) => s.status.head);
  const [phase, setPhase] = useState<"leak" | "cover" | "ours">("leak");
  const [run, setRun] = useState(0);
  useEffect(() => {
    setPhase("leak");
    const a = setTimeout(() => setPhase("cover"), 1600);
    const b = setTimeout(() => setPhase("ours"), 2600);
    return () => (clearTimeout(a), clearTimeout(b));
  }, [run]);
  const block = head ? Number(head).toLocaleString("en-US") : "12,074,105";
  return (
    <figure className="lp-req" data-phase={phase} aria-label="A wallet request, before and after">
      <figcaption className="lp-req-who">
        {phase === "ours" ? "What Bina Pooche sends" : "What your wallet sends today"}
      </figcaption>
      <div className="lp-req-line mono" aria-live="polite">
        {phase === "ours" ? (
          <span className="lp-req-ours">eth_getBlockAccessList(<b>{block}</b>)</span>
        ) : (
          <span>
            eth_getBalance(<span className="lp-req-addr"><span className="lp-req-text">{SAMPLE}</span><span className="lp-req-bar" aria-hidden /></span>)
          </span>
        )}
      </div>
      <div className="lp-req-meta">
        {phase === "ours"
          ? <>From a mixnet exit. A block number everyone asks for. <span className="up">Nothing about you.</span></>
          : <>From your IP, every 12 seconds. <span className="down">Your address, your balance, your habits.</span></>}
      </div>
      <button className="btn ghost small lp-replay" onClick={() => setRun((r) => r + 1)}>Replay</button>
    </figure>
  );
}

const FEATURES = [
  { icon: "watch", title: "Watch any wallet", body: "Follow whales and get an alert the moment they swap, with what they sold and bought.", learns: "Nobody learns who you follow." },
  { icon: "swap", title: "Copy the trade", body: "One tap fills a Uniswap swap in the same direction, at your size, signed on your phone.", learns: "Sent privately, never in the public mempool first." },
  { icon: "portfolio", title: "Private portfolio", body: "Balances for all your wallets, updated from every verified block.", learns: "No provider can tie your wallets together." },
  { icon: "lookup", title: "Look up any address", body: "Check a balance with private information retrieval: the server does the same work for every address.", learns: "The server can't tell which one you asked about." },
];

const LEAKS = [
  ["Your balances", "eth_getBalance(you)", "Block 12,074,105, same bytes as everyone"],
  ["Who you copy", "eth_getLogs(whale)", "Filtered on your phone"],
  ["Your next trade", "Public mempool, visible to bots", "Private builder via the mixnet"],
  ["Who you are", "Your IP on every request", "A mixnet exit, a fresh route per task"],
];

const PROOF = [
  ["The header is real", "Its fields hash to the block hash, and a second provider agrees on that hash."],
  ["The balance changes are complete", "The block's access list hashes to the value committed in the header (EIP-7928)."],
  ["The trades are all there", "Every receipt rebuilds the header's receipts root. Nothing invented, edited or hidden."],
  ["It's one chain", "Each block links to the one before it. Then your phone filters it, locally."],
];

export default function Landing() {
  const status = useStore((s) => s.status);
  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="brand" href="#/"><span className="brand-mark" aria-hidden />Bina Pooche</a>
        <nav aria-label="Sections">
          <a href="#how" onClick={(e) => (e.preventDefault(), document.getElementById("how")?.scrollIntoView({ behavior: "smooth" }))}>How it works</a>
          <a href="#/spy">Spy panel</a>
          {REPO && <a href={REPO} target="_blank" rel="noreferrer">Code</a>}
        </nav>
        <a className="btn primary small" href="#/portfolio">Open the app</a>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <h1 className="lp-title">Watch whales. Copy trades. Ask nobody.</h1>
          <p className="lp-lede">
            Every wallet you use tells its RPC provider what you hold, who you follow and what you're about to trade.
            Bina Pooche never asks about an address. It reads whole blocks through a mixnet, proves them, and finds
            what matters to you on your own phone.
          </p>
          <div className="actions">
            <a className="btn primary" href="#/portfolio">Open the app</a>
            <a className="btn" href="#/spy">See what leaks</a>
            {VIDEO && <a className="btn ghost" href={VIDEO} target="_blank" rel="noreferrer">Watch the demo</a>}
          </div>
          <p className="small faint lp-meaning">बिना पूछे (bina pooche): Hindi for “without asking”.</p>
        </div>
        <div className="lp-hero-side">
          <Redaction />
          <div className="lp-live">
            <div className="lp-live-head">
              <span className="status" data-phase={status.phase}><span className="dot" aria-hidden />
                {status.phase === "live" ? "Live on Sepolia, right now" : "Connecting through the mixnet"}</span>
            </div>
            <Tape limit={5} />
          </div>
        </div>
      </section>

      <section className="lp-section">
        <h2 className="lp-h2">What leaks today, and what we send instead</h2>
        <div className="lp-table" role="table" aria-label="Normal wallet compared with Bina Pooche">
          <div className="lp-row lp-row-head" role="row">
            <span role="columnheader">What's at stake</span>
            <span role="columnheader">A normal wallet sends</span>
            <span role="columnheader">Bina Pooche sends</span>
          </div>
          {LEAKS.map(([what, theirs, ours]) => (
            <div className="lp-row" role="row" key={what}>
              <span role="cell" className="lp-what">{what}</span>
              <span role="cell" className="mono lp-theirs">{theirs}</span>
              <span role="cell" className="mono lp-ours">{ours}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <h2 className="lp-h2">Everything a trader checks, without being watched</h2>
        <ul className="lp-features">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <span className="alert-icon"><Icon name={f.icon} /></span>
              <div>
                <h3>{f.title}</h3>
                <p className="muted">{f.body}</p>
                <p className="small lp-learns">{f.learns}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="lp-section" id="how">
        <h2 className="lp-h2">Why the relay can't lie to you</h2>
        <p className="muted lp-sub">Before your phone uses a block, it checks four things. Each one fails loudly if anything was changed.</p>
        <ol className="lp-proof">
          {PROOF.map(([t, d]) => (
            <li key={t}><h3>{t}</h3><p className="muted">{d}</p></li>
          ))}
        </ol>
      </section>

      <section className="lp-section lp-honest">
        <div>
          <h2 className="lp-h2">What it doesn't hide</h2>
          <p className="muted lp-sub">We'd rather you hear it from us.</p>
        </div>
        <ul>
          <li>Your trade is public once it lands on-chain. We hide your reading and your intent, not settled money.</li>
          <li>The mixnet adds a few seconds. Good for swing and copy trading, not for high-frequency trading.</li>
          <li>Your phone downloads whole blocks, a few hundred kilobytes every 12 seconds.</li>
          <li>Testnet for now: block access lists arrive on mainnet with the Glamsterdam upgrade.</li>
        </ul>
      </section>

      <section className="lp-cta">
        <h2 className="lp-title lp-title-sm">Your wallet list stays on your phone.</h2>
        <div className="actions">
          <a className="btn signal" href="#/portfolio">Open the app</a>
          <a className="btn" href="#/watch">Start watching a wallet</a>
        </div>
      </section>

      <footer className="lp-foot small muted">
        <span>Every request goes through Anon-RPC on the {network().label.replace(" (Sepolia)", "")}. Open source, MIT.</span>
        <span>Built at ETHGlobal Mumbai 2026{REPO ? <> · <a href={REPO} target="_blank" rel="noreferrer">Source</a></> : null}</span>
      </footer>
    </div>
  );
}
