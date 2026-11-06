// Phone mock of the Watch screen. Illustrative trades; block numbers follow the real chain when connected.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { useStore } from "../lib/store";

const SAMPLES = [
  { who: "Whale 1", sold: "12.4 WETH", bought: "41,820 USDC" },
  { who: "Fund wallet", sold: "250,000 USDC", bought: "74.1 WETH" },
  { who: "Trader 0x389e…0787", sold: "3,100 USDC", bought: "0.92 WETH" },
  { who: "Whale 2", sold: "5.0 WETH", bought: "16,870 USDC" },
  { who: "Market maker", sold: "88,000 USDC", bought: "26.2 WETH" },
];

export default function Phone() {
  const reduce = useReducedMotion();
  const head = useStore((s) => s.status.head);
  const base = head ? Number(head) : 12074105;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setTick((n) => n + 1), 2800);
    return () => clearInterval(t);
  }, [reduce]);
  const items = Array.from({ length: 4 }, (_, i) => {
    const k = tick - i;
    return { key: k, ...SAMPLES[((k % SAMPLES.length) + SAMPLES.length) % SAMPLES.length], block: base - i, ago: i === 0 ? "now" : `${i * 12}s ago` };
  });

  return (
    <div className="L-phone-stage">
      <motion.div className="L-float one" initial={reduce ? false : { opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <span className="L-ok">✓</span> Block <span className="mono">#{base.toLocaleString("en-US")}</span> verified
      </motion.div>
      <motion.div className="L-float two" initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        Addresses sent: <strong className="L-ok">0</strong>
      </motion.div>
      <motion.div className="L-phone" aria-hidden initial={reduce ? false : { opacity: 0, y: 30, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <div className="L-screen">
          <span className="L-island" />
          <div className="L-sb"><span>9:41</span><span>●●●</span></div>
          <div className="L-app-head">
            <h4>Watch</h4>
            <span className="L-chip"><span className="L-live-dot" />Verified</span>
          </div>
          <ul className="L-feed">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((a, i) => (
                <motion.li key={a.key} className="L-alert" data-fresh={i === 0} layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: -14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
                  <span className="L-alert-ic"><Icon name="swap" /></span>
                  <div>
                    <b>{a.who} swapped</b>
                    <p>{a.sold} → {a.bought}</p>
                    <small><span>{a.ago}</span><em>block {a.block.toLocaleString("en-US")} ✓</em></small>
                    {i === 0 && <span className="L-copy">Copy trade</span>}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="L-tabs">
            {[["portfolio", "Portfolio"], ["watch", "Watch"], ["lookup", "Lookup"], ["send", "Send"], ["spy", "Spy"]].map(([ic, l]) => (
              <span key={l} data-on={l === "Watch"}><Icon name={ic} />{l}</span>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
