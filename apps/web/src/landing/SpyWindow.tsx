// The money shot: the same screen, two request logs. Left is what a typical wallet sends; right is what we send.
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";

const ME = ["0x8d48be79d5be14bfec88dfd1276601e9b5ac25dc", "0x3f9a0c51e2b7d84a6c19f0e7b2d5a8c4e1f6b91c"];
const WHALES = ["0x75c3cf2cf0ea8fbf19f3775dfca513885f273624", "0x59fc6e1d0b7a9e3c2f84a5d6e7b8c9d0a1b28952"];

function naive(i: number, block: number) {
  const me = ME[i % 2];
  const whale = WHALES[i % 2];
  const kinds = [
    { m: "eth_getBalance", a: me, rest: `, "latest"` },
    { m: "eth_call balanceOf", a: me, rest: ` on USDC` },
    { m: "eth_getLogs", a: whale, rest: ` · Transfer · block ${block}` },
    { m: "eth_getTransactionCount", a: whale, rest: `, "latest"` },
  ];
  return kinds[i % kinds.length];
}
function ours(i: number, block: number) {
  const kinds = ["eth_getBlockByNumber", "eth_getBlockAccessList", "eth_getBlockReceipts", "eth_getBlockByNumber · anchor"];
  return { m: kinds[i % 4], b: block - Math.floor(i / 4) % 2 };
}

export default function SpyWindow() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-120px" });
  const reduce = useReducedMotion();
  const head = useStore((s) => s.status.head);
  const block = head ? Number(head) : 12074105;
  const [n, setN] = useState(8);
  useEffect(() => {
    if (!inView || reduce) return;
    const t = setInterval(() => setN((x) => x + 1), 900);
    return () => clearInterval(t);
  }, [inView, reduce]);
  const left = Array.from({ length: 7 }, (_, k) => n - k).filter((i) => i >= 0);
  const named = n + 1; // every typical request names an address

  return (
    <div className="L-window" ref={ref}>
      <div className="L-window-bar" aria-hidden><i /><i /><i /><span>spy panel · same screens, two wallets</span></div>
      <div className="L-spy">
        <section className="L-spy-col" aria-label="A typical wallet">
          <div className="L-spy-head">
            <div><h3>A typical wallet</h3><p>To its RPC provider, from your IP</p></div>
            <div style={{ textAlign: "right" }}><div className="L-score bad">{named}</div><p style={{ margin: 0, fontSize: 12, color: "var(--l-ink-3)" }}>requests naming you</p></div>
          </div>
          <ul className="L-log">
            
              {left.map((i) => {
                const r = naive(i, block);
                return (
                  <motion.li key={i} initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
                    <span className="m">{r.m}</span>(<mark>{r.a}</mark>{r.rest})
                    <span className="f">from 49.36.xxx.xxx (your home IP)</span>
                  </motion.li>
                );
              })}
            
          </ul>
        </section>
        <section className="L-spy-col" aria-label="Bina Pooche">
          <div className="L-spy-head">
            <div><h3>Bina Pooche</h3><p>Through the Anon-RPC mixnet</p></div>
            <div style={{ textAlign: "right" }}><div className="L-score good">0</div><p style={{ margin: 0, fontSize: 12, color: "var(--l-ink-3)" }}>requests naming you</p></div>
          </div>
          <ul className="L-log">
            
              {left.map((i) => {
                const r = ours(i, block);
                return (
                  <motion.li key={i} initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
                    <span className="m">{r.m}</span>(<span className="n">{r.b.toLocaleString("en-US")}</span>)
                    <span className="f">from a mixnet exit · route {((i * 2654435761) >>> 0).toString(16).slice(0, 6)}</span>
                  </motion.li>
                );
              })}
            
          </ul>
        </section>
      </div>
    </div>
  );
}
