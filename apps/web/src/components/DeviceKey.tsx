// Back up or replace the key that signs on this device. Everything here stays in the browser: no logging, no network.
import { useState } from "react";
import { deviceAccount, deviceKey, importDeviceKey } from "../lib/device";
import { short } from "../lib/format";
import { backupText, parsePrivateKey } from "../lib/keyfile";

type Mode = "idle" | "backup" | "import";

export default function DeviceKey() {
  const [mode, setMode] = useState<Mode>("idle");
  const [ack, setAck] = useState(false);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState("");
  const [backedUp, setBackedUp] = useState(false);
  const address = deviceAccount().address;
  const parsed = input.trim() ? parsePrivateKey(input) : undefined;
  const same = parsed?.ok && parsed.address.toLowerCase() === address.toLowerCase();

  const close = () => { setMode("idle"); setAck(false); setShown(false); setCopied(false); setInput(""); setBackedUp(false); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(deviceKey()); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
  };
  const download = () => {
    const blob = new Blob([backupText(deviceKey(), address)], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `blindspot-key-${address.slice(2, 8).toLowerCase()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const readFile = (f?: File) => f && f.size < 4096 && f.text().then(setInput).catch(() => {});
  const useKey = () => {
    if (!parsed?.ok || same) return;
    importDeviceKey(parsed.key);
    location.reload();
  };

  return (
    <section className="panel device-key">
      <header>
        <h2>This wallet's key</h2>
        <span className="small muted mono">{short(address)}</span>
      </header>
      <p className="small muted">The key that signs your trades lives only in this browser. Clearing site data or switching devices loses it, so back it up, or import one you already have.</p>

      {mode === "idle" && (
        <div className="actions">
          <button className="btn small" onClick={() => setMode("backup")}>Back up key</button>
          <button className="btn small" onClick={() => setMode("import")}>Import key</button>
        </div>
      )}

      {mode === "backup" && (
        <div className="key-box">
          <div className="callout warn-callout">
            <strong>Anyone with this key can take the funds in this wallet.</strong>
            <span>Never paste it into a website or send it to anyone. Keep it offline or in a password manager.</span>
          </div>
          <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand. Show me the key.</label>
          {ack && (
            <>
              <code className="key-text mono" aria-label="Private key">{shown ? deviceKey() : "•".repeat(64)}</code>
              <div className="actions">
                <button className="btn small" onClick={() => setShown((v) => !v)}>{shown ? "Hide" : "Show"}</button>
                <button className="btn small" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
                <button className="btn small primary" onClick={download}>Download backup file</button>
              </div>
            </>
          )}
          <button className="btn small ghost" onClick={close}>Done</button>
        </div>
      )}

      {mode === "import" && (
        <div className="key-box">
          <div className="callout warn-callout">
            <strong>This replaces the wallet on this device.</strong>
            <span>Funds in the current wallet ({short(address)}) are only reachable with its key, so back it up first unless it's empty.</span>
          </div>
          <label className="field">
            <span>Private key or backup file text</span>
            <textarea className="mono key-input" rows={3} value={input} onChange={(e) => setInput(e.target.value)}
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="0x…" />
          </label>
          <label className="small muted file-pick">or choose a backup file <input type="file" accept=".txt,text/plain" onChange={(e) => readFile(e.target.files?.[0])} /></label>
          {parsed && !parsed.ok && <p className="error-text">{parsed.error}</p>}
          {parsed?.ok && !same && <p className="small">This key opens <b className="mono">{short(parsed.address)}</b>.</p>}
          {same && <p className="small muted">That's the key this device already uses.</p>}
          <label className="check"><input type="checkbox" checked={backedUp} onChange={(e) => setBackedUp(e.target.checked)} /> I've backed up the current key, or it holds nothing.</label>
          <div className="actions">
            <button className="btn small primary" disabled={!parsed?.ok || !!same || !backedUp} onClick={useKey}>Use this key</button>
            <button className="btn small ghost" onClick={close}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
