// The same screens, two request logs: what a typical wallet sends its provider, and what Bina Pooche sends.
// Illustrative addresses; block numbers follow the live chain. The app's Spy panel shows the real logs.
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";

const ME = ["0x8d48be79d5be14bfec88dfd1276601e9b5ac25dc", "0x3f9a0c51e2b7d84a6c19f0e7b2d5a8c4e1f6b91c"];
const WHALES = ["0x75c3cf2cf0ea8fbf19f3775dfca513885f273624", "0x59fc6e1d0b7a9e3c2f84a5d6e7b8c9d0a1b28952"];

function naive(i: number, block: number) {
  const kinds = [
    { m: "eth_getBalance", a: ME[i % 2], rest: ', "latest"' },
    { m: "eth_call balanceOf", a: ME[(i + 1) % 2], rest: " on USDC" },
    { m: "eth_getLogs", a: WHALES[i % 2], rest: ` · Transfer · ${block}` },
    { m: "eth_getTransactionCount", a: WHALES[(i + 1) % 2], rest: ', "latest"' },
  ];
  return kinds[i % kinds.length];
}
const OURS = ["eth_getBlockByNumber", "eth_getBlockAccessList", "bina_getReceipts", "eth_getBlockByNumber · 2nd provider"];

export default function LeakCompare() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-120px" });
  const reduce = useReducedMotion();
  const head = useStore((s) => s.status.head);
  const block = head ? Number(head) : 12075800;
  const [n, setN] = useState(6);
  useEffect(() => {
    if (!inView || reduce) return;
    const t = setInterval(() => setN((x) => x + 1), 1100);
    return () => clearInterval(t);
  }, [inView, reduce]);
  const idx = Array.from({ length: 5 }, (_, k) => n - k).filter((i) => i >= 0);
  const item = reduce ? {} : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25 } };

  return (
    <div className="S-leak" ref={ref}>
      <section className="S-leak-col" aria-label="A typical wallet">
        <header>
          <div><h3>A typical wallet</h3><p>To its RPC provider, from your IP</p></div>
          <div className="S-score bad"><strong>{n + 1}</strong><span>requests naming you</span></div>
        </header>
        <ul className="S-log">
          {idx.map((i) => {
            const r = naive(i, block);
            return (
              <motion.li key={i} {...item}>
                <code><b>{r.m}</b>(<mark>{r.a}</mark>{r.rest})</code>
                <span>from 49.36.x.x · your home IP</span>
              </motion.li>
            );
          })}
        </ul>
      </section>
      <section className="S-leak-col ours" aria-label="Bina Pooche">
        <header>
          <div><h3>Bina Pooche</h3><p>Through the Anon-RPC mixnet</p></div>
          <div className="S-score good"><strong>0</strong><span>requests naming you</span></div>
        </header>
        <ul className="S-log">
          {idx.map((i) => (
            <motion.li key={i} {...item}>
              <code><b>{OURS[i % 4]}</b>(<em>{(block - (Math.floor(i / 4) % 2)).toLocaleString("en-US")}</em>)</code>
              <span>from a mixnet exit · route {((i * 2654435761) >>> 0).toString(16).slice(0, 6)}</span>
            </motion.li>
          ))}
        </ul>
      </section>
    </div>
  );
}
