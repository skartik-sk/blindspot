// Customer: read the merchant's payment request (NFC / camera / paste), sign locally, send through Anon-RPC.
import { useEffect, useRef, useState } from "react";
import { createPublicClient, createWalletClient, erc20Abi, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { SEPOLIA_USDC, newIsolationKey } from "@bina/sdk";
import { anonFetch, network } from "../lib/anon";
import { config } from "../lib/config";
import { fmtInr, fmtUsdc, usdcUnitsToInr } from "../lib/money";
import { decodePayReq, type PayReq } from "../lib/payreq";

const KEY = "bina.customer.key";

// Demo burner wallet, kept on this device only (see README trade-offs).
function burner() {
  let k = localStorage.getItem(KEY) as Hex | null;
  if (!k) localStorage.setItem(KEY, (k = generatePrivateKey()));
  return privateKeyToAccount(k);
}

/** viem transport whose every request goes through Anon-RPC under one isolation key. */
const anonTransport = (isolationKey: string) =>
  http(config.sendUrl, {
    fetchFn: (input, init) => anonFetch(String(input instanceof Request ? input.url : input), { ...init, anonOptions: { isolationKey } }),
  });

export default function Customer() {
  const account = useRef(burner()).current;
  const [req, setReq] = useState<PayReq>();
  const [paste, setPaste] = useState("");
  const [status, setStatus] = useState<string>();
  const [tx, setTx] = useState<Hex>();
  const [bal, setBal] = useState<{ usdc: bigint; eth: bigint }>();
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  // The customer's own balance: asked once, through the mixnet, under its own isolation key.
  // Trade-off: this does name the customer's address to the provider (not the merchant's). README.
  async function refresh() {
    const c = createPublicClient({ chain: sepolia, transport: anonTransport(newIsolationKey()) });
    const [usdc, eth] = await Promise.all([
      c.readContract({ address: SEPOLIA_USDC.token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
      c.getBalance({ address: account.address }),
    ]);
    setBal({ usdc, eth });
  }
  useEffect(() => { refresh().catch((e) => setStatus(`balance: ${e.message}`)); }, []);

  function accept(s: string) {
    try {
      const r = decodePayReq(s);
      if (r.chainId !== sepolia.id || r.token.toLowerCase() !== SEPOLIA_USDC.token) throw new Error("only Sepolia USDC is supported");
      setReq(r);
      setStatus(undefined);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function readNfc() {
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      setStatus("Hold near the merchant's phone…");
      ndef.onreading = (ev: any) => {
        const rec = ev.message.records.find((r: any) => r.recordType === "url");
        if (rec) accept(new TextDecoder().decode(rec.data));
      };
    } catch (e) {
      setStatus(`NFC unavailable: ${(e as Error).message}`);
    }
  }

  async function scanQr() {
    const BD = (window as any).BarcodeDetector;
    if (!BD) return setStatus("Camera scanning isn't supported in this browser; paste the request instead.");
    setScanning(true);
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const v = video.current!;
    v.srcObject = stream;
    await v.play();
    const det = new BD({ formats: ["qr_code"] });
    const stop = () => (stream.getTracks().forEach((t) => t.stop()), setScanning(false));
    const tick = async () => {
      const [code] = await det.detect(v).catch(() => []);
      if (code?.rawValue?.startsWith("ethereum:")) return stop(), accept(code.rawValue);
      if (v.srcObject) requestAnimationFrame(tick);
    };
    tick();
  }

  async function pay() {
    if (!req) return;
    setStatus("Signing on this phone, sending through " + network().label + "…");
    try {
      const key = newIsolationKey(); // this payment's traffic is unlinkable from any other
      const wallet = createWalletClient({ account, chain: sepolia, transport: anonTransport(key) });
      const hash = await wallet.writeContract({
        address: req.token, abi: erc20Abi, functionName: "transfer", args: [req.to, req.amount],
      });
      setTx(hash);
      setStatus("Sent. The merchant's phone will see it in the next block.");
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message.split("\n")[0]}`);
    }
  }

  return (
    <main className="page">
      <header className="bar">
        <a href="#/">←</a>
        <h1>Pay</h1>
        <span className="pill">{network().label}</span>
      </header>

      <section className="card">
        <div className="muted small">Your wallet (this device only)</div>
        <code className="hash">{account.address}</code>
        <div>
          {bal ? `${fmtUsdc(bal.usdc)} USDC · ${(Number(bal.eth) / 1e18).toFixed(4)} ETH` : "…"}
          <button onClick={() => refresh().catch((e) => setStatus(e.message))} style={{ marginLeft: 8 }}>↻</button>
        </div>
        {bal && (bal.usdc === 0n || bal.eth === 0n) && (
          <div className="muted small">
            Fund it with Sepolia ETH (gas) and Sepolia USDC from <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a>.
          </div>
        )}
      </section>

      {!req ? (
        <section className="card">
          {"NDEFReader" in window && <button className="primary" onClick={readNfc}>Tap merchant's phone (NFC)</button>}
          <button onClick={scanQr}>Scan QR code</button>
          <video ref={video} hidden={!scanning} playsInline muted style={{ width: "100%", borderRadius: 12 }} />
          <textarea rows={3} placeholder="…or paste ethereum:… request" value={paste} onChange={(e) => setPaste(e.target.value)}
            style={{ font: "inherit", padding: 12, borderRadius: 12, border: "1px solid var(--line)", background: "transparent", color: "inherit" }} />
          <button onClick={() => accept(paste)} disabled={!paste}>Use pasted request</button>
        </section>
      ) : (
        <section className="card">
          <div className="big">{fmtInr(usdcUnitsToInr(req.amount))}</div>
          <div className="muted">{fmtUsdc(req.amount)} USDC to a one-time address</div>
          <code className="hash">{req.to}</code>
          {!tx && <button className="primary" onClick={pay}>Pay</button>}
          {tx && <a className="hash" href={`https://sepolia.etherscan.io/tx/${tx}`} target="_blank" rel="noreferrer">{tx}</a>}
          <button onClick={() => (setReq(undefined), setTx(undefined), setStatus(undefined))}>Done</button>
        </section>
      )}
      {status && <p className="muted">{status}</p>}
    </main>
  );
}
