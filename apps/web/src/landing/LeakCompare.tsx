// Left: what a normal wallet would send its provider for the wallets on screen right now (real addresses: your
// wallets plus the traders the live feed found; built locally, never sent). Right: the real requests this page sent.
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useSyncExternalStore } from "react";
import { short } from "../lib/format";
import { reqlog } from "../lib/reqlog";
import { useStore } from "../lib/store";

export default function LeakCompare() {
  const reduce = useReducedMotion();
  const wallets = useStore((s) => s.wallets);
  const traders = useStore((s) => s.traders);
  const head = useStore((s) => s.status.head);
  const entries = useSyncExternalStore(reqlog.subscribe, reqlog.get);

  const addrs = useMemo(() => [...new Set([...wallets.map((w) => w.address), ...traders.slice(0, 3).map((t) => t.address)].map((a) => a.toLowerCase()))], [wallets, traders]);
  const block = head ? Number(head).toString() : "latest";
  const naive = addrs.flatMap((a) => [
    { m: "eth_getBalance", a, rest: ', "latest"' },
    { m: "eth_getLogs", a, rest: ` · Transfer · ${block}` },
  ]).slice(0, 5);
  const ours = entries.filter((e) => e.route === "mixnet").slice(-5).reverse();
  const named = ours.filter((e) => addrs.some((a) => e.detail.toLowerCase().includes(a))).length;
  const item = reduce ? {} : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25 } };

  return (
    <div className="S-leak">
      <section className="S-leak-col" aria-label="A normal wallet">
        <header>
          <div><h3>A normal wallet</h3><p>Every block, to its provider, from your IP</p></div>
          <div className="S-score bad"><strong>{addrs.length}</strong><span>addresses exposed</span></div>
        </header>
        <ul className="S-log">
          {naive.map((r) => (
            <motion.li key={r.m + r.a + block} {...item}>
              <code><b>{r.m}</b>(<mark>{short(r.a)}</mark>{r.rest})</code>
              <span>sent from your IP</span>
            </motion.li>
          ))}
          {naive.length === 0 && <li><code>Waiting for the first verified block…</code></li>}
        </ul>
        <p className="S-leak-note">Built from the wallets on this page. Shown, never sent.</p>
      </section>
      <section className="S-leak-col ours" aria-label="Bina Pooche">
        <header>
          <div><h3>Bina Pooche, live</h3><p>The requests this page actually sent</p></div>
          <div className="S-score good"><strong>{named}</strong><span>addresses exposed</span></div>
        </header>
        <ul className="S-log">
          {ours.map((e) => (
            <motion.li key={e.id} {...item}>
              <code><b>{e.method}</b>{e.detail && <em>{e.detail.slice(0, 48)}</em>}</code>
              <span>{e.host} · from a mixnet exit · route {e.key}</span>
            </motion.li>
          ))}
          {ours.length === 0 && <li><code>Opening a route through the mixnet…</code></li>}
        </ul>
        <p className="S-leak-note">Real log from your browser. The full list is in the app's Spy panel.</p>
      </section>
    </div>
  );
}
