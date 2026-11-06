// A short checklist so a new user always has an obvious next step. Every item is derived from real app state
// (nothing to fake): connected, watching a wallet, got an alert, did a private lookup, saw the Spy panel.
import { useState } from "react";
import { useStore } from "../lib/store";
import { GUIDE_KEY, readGuide } from "../lib/actions";
import Icon from "./Icon";


const read = readGuide;

export default function GettingStarted() {
  const status = useStore((s) => s.status);
  const tape = useStore((s) => s.tape);
  const wallets = useStore((s) => s.wallets);
  const alerts = useStore((s) => s.alerts);
  const [flags, setFlags] = useState(read);
  const watched = new Set(wallets.filter((w) => w.kind === "watch").map((w) => w.address.toLowerCase()));
  const steps = [
    { done: status.phase === "live" || tape.length > 0, label: "Connect privately", hint: "Opening a route through the mixnet…", href: "#/network", cta: "Status" },
    { done: watched.size > 0, label: "Watch a wallet", hint: "Pick an active trader, or paste a whale's address.", href: "#/watch", cta: "Find traders" },
    { done: alerts.some((a) => watched.has(a.address.toLowerCase())), label: "Get your first alert", hint: "Arrives within a block of a watched wallet's trade.", href: "#/watch", cta: "Alerts" },
    { done: !!flags.lookup, label: "Look up a balance privately", hint: "Any address, without the server knowing which.", href: "#/lookup", cta: "Try it" },
    { done: !!flags.spy, label: "See what a normal wallet leaks", hint: "Three providers side by side.", href: "#/spy", cta: "Open" },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (flags.hidden || left === 0) return null;
  const next = steps.find((s) => !s.done)!;
  const hide = () => { try { localStorage.setItem(GUIDE_KEY, JSON.stringify({ ...read(), hidden: true })); } catch {} setFlags({ ...flags, hidden: true }); };
  return (
    <section className="panel guide" aria-label="Getting started">
      <header>
        <h2>Getting started</h2>
        <span className="small muted">{steps.length - left} of {steps.length}</span>
      </header>
      <span className="guide-bar" aria-hidden><i style={{ width: `${(100 * (steps.length - left)) / steps.length}%` }} /></span>
      <ol className="guide-steps">
        {steps.map((s) => (
          <li key={s.label} data-done={s.done} data-next={s === next}>
            <span className="guide-dot" aria-hidden>{s.done && <Icon name="check" />}</span>
            <span className="guide-text"><b>{s.label}</b>{s === next && <small>{s.hint}</small>}</span>
            {s === next && <a className="btn small primary" href={s.href}>{s.cta}</a>}
          </li>
        ))}
      </ol>
      <button type="button" className="guide-hide small" onClick={hide}>Hide this</button>
    </section>
  );
}
