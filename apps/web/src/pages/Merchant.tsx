// Merchant: tap to charge. Fresh address per sale, watch the next blocks' verified lists, never ask about it.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { RpcClient, SEPOLIA_USDC, newIsolationKey, saleAccount, watchWindow, type Hit } from "@bina/sdk";
import { anonFetch, network } from "../lib/anon";
import { config } from "../lib/config";
import { fmtInr, fmtUsdc, inrToUsdcUnits } from "../lib/money";
import { encodePayReq } from "../lib/payreq";
import { claimIndex, sales as loadSales, seed, upsertSale, type Sale } from "../lib/vault";

const WINDOW = 15; // blocks (~3 min)
const PRESETS = [20, 50, 100, 250];

type Tick = { n: string; accounts: number; ok: boolean; hit: boolean };

export default function Merchant() {
  const [inr, setInr] = useState(20);
  const [sale, setSale] = useState<Sale>();
  const [qr, setQr] = useState<string>();
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [history, setHistory] = useState(loadSales);
  const [nfc, setNfc] = useState<string>();
  const abort = useRef<AbortController>(undefined);

  useEffect(() => () => abort.current?.abort(), []);

  const save = (s: Sale) => {
    upsertSale(s);
    setSale(s);
    setHistory(loadSales());
  };

  async function charge() {
    abort.current?.abort();
    const ac = (abort.current = new AbortController());
    const index = claimIndex(); // synchronous: a double tap can't get the same address
    const account = saleAccount(seed(), index);
    const amount = inrToUsdcUnits(inr);
    const isolationKey = newIsolationKey();
    let s: Sale = {
      index, address: account.address, amount: amount.toString(), inr, isolationKey,
      fromBlock: "0", createdAt: Date.now(), status: "watching",
    };
    save(s);
    // One isolation key per sale: two sales' traffic can't be linked. The anchor gets its own key too.
    const rpc = new RpcClient(config.relayUrl, anonFetch, isolationKey);
    const anchor = new RpcClient(config.anchorUrl, anonFetch, newIsolationKey());

    const req = encodePayReq({ token: SEPOLIA_USDC.token, chainId: 11155111, to: account.address, amount });
    setQr(await QRCode.toDataURL(req, { margin: 1, width: 280 }));
    setTicks([]);
    setNfc(undefined);
    try {
      const from = await rpc.blockNumber();
      save((s = { ...s, fromBlock: from.toString() }));
      let found: Hit | undefined;
      // Count only what arrives inside the window. The address is fresh (claimIndex), so it starts at 0.
      let seen = 0n;
      await watchWindow({
        rpc, anchor, addresses: [account.address], from, blocks: WINDOW, signal: ac.signal, pollMs: 3000,
        onBlock: (b) => {
          setTicks((t) => [...t, { n: b.number.toString(), accounts: b.accounts, ok: true, hit: b.hits.length > 0 }]);
          const h = b.hits[0];
          const post = h?.tokens[SEPOLIA_USDC.token];
          const got = post !== undefined && post > seen ? post - seen : 0n;
          if (post !== undefined) seen = post;
          if (h && got > 0n) {
            found = h;
            save((s = {
              ...s, status: got >= amount ? "received" : "error",
              error: got >= amount ? undefined : `partial: ${fmtUsdc(got)} USDC`,
              receivedBlock: b.number.toString(), blockHash: b.hash, balHash: b.balHash, anchored: b.anchored,
            }));
          }
        },
      });
      if (!found && !ac.signal.aborted) save({ ...s, status: "expired" });
    } catch (e) {
      if (!ac.signal.aborted) save({ ...s, status: "error", error: (e as Error).message });
    }
  }

  async function tapNfc() {
    if (!sale) return;
    try {
      // Web NFC (Chrome on Android). The customer phone reads the same EIP-681 request as the QR.
      const ndef = new (window as any).NDEFReader();
      await ndef.write({ records: [{ recordType: "url", data: encodePayReq({
        token: SEPOLIA_USDC.token, chainId: 11155111, to: sale.address, amount: BigInt(sale.amount) }) }] });
      setNfc("Tag ready: hold the customer's phone to this one");
    } catch (e) {
      setNfc(`NFC unavailable: ${(e as Error).message}. Use the QR code.`);
    }
  }

  return (
    <main className="page">
      <header className="bar">
        <a href="#/">←</a>
        <h1>Charge</h1>
        <span className="pill" title="All reads go through this network">{network().label}</span>
      </header>

      {!sale || sale.status !== "watching" ? (
        <section className="card">
          <div className="amount">{fmtInr(inr)}</div>
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p} className={p === inr ? "on" : ""} onClick={() => setInr(p)}>{fmtInr(p)}</button>
            ))}
          </div>
          <input type="number" min={1} max={100000} value={inr} inputMode="decimal"
            onChange={(e) => setInr(Math.max(1, Math.min(100000, Number(e.target.value) || 1)))} aria-label="Amount in rupees" />
          <button className="primary" onClick={charge}>Charge {fmtInr(inr)}</button>
        </section>
      ) : null}

      {sale && (
        <section className="card sale" data-status={sale.status}>
          {sale.status === "received" ? (
            <div className="done">
              <div className="big">{fmtInr(sale.inr)} received ✅</div>
              <div className="muted">
                Proven, not trusted: block {sale.receivedBlock}'s access list matches its header
                {sale.anchored ? ", and an independent provider confirmed the block" : ""}.
              </div>
              <code className="hash">list {sale.balHash?.slice(0, 18)}… · block {sale.blockHash?.slice(0, 18)}…</code>
            </div>
          ) : sale.status === "watching" ? (
            <>
              <div className="big">{fmtInr(sale.inr)}</div>
              <div className="muted">{fmtUsdc(BigInt(sale.amount))} USDC · Sepolia</div>
              {qr && <img className="qr" src={qr} alt="Payment QR code" width={280} height={280} />}
              {"NDEFReader" in window && <button onClick={tapNfc}>Tap with NFC</button>}
              {nfc && <div className="muted">{nfc}</div>}
              <div className="muted">Watching the next {WINDOW} blocks. The address is new: nobody has ever asked about it.</div>
            </>
          ) : (
            <div className="muted">{sale.status === "expired" ? "No payment in the window." : `Error: ${sale.error}`}</div>
          )}
          {ticks.length > 0 && (
            <ol className="ticker" aria-label="Verified blocks">
              {ticks.map((t) => (
                <li key={t.n} data-hit={t.hit}>block {t.n} · {t.accounts} accounts · hash ✓{t.hit ? " · payment" : ""}</li>
              ))}
            </ol>
          )}
          {sale.status !== "watching" && <button onClick={() => setSale(undefined)}>New sale</button>}
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h2>Today</h2>
          <ul className="history">
            {history.slice(0, 20).map((s) => (
              <li key={s.index} data-status={s.status}>
                <span>{fmtInr(s.inr)}</span>
                <span className="muted">{s.status}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Kept on this phone only.</p>
        </section>
      )}
    </main>
  );
}
