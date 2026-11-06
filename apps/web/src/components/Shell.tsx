import type { ReactNode } from "react";
import { network } from "../lib/anon";
import { friendly } from "../lib/errors";
import FallbackBanner from "./FallbackBanner";
import InstallButton from "./InstallButton";
import { useStore } from "../lib/store";
import Icon from "./Icon";
import Tape from "./Tape";

export const NAV = [
  { href: "#/portfolio", label: "Portfolio", icon: "portfolio" },
  { href: "#/watch", label: "Watch", icon: "watch" },
  { href: "#/lookup", label: "Lookup", icon: "lookup" },
  { href: "#/send", label: "Send", icon: "send" },
  { href: "#/spy", label: "Spy panel", icon: "spy" },
] as const;

function Status() {
  const s = useStore((s) => s.status);
  const text = s.phase === "live" ? <span>Live<span className="status-long"> · block</span> {s.head}</span> : s.phase === "paused" ? "Paused" : s.phase === "connecting" ? "Connecting" : s.phase === "error" ? "Reconnecting" : "Idle";
  return (
    <a className="status" href="#/network" data-phase={s.phase} title={friendly(s.message) ?? network().label}>
      <span className="dot" aria-hidden />
      {text}
    </a>
  );
}

function Brand() {
  return (
    <a className="brand" href="#/">
      <span className="brand-mark" aria-hidden />
      Blindspot
    </a>
  );
}

export default function Shell({ route, children }: { route: string; children: ReactNode }) {
  const unread = useStore((s) => s.alerts.filter((a) => !a.read).length);
  const current = (href: string) => (route === href ? "page" : undefined);
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        <nav aria-label="Main">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} aria-current={current(n.href)}>
              <Icon name={n.icon} />
              {n.label}
              {n.href === "#/watch" && unread > 0 && <span className="chip" data-kind="pir" style={{ marginLeft: "auto" }}>{unread}</span>}
            </a>
          ))}
          <a href="#/network" aria-current={current("#/network")}>
            <Icon name="network" />
            Network
          </a>
        </nav>
        <div className="grow" />
        <Status />
        <InstallButton className="btn small" />
        <p className="small faint">Every read goes through the {network().short} mixnet. Nothing you hold or watch leaves this device.</p>
      </aside>

      <header className="topbar">
        <Brand />
        <Status />
      </header>

      <main className="main" id="main"><FallbackBanner />{children}</main>

      <aside className="rail" aria-label="Verified blocks">
        <Tape />
      </aside>

      <nav className="tabs" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} aria-current={current(n.href)}>
            <Icon name={n.icon} />
            {n.label === "Spy panel" ? "Spy" : n.label}
            {n.href === "#/watch" && unread > 0 && <span className="badge" aria-label={`${unread} new alerts`}>{unread > 9 ? "9+" : unread}</span>}
          </a>
        ))}
      </nav>
    </div>
  );
}
