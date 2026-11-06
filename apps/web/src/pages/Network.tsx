// Where every request goes, and how the privacy route is doing.
import { useEffect, useState, useSyncExternalStore } from "react";
import Tape from "../components/Tape";
import { bootState, getWorker, network } from "../lib/anon";
import { NETWORK_KEY, config, isLocal, type NetworkName } from "../lib/config";
import { fmtBytes } from "../lib/format";
import { reqlog, trafficShare } from "../lib/reqlog";
import { useStore } from "../lib/store";
import { friendly } from "../lib/errors";

const host = (u?: string) => (u ? new URL(u).host : "not set");

/** Measured on Nov 6 from this app, against the live relay. Tor's demo gateway refused connections at 19:15 IST. */
const CHOICES: { id: NetworkName; name: string; note: string; disabled?: string }[] = [
  { id: "sphinx", name: "Nox (default)", note: "First block in ~10 s, then ~2.6 s per block. Keeps up with the chain." },
  { id: "nym", name: "Nym", note: "First block in ~50 s (downloads a larger client), then ~16 s per block: slower than Sepolia's 12 s blocks, so alerts lag." },
  { id: "tor", name: "Tor", note: "Needs a gateway into Tor.", disabled: "Unavailable: the public demo gateway is offline." },
];

function NetworkPicker() {
  const boot = useSyncExternalStore(bootState.subscribe, bootState.get);
  const active = boot.network;
  const pick = (id: NetworkName) => {
    if (id === active) return;
    try { localStorage.setItem(NETWORK_KEY, id); sessionStorage.removeItem("bp.fallback"); } catch {}
    location.reload(); // one Anon-RPC worker per page: switching networks starts a fresh one
  };
  return (
    <fieldset className="routes net-pick">
      <legend className="small muted">Your choice is saved on this device. Switching reloads the app.</legend>
      {CHOICES.map((c) => (
        <label key={c.id} className="route" data-on={active === c.id} data-disabled={!!c.disabled}>
          <input type="radio" name="net" checked={active === c.id} disabled={!!c.disabled} onChange={() => pick(c.id)} />
          <span><strong>{c.name}</strong><span className="small muted">{c.disabled ?? c.note}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

export default function Network() {
  const status = useStore((s) => s.status);
  const tape = useStore((s) => s.tape);
  const [logs, setLogs] = useState<string[]>([]);
  useSyncExternalStore(reqlog.subscribe, reqlog.get); // re-render on every request
  const share = trafficShare();
  const n = tape.length || 1;
  const avgMs = tape.reduce((a, b) => a + b.ms, 0) / n;
  const avgBytes = tape.reduce((a, b) => a + b.bytes, 0) / n;

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        for (;;) {
          const { level, args } = await getWorker().acceptLog({ signal: ac.signal });
          setLogs((l) => [...l.slice(-150), `[${level}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`]);
        }
      } catch {}
    })();
    return () => ac.abort();
  }, []);

  const route = (u?: string) => (u && isLocal(u) ? "Direct (relay on this machine)" : `via ${network().short}`);

  return (
    <>
      <header className="head">
        <h1>Network</h1>
        <p>Every request this app makes, and the route it takes.</p>
      </header>

      <section className="panel">
        <header><h2>Status</h2><span className="chip" data-kind={status.phase === "live" ? "verified" : undefined}>{status.phase}</span></header>
        {status.message && <p className="small muted">{friendly(status.message)}</p>}
        {status.message && friendly(status.message) !== status.message && (
          <details className="small muted"><summary>Details</summary><code className="mono">{status.message}</code></details>
        )}
        <dl className="kv">
          <dt>Privacy network</dt><dd>{network().label}{!network().anonymous && <strong className="down"> · not anonymous</strong>}</dd>
          <dt>Traffic share</dt>
          <dd>
            {/* Startup is mostly Anon-RPC's own bootstrap; wait for a fair sample before showing a percentage. */}
            <span className="spy-score up">{share.total >= 20 ? `${share.pct.toFixed(1)}%` : <span className="muted" style={{ fontSize: 20 }}>Measuring…</span>}</span>
            <br />
            <span className="small muted">
              {share.mixnet} of {share.total} requests since this page loaded went through {network().short}. Not through it: {share.bootstrap} Anon-RPC bootstrap
              requests (the public network contract and code, no address){share.direct ? `, ${share.direct} to a relay on this machine` : ""}.
              {share.demo ? ` Not counted: ${share.demo} requests from the Spy panel's normal-wallet demo, sent directly on purpose.` : ""}
            </span>
          </dd>
          <dt>Per block</dt><dd>{tape.length ? `${fmtBytes(avgBytes)} in ${(avgMs / 1000).toFixed(1)} s on average` : "–"}</dd>
        </dl>
      </section>

      <section className="panel">
        <header><h2>Privacy network</h2></header>
        <NetworkPicker />
      </section>

      <section className="panel">
        <header><h2>Endpoints</h2></header>
        <dl className="kv">
          <dt>Blocks and events</dt><dd>{host(config.feedUrl)} · {route(config.feedUrl)}<br /><span className="small muted">Asked by block number only</span></dd>
          <dt>Second opinion</dt><dd>{host(config.anchorUrl)} · {route(config.anchorUrl)}<br /><span className="small muted">Confirms every block hash</span></dd>
          <dt>Private lookup</dt><dd>{config.relayUrl ? `${host(config.relayUrl)} · ${route(config.relayUrl)}` : "No relay set (VITE_RELAY_URL)"}</dd>
          <dt>One-off reads</dt><dd>{host(config.readUrl)} · {route(config.readUrl)}<br /><span className="small muted">Fresh route each time; used for sends and addresses outside the directory</span></dd>
          <dt>Sending</dt><dd>{config.privateSendUrl ? `${host(config.privateSendUrl)} · ${route(config.privateSendUrl)}` : `Public mempool via ${host(config.readUrl)} · via ${network().short} (no private builder on Sepolia)`}</dd>
        </dl>
      </section>

      <section className="panel"><Tape limit={30} /></section>

      <details className="panel">
        <summary>Anon-RPC worker log ({logs.length})</summary>
        <ul className="log">{logs.slice(-80).map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>
    </>
  );
}
