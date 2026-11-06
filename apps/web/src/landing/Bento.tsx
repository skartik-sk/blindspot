// Feature tiles, each with a small working visual of the idea.
import { useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { useStore } from "../lib/store";
import Reveal from "./Reveal";

function PirGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduce = useReducedMotion();
  return (
    <div className="L-pir" ref={ref} data-run={inView && !reduce} aria-hidden>
      {Array.from({ length: 128 }, (_, i) => <i key={i} style={{ ["--d" as string]: (i % 16) * 40 + Math.floor(i / 16) * 25 }} />)}
    </div>
  );
}

function Chain() {
  const tape = useStore((s) => s.tape);
  const head = useStore((s) => s.status.head);
  const base = head ? Number(head) : 12074105;
  const top = tape.length ? Number(tape[0].number) : base;
  const blocks = Array.from({ length: 6 }, (_, i) => ({ n: top - i }));
  return (
    <div className="L-chain" aria-hidden>
      {[...blocks].reverse().map((b) => (
        <div className="L-block" key={b.n}>
          <b>#{b.n.toLocaleString("en-US")}</b>
          <span>header ✓</span><span>list ✓</span><span>receipts ✓</span>
        </div>
      ))}
    </div>
  );
}

export default function Bento() {
  return (
    <div className="L-bento">
      <Reveal className="L-tile w4">
        <span className="L-fig">FIG 1 · Watch</span>
        <h3>Whale alerts within a block</h3>
        <p>Follow any wallet. Your phone spots its swaps in each verified block and tells you what it sold and bought.</p>
        <span className="L-learns">Nobody learns who you follow.</span>
        <div className="L-vis"><Chain /></div>
      </Reveal>
      <Reveal className="L-tile w2" delay={0.05}>
        <span className="L-fig">FIG 2 · Copy</span>
        <h3>Copy in one tap</h3>
        <div className="L-swap L-vis" aria-hidden>
          <div className="L-swap-row"><strong>0.5</strong><span className="L-tok">ETH</span></div>
          <div className="L-swap-row"><strong>≈ 1,690</strong><span className="L-tok">USDC</span></div>
          <div className="L-route"><span className="L-ok">●</span> Signed on device · private route</div>
        </div>
      </Reveal>
      <Reveal className="L-tile w2">
        <span className="L-fig">FIG 3 · Lookup</span>
        <h3>Ask about any address</h3>
        <p>The server computes over every row, so it can't tell which one you read.</p>
        <div className="L-vis"><PirGrid /></div>
      </Reveal>
      <Reveal className="L-tile w2" delay={0.05}>
        <span className="L-fig">FIG 4 · Portfolio</span>
        <h3>Wallets nobody can link</h3>
        <div className="L-wallets L-vis" aria-hidden>
          <div className="L-wallet"><span>Trading</span><span className="mono">0x8d48…25dc</span></div>
          <div className="L-wallet"><span>Savings</span><span className="mono">0x3f9a…b91c</span></div>
          <div className="L-wallet"><span>Hardware</span><span className="mono">0xa1e0…77f2</span></div>
        </div>
      </Reveal>
      <Reveal className="L-tile w2" delay={0.1}>
        <span className="L-fig">FIG 5 · Send</span>
        <h3>Trades skip the public mempool</h3>
        <p>Signed on your phone and sent through the mixnet to a private builder. Bots can't front-run what they never see.</p>
        <span className="L-learns">Your IP never touches the tx.</span>
      </Reveal>
    </div>
  );
}
