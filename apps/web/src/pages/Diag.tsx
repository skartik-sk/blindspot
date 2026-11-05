// Browser gate: can we reach the anchor and relay through Anon-RPC, and do the lists verify?
import { useEffect, useRef, useState } from "react";
import { RpcClient, verifyBal, verifyHeader } from "@bina/sdk";
import { anonFetch, getWorker, network } from "../lib/anon";
import { config } from "../lib/config";

type Step = { name: string; status: "run" | "ok" | "fail"; detail?: string; ms?: number };

export default function Diag() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const ac = new AbortController();
    const w = getWorker();
    (async () => {
      try {
        for (;;) {
          const { level, args } = await w.acceptLog({ signal: ac.signal });
          setLogs((l) => [...l.slice(-200), `[${level}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`]);
        }
      } catch {}
    })();

    const run = async (name: string, fn: () => Promise<string>) => {
      setSteps((s) => [...s, { name, status: "run" }]);
      const t = performance.now();
      try {
        const detail = await fn();
        setSteps((s) => s.map((x) => (x.name === name ? { ...x, status: "ok", detail, ms: performance.now() - t } : x)));
        return true;
      } catch (e) {
        setSteps((s) => s.map((x) => (x.name === name ? { ...x, status: "fail", detail: String((e as Error).message ?? e), ms: performance.now() - t } : x)));
        return false;
      }
    };

    const verifyVia = (label: string, url: string) =>
      run(`verify latest block via ${label}`, async () => {
        const rpc = new RpcClient(url, anonFetch, crypto.randomUUID());
        const n = (await rpc.blockNumber()) - 1n;
        const [h, bal] = await Promise.all([rpc.header(n), rpc.bal(n)]);
        if (!h || !bal) throw new Error(`block ${n} missing`);
        verifyHeader(h, n);
        verifyBal(bal, h);
        return `block ${n}: ${bal.length} accounts, header + list hashes OK`;
      });

    (async () => {
      if (!(await run(`start ${network().label} worker`, async () => (await w.ready, "ready")))) return;
      await verifyVia("anchor (publicnode)", config.anchorUrl);
      await verifyVia("relay", config.relayUrl);
    })();
    return () => ac.abort();
  }, []);

  return (
    <main className="page">
      <h1>Diagnostics</h1>
      <p className="muted">
        Network: <b>{network().label}</b>
        {!network().anonymous && <span className="warn"> · not anonymous</span>}
        <br />Relay: {config.relayUrl} · Anchor: {config.anchorUrl}
      </p>
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.name} data-status={s.status}>
            <span>{s.status === "run" ? "…" : s.status === "ok" ? "✓" : "✗"}</span> {s.name}
            {s.ms !== undefined && <small> {(s.ms / 1000).toFixed(1)}s</small>}
            {s.detail && <div className="detail">{s.detail}</div>}
          </li>
        ))}
      </ol>
      <details open>
        <summary>Worker log ({logs.length})</summary>
        <pre className="log">{logs.join("\n")}</pre>
      </details>
    </main>
  );
}
