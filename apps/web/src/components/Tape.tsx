// The live tape: every block this device verified, newest first.
import { friendly } from "../lib/errors";
import { fmtBytes } from "../lib/format";
import { useStore } from "../lib/store";

export default function Tape({ limit = 14 }: { limit?: number }) {
  const tape = useStore((s) => s.tape);
  const status = useStore((s) => s.status);
  const max = Math.max(1, ...tape.map((b) => b.txs));
  const avg = tape.length ? tape.reduce((a, b) => a + b.bytes, 0) / tape.length : 0;
  return (
    <section className="spy-col" aria-live="polite">
      <header>
        <h3>Verified blocks</h3>
        <p className="small muted">
          Each one checked against its header and confirmed by a second provider. Asked for by number only.
        </p>
      </header>
      {tape.length === 0 ? (
        <p className="small muted">{status.phase === "error" ? friendly(status.message) : "Waiting for the first block…"}</p>
      ) : (
        <ol className="tape">
          {tape.slice(0, limit).map((b, i) => (
            <li key={b.number} data-hit={b.hits > 0} className={i === 0 ? "tape-new" : undefined}
              title={`${b.accounts} accounts changed, ${b.txs} txs, ${b.swaps} swaps, ${fmtBytes(b.bytes)} in ${b.ms} ms`}>
              <span className="n">{b.number}</span>
              <span className="bar" aria-hidden><i style={{ width: `${(b.txs / max) * 100}%` }} /></span>
              <span className="small">
                {b.hits > 0 ? <strong>{b.hits} yours</strong> : <span className="faint">{b.swaps} swaps</span>}{" "}
                {b.anchored && <span className="tick" aria-label="verified">✓</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {tape.length > 0 && (
        <p className="small faint">About {fmtBytes(avg)} per block, the price of not asking.</p>
      )}
    </section>
  );
}
