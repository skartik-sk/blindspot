// Phone mock of the app's Watch screen. Illustrative trades; block numbers follow the real chain when connected.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { useStore } from "../lib/store";

const SAMPLES = [
  { who: "Whale 1", d: "12.4 WETH → 41,820 USDC" },
  { who: "Fund wallet", d: "250,000 USDC → 74.1 WETH" },
  { who: "0x389e…0787", d: "3,100 USDC → 0.92 WETH" },
  { who: "Whale 2", d: "5.0 WETH → 16,870 USDC" },
  { who: "Market maker", d: "88,000 USDC → 26.2 WETH" },
];

export default function Phone() {
  const reduce = useReducedMotion();
  const head = useStore((s) => s.status.head);
  const base = head ? Number(head) : 12074105;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setTick((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, [reduce]);
  const items = Array.from({ length: 4 }, (_, i) => {
    const k = tick - i;
    return { key: k, ...SAMPLES[((k % SAMPLES.length) + SAMPLES.length) % SAMPLES.length], ago: i === 0 ? "now" : `${i * 12}s` };
  });

  return (
    <div className="L-phone" aria-hidden>
      <div className="L-screen">
        <span className="L-island" />
        <div className="L-sb"><span>9:41</span><span>5G</span></div>
        <div className="L-app-head">
          <small>Block #{base.toLocaleString("en-US")} · verified</small>
          <h4>Who's trading right now?</h4>
        </div>
        <div className="L-app-cards">
          <div className="L-app-card g"><span>Watching</span><b>3 whales</b></div>
          <div className="L-app-card d"><span>Addresses sent</span><b className="L-ok">0</b></div>
        </div>
        <div className="L-app-sec">Live alerts</div>
        <ul className="L-feed">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((a, i) => (
              <motion.li key={a.key} className="L-alert" data-fresh={i === 0} layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                <span className="L-alert-ic"><Icon name="swap" /></span>
                <div style={{ minWidth: 0 }}>
                  <b>{a.who} swapped<em>{a.ago}</em></b>
                  <p>{a.d}</p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <div className="L-tabs">
          {[["portfolio", "Home"], ["watch", "Watch"], ["lookup", "Lookup"], ["send", "Trade"], ["spy", "Spy"]].map(([ic, l]) => (
            <span key={l} data-on={l === "Watch"}><Icon name={ic} />{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
