// Side by side: what a typical wallet's provider learns from the same screens, and what ours actually received.
import { newIsolationKey, SEPOLIA_USDC } from "@bina/sdk";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { anonFetch } from "../lib/anon";
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
function useNaiveDemo(on: boolean, head: string) {
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
        logRequest(url, init, "demo");
        try {
          const r = await fetch(url, init);
          if (r.status === 404) return live && setState((s) => ({ ...s, unavailable: "The relay's normal-wallet lane is off (ENABLE_NAIVE)." }));
          const j = await r.json();
          if (live && j.seen) setState((s) => ({ seen: [{ id: Math.random(), ...j.seen }, ...s.seen].slice(0, 30) }));
        } catch (e) {
          return live && setState((s) => ({ ...s, unavailable: `Couldn't reach the relay: ${(e as Error).message}` }));
        }
      }
    })();
    return () => { live = false; };
  }, [on, head]);
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

export default function Spy() {
  const wallets = useStore((s) => s.wallets);
  const tape = useStore((s) => s.tape);
  const logged = useSyncExternalStore(reqlog.subscribe, reqlog.get);
  const entries = useMemo(() => logged.filter((e) => e.route !== "demo"), [logged]); // the demo lane is shown on the left
  const [demoOn, setDemoOn] = useState(false);
  const head = tape[0]?.number ?? "latest";
  const typical = useMemo(() => typicalRequests(wallets, head), [wallets, head]);
  const all = wallets.map((w) => w.address);
  const ours = [...entries].reverse().slice(0, 80);
  // Addresses that actually appeared in our requests (one-off mixnet lookups, sends): shown, not hidden.
  const oursLeaked = useMemo(() => new Set(entries.flatMap((e) => all.filter((a) => e.detail.toLowerCase().includes(a)))), [entries, all]);
  const relay = useRelayLog();
  const demo = useNaiveDemo(demoOn, head);
  const real = demoOn && !demo.unavailable;
  const feedReqs = entries.filter((e) => !all.some((a) => e.detail.toLowerCase().includes(a))).length;

  return (
    <>
      <header className="head">
        <h1>Spy panel</h1>
        <p>The same screens, two ways. On the left, what a normal wallet sends its provider. On the right, every request this app actually sent.</p>
      </header>

      <div className="spy">
        <section className="panel spy-col">
          <header>
            <span className="small muted">What a normal provider sees{real ? ": live, from our relay's normal-wallet lane" : ""}</span>
            <span className="spy-score down">{real ? DEMO.length : all.length}</span>
            <span className="small">
              {real
                ? "demo addresses handed over, plus your IP on every request. These are real requests and the relay's real record of them."
                : "addresses handed over, plus your IP on every request. Your provider now knows your portfolio and who you copy."}
            </span>
          </header>
          {config.relayUrl && (
            <button className="btn small" onClick={() => setDemoOn((v) => !v)} aria-pressed={demoOn}>
              {demoOn ? "Stop the normal wallet" : "Run a normal wallet against our relay"}
            </button>
          )}
          {demoOn && demo.unavailable && <p className="small muted">{demo.unavailable} Showing the simulated version.</p>}
          {real ? (
            <ul className="log" aria-label="What a normal provider saw">
              {demo.seen.map((r) => (
                <li key={r.id}>
                  <span className="m">{r.method}</span>
                  <span className="p"><Highlight text={JSON.stringify(r.params)} addrs={DEMO.map((d) => d.address.slice(2))} /></span>
                  <span className="from">from {r.ip} (your IP, masked here) · block {head}</span>
                </li>
              ))}
              {demo.seen.length === 0 && <li className="p">Sending the first block's requests…</li>}
            </ul>
          ) : typical.length === 0 ? (
            <p className="small muted">Add a wallet or watch one to see what would leak.</p>
          ) : (
            <ul className="log" aria-label="Typical wallet requests">
              {typical.map((r, i) => (
                <li key={i}>
                  <span className="m">{r.method}</span>
                  <span className="p"><Highlight text={r.params} addrs={[r.leaks]} /></span>
                  <span className="from">from your IP · block {head}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="small faint">
            {real
              ? `Demo addresses only (${DEMO.map((d) => d.label).join(", ")}), never yours. Sent directly, without the mixnet, the way a normal wallet does.`
              : "Simulated from your wallet list, the way MetaMask-style wallets poll. Nothing on this side is sent anywhere."}
          </p>
        </section>

        <section className="panel spy-col">
          <header>
            <span className="small muted">This app, live</span>
            <span className={`spy-score ${oursLeaked.size ? "" : "up"}`}>{oursLeaked.size}</span>
            <span className="small">
              addresses in {entries.length} requests. {feedReqs} of them name only a block number, and none carry your IP.
            </span>
          </header>
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
            {ours.length === 0 && <li className="p">Requests appear here as they're sent.</li>}
          </ul>
          {oursLeaked.size > 0 && (
            <p className="small muted">
              Highlighted: one-off lookups and sends that must name an address ({[...oursLeaked].map(short).join(", ")}). Each went
              out on its own mixnet route, so the node can't tell they're the same person.
            </p>
          )}
        </section>
      </div>

      {config.relayUrl && (
        <section className="panel spy-col">
          <header>
            <span className="small muted">Our relay's own log, server side</span>
            <span className="small">
              What {new URL(config.relayUrl).host} recorded from every client: block numbers and nothing else. It saw mixnet exits, never your IP.
            </span>
          </header>
          <ul className="log" aria-label="Relay log">
            {relay.entries.map((e, i) => (
              <li key={`${e.t}-${i}`}>
                <span className="m">{e.method}</span>
                <span className="p">{JSON.stringify(e.params)}</span>
                <span className="from">{new Date(e.t).toLocaleTimeString()}</span>
              </li>
            ))}
            {relay.entries.length === 0 && <li className="p">{relay.error ? `Couldn't load the relay log: ${relay.error}` : "Loading the relay's log…"}</li>}
          </ul>
        </section>
      )}
    </>
  );
}
