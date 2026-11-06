// Where every request goes, and how the privacy route is doing.
import { useEffect, useState, useSyncExternalStore } from "react";
import Tape from "../components/Tape";
import { getWorker, network } from "../lib/anon";
import { config, isLocal } from "../lib/config";
import { fmtBytes } from "../lib/format";
import { reqlog, trafficShare } from "../lib/reqlog";
import { useStore } from "../lib/store";

const host = (u?: string) => (u ? new URL(u).host : "not set");

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
        {status.message && <p className="small muted">{status.message}</p>}
        <dl className="kv">
          <dt>Privacy network</dt><dd>{network().label}{!network().anonymous && <strong className="down"> · not anonymous</strong>}</dd>
          <dt>Traffic share</dt>
          <dd>
            <span className="spy-score up">{share.total ? `${share.pct.toFixed(1)}%` : "–"}</span>
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
