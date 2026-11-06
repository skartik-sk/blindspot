// Three providers, side by side, all real: a normal RPC (your IP + addresses), Anon-RPC used per address (addresses,
// not your IP), and ours (block numbers only). The first two send the same demo requests to our relay's normal-wallet
// lane, directly and through Anon-RPC; the relay answers with what it saw. The third is the relay's own log.
import { newIsolationKey, SEPOLIA_USDC } from "@blindspot/sdk";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { markGuide } from "../lib/actions";
import { anonFetch, getWorker } from "../lib/anon";
import { config } from "../lib/config";
import { encodeFunctionData, erc20Abi, type Address } from "viem";
import { short } from "../lib/format";
import { logRequest, reqlog } from "../lib/reqlog";
import { useStore, type Wallet } from "../lib/store";

const USDC = "0x1c7d…7238";
const WETH = "0xfff9…6b14";

/** The polling a typical wallet does for these exact screens, per new block (balances + watched activity). */
function typicalRequests(wallets: Wallet[], block: string) {
  const out: { method: string; params: string; leaks: Address }[] = [];
  for (const w of wallets) {
    if (w.kind !== "watch") {
      out.push({ method: "eth_getBalance", params: `["${w.address}", "latest"]`, leaks: w.address });
      out.push({ method: "eth_call", params: `balanceOf(${w.address}) on USDC ${USDC}`, leaks: w.address });
      out.push({ method: "eth_call", params: `balanceOf(${w.address}) on WETH ${WETH}`, leaks: w.address });
    } else {
      out.push({ method: "eth_getLogs", params: `{ block: ${block}, topics: [Transfer, ${w.address}] }`, leaks: w.address });
      out.push({ method: "eth_getTransactionCount", params: `["${w.address}", "latest"]`, leaks: w.address });
    }
  }
  return out;
}

/** Public contracts, never a user's address: the demo "normal wallet" polls these. */
const DEMO: { label: string; address: Address }[] = [
  { label: "Uniswap router", address: "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e" },
  { label: "Uniswap quoter", address: "0xed1f6473345f45b75f8179591dd5ba1888cf2fb3" },
];
interface Seen { id: number; ip: string; method: string; params: unknown[] }

/**
 * Opt-in: act like a normal wallet for the demo addresses, once per new block. Sent straight to our relay's /naive
 * lane (no mixnet, like MetaMask to Infura), which answers with what it just learned. Real server-side data.
 */
function useNaiveDemo(on: boolean, head: string, via: "direct" | "anon") {
  const [state, setState] = useState<{ seen: Seen[]; unavailable?: string }>({ seen: [] });
  useEffect(() => {
    if (!on || !config.relayUrl) return;
    let live = true;
    const url = `${config.relayUrl}/naive`;
    const calls = DEMO.flatMap(({ address }) => [
      { method: "eth_getBalance", params: [address, "latest"] },
      { method: "eth_call", params: [{ to: SEPOLIA_USDC.token, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [address] }) }, "latest"] },
      { method: "eth_getTransactionCount", params: [address, "latest"] },
    ]);
    (async () => {
      for (const c of calls) {
        const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...c }) };
        logRequest(url, init, "demo"); // demo traffic: shown here, kept out of the traffic share
        try {
          const r = via === "direct" ? await fetch(url, init) : await getWorker().fetch(url, { ...init, anonOptions: { isolationKey: newIsolationKey() } });
          if (r.status === 404) return live && setState((s) => ({ ...s, unavailable: "The relay's normal-wallet lane is off (ENABLE_NAIVE)." }));
          const j = await r.json();
          if (live && j.seen) setState((s) => ({ seen: [{ id: Math.random(), ...j.seen }, ...s.seen].slice(0, 30) }));
        } catch (e) {
          return live && setState((s) => ({ ...s, unavailable: `Couldn't reach the relay: ${(e as Error).message}` }));
        }
      }
    })();
    return () => { live = false; };
  }, [on, head, via]);
  return state;
}

interface RelayEntry { t: number; method: string; params: unknown[] }

/** Our relay's own record of what it received (public GET /log, block numbers only). Polled while this page is open. */
function useRelayLog() {
  const [log, setLog] = useState<{ entries: RelayEntry[]; error?: string }>({ entries: [] });
  useEffect(() => {
    if (!config.relayUrl) return;
    let live = true;
    const load = () =>
      anonFetch(`${config.relayUrl}/log`, { method: "GET", anonOptions: { isolationKey: newIsolationKey() } })
        .then((r) => r.json())
        .then((j) => live && setLog({ entries: (j.entries as RelayEntry[]).slice(-40).reverse() }))
        .catch((e) => live && setLog((l) => ({ ...l, error: (e as Error).message })));
    load();
    const id = setInterval(load, 15_000);
    return () => ((live = false), clearInterval(id));
  }, []);
  return log;
}

function Highlight({ text, addrs }: { text: string; addrs: string[] }) {
  const re = useMemo(() => (addrs.length ? new RegExp(`(${addrs.join("|")})`, "gi") : undefined), [addrs]);
  if (!re) return <>{text}</>;
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i} className="leak">{p}</mark> : p))}</>;
}

function Column({ tone, title, sub, score, scoreLabel, children, note }: {
  tone: "bad" | "mid" | "good"; title: string; sub: string; score: string; scoreLabel: string; children: React.ReactNode; note: string;
}) {
  return (
    <section className={`panel spy-col spy-${tone}`}>
      <header>
        <span className="spy-title">{title}</span>
        <span className="small muted">{sub}</span>
        <span className={`spy-score ${tone === "bad" ? "down" : tone === "good" ? "up" : "mid"}`}>{score}</span>
        <span className="small">{scoreLabel}</span>
      </header>
      {children}
      <p className="small faint">{note}</p>
    </section>
  );
}

function SeenList({ seen, label, waiting }: { seen: Seen[]; label: string; waiting: string }) {
  return (
    <ul className="log" aria-label={label}>
      {seen.map((r) => (
        <li key={r.id}>
          <span className="m">{r.method}</span>
          <span className="p"><Highlight text={JSON.stringify(r.params)} addrs={DEMO.map((d) => d.address.slice(2))} /></span>
          <span className="from">from {r.ip}</span>
        </li>
      ))}
      {seen.length === 0 && <li className="p">{waiting}</li>}
    </ul>
  );
}

export default function Spy() {
  useEffect(() => markGuide("spy"), []);
  const wallets = useStore((s) => s.wallets);
  const tape = useStore((s) => s.tape);
  const logged = useSyncExternalStore(reqlog.subscribe, reqlog.get);
  const entries = useMemo(() => logged.filter((e) => e.route !== "demo"), [logged]);
  const [on, setOn] = useState(false);
  const head = tape[0]?.number ?? "latest";
  const typical = useMemo(() => typicalRequests(wallets, head), [wallets, head]);
  const all = wallets.map((w) => w.address);
  const ours = [...entries].reverse().slice(0, 80);
  const oursLeaked = useMemo(() => new Set(entries.flatMap((e) => all.filter((a) => e.detail.toLowerCase().includes(a)))), [entries, all]);
  const relay = useRelayLog();
  const naive = useNaiveDemo(on, head, "direct");
  const anon = useNaiveDemo(on, head, "anon");
  const unavailable = naive.unavailable ?? anon.unavailable;
  const feedReqs = entries.filter((e) => !all.some((a) => e.detail.toLowerCase().includes(a))).length;

  return (
    <>
      <header className="head">
        <h1>Spy panel</h1>
        <p>Three providers, the same wallet activity. What each one learns, from real requests.</p>
      </header>

      {config.relayUrl && (
        <div className="spy-run">
          <button className="btn primary" onClick={() => setOn((v) => !v)} aria-pressed={on}>{on ? "Stop the comparison" : "Run the comparison"}</button>
          <span className="small muted">Sends the same requests for {DEMO.length} public demo addresses ({DEMO.map((d) => d.label).join(", ")}), once directly and once through Anon-RPC, to our relay's normal-wallet lane. Never your addresses.</span>
        </div>
      )}
      {on && unavailable && <p className="error-text">{unavailable}</p>}

      <div className="spy three">
        <Column tone="bad" title="Normal RPC" sub="Like MetaMask to Infura" score={on ? `${DEMO.length} + IP` : `${all.length} + IP`}
          scoreLabel="addresses it learns, plus your IP on every request"
          note={on ? "Real: sent straight to our relay; it saw your IP (masked on screen)." : "Simulated from your wallets until you run the comparison."}>
          {on ? <SeenList seen={naive.seen} label="Normal RPC saw" waiting="Sending…" /> : (
            <ul className="log" aria-label="Typical wallet requests">
              {typical.slice(0, 6).map((r, i) => (
                <li key={i}><span className="m">{r.method}</span><span className="p"><Highlight text={r.params} addrs={[r.leaks]} /></span><span className="from">from your IP</span></li>
              ))}
              {typical.length === 0 && <li className="p">Add or watch a wallet to see what would leak.</li>}
            </ul>
          )}
        </Column>

        <Column tone="mid" title="Anon-RPC alone" sub="Same queries, through the mixnet" score={on ? `${DEMO.length}` : `${all.length}`}
          scoreLabel="addresses it still learns. Your IP is hidden."
          note="Anon-RPC hides who is asking. A wallet that queries per address still tells the node which addresses matter.">
          {on ? <SeenList seen={anon.seen} label="Anon-RPC alone saw" waiting="Sending through the mixnet…" /> : <ul className="log"><li className="p">Run the comparison to send these through Anon-RPC.</li></ul>}
        </Column>

        <Column tone="good" title="Blindspot" sub="Our relay's real log, every client" score="0" scoreLabel="addresses. Block numbers only, from mixnet exits."
          note="Everyone downloads the same verified blocks; filtering happens on the phone.">
          <ul className="log" aria-label="Relay log">
            {relay.entries.slice(0, 12).map((e, i) => (
              <li key={`${e.t}-${i}`}><span className="m">{e.method}</span><span className="p">{JSON.stringify(e.params)}</span><span className="from">{new Date(e.t).toLocaleTimeString()}</span></li>
            ))}
            {relay.entries.length === 0 && <li className="p">{relay.error ? `Couldn't load the relay log: ${relay.error}` : "Loading the relay's log…"}</li>}
          </ul>
        </Column>
      </div>

      <details className="panel">
        <summary>Every request this app sent ({entries.length}): {oursLeaked.size} named an address, {feedReqs} named only a block</summary>
        <ul className="log" aria-label="This app's requests">
          {ours.map((e) => (
            <li key={e.id}>
              <span className="m">{e.method} <span className="faint">→ {e.host}</span></span>
              {e.detail && <span className="p"><Highlight text={e.detail} addrs={all} /></span>}
              <span className="from">
                {e.route === "mixnet" ? `from a mixnet exit · route ${e.key}`
                  : e.route === "bootstrap" ? "direct: Anon-RPC bootstrap (public network contract or code, no address)"
                  : "direct to a relay on this machine"}
              </span>
            </li>
          ))}
        </ul>
        {oursLeaked.size > 0 && (
          <p className="small muted">
            Highlighted: one-off lookups and sends that must name an address ({[...oursLeaked].map(short).join(", ")}), each on its own mixnet route.
          </p>
        )}
      </details>
    </>
  );
}
