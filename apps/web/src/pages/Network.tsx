// Where every request goes, and how the privacy route is doing.
import { useEffect, useState, useSyncExternalStore } from "react";
import Tape from "../components/Tape";
import { NETWORKS, bootState, getWorker, lanesState, network } from "../lib/anon";
import { NETWORK_KEY, config, isLocal, type NetworkName } from "../lib/config";
import { fmtBytes } from "../lib/format";
import { reqlog, trafficShare } from "../lib/reqlog";
import { useStore } from "../lib/store";
import { proofState } from "../lib/proof.light";
import { friendly } from "../lib/errors";

const host = (u?: string) => (u ? new URL(u).host : "not set");

/** Measured on Nov 6 from this app, against the live relay. Tor's demo gateway refused connections at 19:15 IST. */
const CHOICES: { id: NetworkName; name: string; note: string; disabled?: string }[] = [
  { id: "sphinx", name: "Nox (default)", note: "First block in ~10 s, then ~2.6 s per block. Keeps up with the chain." },
  { id: "nym", name: "Nym", note: "First block in ~50 s (downloads a larger client), then ~16 s per block: slower than Sepolia's 12 s blocks, so alerts lag." },
  { id: "tor", name: "Tor", note: "Needs a gateway into Tor.", disabled: "Unavailable: the public demo gateway is offline." },
];

/** Both anonymous networks side by side: the backup takes over instantly if the usual one stalls. */
function Lanes() {
  const lanes = useSyncExternalStore(lanesState.subscribe, lanesState.get);
  const word = { idle: "Standby, not started", booting: "Starting…", up: "Working", down: "Not responding, retrying" } as const;
  return (
    <ul className="lanes">
      {lanes.map((l) => (
        <li key={l.id} data-status={l.status}>
          <strong>{NETWORKS[l.id].short}</strong> <span>{word[l.status]}</span>
          <span className="small muted">
            {" "}· {l.ok} ok, {l.fail} failed{l.ewmaMs !== undefined ? ` · ~${(l.ewmaMs / 1000).toFixed(1)} s per request` : ""}
          </span>
          {l.status === "down" && l.error && <span className="small muted"> · {l.error.slice(0, 80)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** How blocks are proven: the light client (sync committee signatures) or, as a fallback, a second provider. */
function Proof() {
  const p = useSyncExternalStore(proofState.subscribe, proofState.get);
  if (p.mode === "light-client")
    return <>Light client{p.head ? ` · head signed by the sync committee at slot ${p.head.slot.toLocaleString("en-US")}` : ""} · {host(config.beaconUrls[0])} via the mixnet<br /><span className="small muted">Each block counts as proven once a header signed by 512 validators links back to it.</span></>;
  if (p.mode === "second-provider")
    return <>{host(config.anchorUrl)} confirms every block hash<br /><span className="small muted">The light client isn't available right now ({p.error?.slice(0, 80)}), so a second provider checks each block instead.</span></>;
  return <span className="muted">Starting the light client…</span>;
}

function NetworkPicker() {
  const boot = useSyncExternalStore(bootState.subscribe, bootState.get);
  const active = boot.network;
  const pick = (id: NetworkName) => {
    if (id === active) return;
    try { localStorage.setItem(NETWORK_KEY, id); } catch {}
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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const lastAt = tape[0]?.at;
  const since = lastAt ? Math.max(0, Math.round((now - lastAt) / 1000)) : undefined;
  // No extra requests: the relay is "answering" if it served a block that verified recently.
  const relay =
    status.phase === "paused" ? "Paused while in background"
    : since !== undefined && since < 60 ? "Answering: it served the last verified block"
    : status.phase === "live" || status.phase === "connecting" ? "Waiting for the next block"
    : status.phase === "error" ? "Not answering right now; retrying"
    : "Not contacted yet";

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
          <dt>Relay</dt><dd>{relay} <span className="small muted">({host(config.relayUrl)})</span></dd>
          <dt>Current block</dt><dd>{status.head ? Number(status.head).toLocaleString("en-US") : "–"}</dd>
          <dt>Since last block</dt><dd>{since !== undefined ? `${since} s` : "–"} <span className="small muted">(Sepolia makes one about every 12 s)</span></dd>
          <dt>Privacy network</dt><dd>{network().label}{!network().anonymous && <strong className="down"> · not anonymous</strong>}</dd>
          <dt>Networks</dt><dd><Lanes /></dd>
          <dt>Traffic share</dt>
          <dd>
            {/* Startup is mostly Anon-RPC's own bootstrap; wait for a fair sample before showing a percentage. */}
            <span className="spy-score up">{share.total >= 20 ? `${share.pct.toFixed(1)}%` : <span className="muted" style={{ fontSize: 20 }}>Measuring…</span>}</span>
            <br />
            <span className="small muted">
              {share.mixnet} of {share.total} requests since this page loaded went through {network().short}. Not through it: {share.bootstrap} Anon-RPC bootstrap
              requests (reads of the public network contract, no address){share.direct ? `, ${share.direct} to a relay on this machine` : ""}.
              {share.demo ? ` Not counted: ${share.demo} requests from the Spy panel's normal-wallet demo, sent directly on purpose.` : ""}
              {" "}The first requests are that bootstrap, which Anon-RPC needs before it can route anything, so the share starts
              around 91% and climbs to 96–99% as blocks arrive.
            </span>
          </dd>
          <dt>Per block</dt><dd>{tape.length ? `${fmtBytes(avgBytes)} in ${(avgMs / 1000).toFixed(1)} s on average` : "–"}</dd>
          <dt>Data use</dt>
          <dd className="small">About 250–330 KB per block while the app is open (roughly 75–100 MB an hour); nothing while it's hidden or closed, unless you turn on background watching (Watch page).</dd>
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
          <dt>Block proof</dt><dd><Proof /></dd>
          <dt>Private lookup</dt><dd>{config.relayUrl ? `${host(config.relayUrl)} · ${route(config.relayUrl)}` : "No relay set (VITE_RELAY_URL)"}</dd>
          <dt>One-off reads</dt><dd>{host(config.readUrl)} · {route(config.readUrl)}<br /><span className="small muted">Through the mixnet; used for sends and addresses outside the directory</span></dd>
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
