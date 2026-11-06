// Two opt-in ways to keep alerts coming when you're not looking at the tab. Neither sends anything new:
// the same block-number requests continue, and notifications use data already on this device.
import { useEffect, useRef, useState } from "react";
import { keepWatching, saveKeepWatching, turnOn, type Perm } from "../lib/background";

const notifSupported = typeof Notification !== "undefined";
// Phones stop hidden tabs, so the background toggle is for desktop; phones get Watch mode instead.
const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
const wakeSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;

function KeepWatching() {
  const [on, setOn] = useState(keepWatching);
  const [note, setNote] = useState<string>();
  const toggle = async (want: boolean) => {
    setNote(undefined);
    if (!want) { saveKeepWatching(false); setOn(false); return; }
    const perm: Perm = notifSupported ? Notification.permission : "unsupported";
    const r = await turnOn(perm, () => Notification.requestPermission());
    saveKeepWatching(r.on);
    setOn(r.on);
    setNote(r.note);
  };
  return (
    <div>
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
        <span><strong>Keep watching in background</strong></span>
      </label>
      <p className="small muted">
        {on
          ? "On: blocks keep downloading while this tab is hidden (about 250–330 KB each), and you get a notification when a watched wallet trades. Browsers may slow hidden tabs, so a notification can arrive up to a minute late."
          : "Off: the app pauses while the tab is hidden and catches up when you come back. Turning this on asks to show notifications."}
      </p>
      {note && <p className="small down" role="status">{note}</p>}
    </div>
  );
}

function WatchMode() {
  const lock = useRef<WakeLockSentinel | null>(null);
  const [on, setOn] = useState(false);
  const [note, setNote] = useState<string>();
  // Leaving this screen releases the lock.
  useEffect(() => () => { lock.current?.release().catch(() => {}); lock.current = null; }, []);
  const start = async () => {
    setNote(undefined);
    try {
      const s = await navigator.wakeLock.request("screen");
      lock.current = s;
      setOn(true);
      // The browser also releases it when you switch apps or lock the phone.
      s.addEventListener("release", () => { if (lock.current === s) lock.current = null; setOn(false); });
    } catch {
      setNote("The browser refused to keep the screen on (battery saver may block it).");
    }
  };
  const stop = () => { lock.current?.release().catch(() => {}); lock.current = null; setOn(false); };
  return (
    <div>
      <button type="button" className={on ? "btn primary" : "btn"} aria-pressed={on} onClick={on ? stop : start}>
        {on ? "Watch mode on · tap to stop" : "Watch mode"}
      </button>
      <p className="small muted">
        {on
          ? "The screen stays on while this screen is open, so alerts keep arriving. This uses more battery: plug in if you can."
          : "Keeps the screen awake while you watch, so alerts keep coming on a phone. Uses more battery. Stops when you leave this screen, switch apps or tap again."}
      </p>
      {note && <p className="small down" role="status">{note}</p>}
    </div>
  );
}

export default function BackgroundWatch() {
  const showToggle = notifSupported && !coarse;
  if (!showToggle && !wakeSupported) return null;
  return (
    <section className="panel">
      <header><h2>While you're away</h2></header>
      {showToggle && <KeepWatching />}
      {wakeSupported && <WatchMode />}
    </section>
  );
}
