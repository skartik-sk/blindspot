import { useEffect, useState } from "react";
import Onboarding, { needsOnboarding } from "./components/Onboarding";
import Shell from "./components/Shell";
import { ensureDeviceWallet } from "./lib/device";
import { startEngine } from "./lib/engine";
import Landing from "./pages/Landing";
import Lookup from "./pages/Lookup";
import Network from "./pages/Network";
import Portfolio, { loadBalance } from "./pages/Portfolio";
import Send from "./pages/Send";
import Spy from "./pages/Spy";
import Watch from "./pages/Watch";
import { getState } from "./lib/store";

ensureDeviceWallet();
startEngine();
// Balances never loaded before: one private lookup each, staggered so they don't share timing.
getState().wallets
  .filter((w) => w.kind !== "watch" && !getState().balances[w.address])
  .forEach((w, i) => setTimeout(() => loadBalance(w.address).catch(() => {}), 1500 + i * 2500));

const TITLES: Record<string, string> = {
  "#/": "Blindspot: watch from their blind spot",
  "#/portfolio": "Portfolio · Blindspot",
  "#/watch": "Watch · Blindspot",
  "#/lookup": "Private lookup · Blindspot",
  "#/send": "Trade · Blindspot",
  "#/spy": "Spy panel · Blindspot",
  "#/network": "Network · Blindspot",
};

function parse(hash: string) {
  const [path, q = ""] = hash.split("?");
  return { path: path || "#/", query: new URLSearchParams(q) };
}

export default function App() {
  const [hash, setHash] = useState(location.hash);
  const [onboard, setOnboard] = useState(needsOnboarding);
  useEffect(() => {
    const on = () => (setHash(location.hash), window.scrollTo(0, 0));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const { path, query } = parse(hash);
  useEffect(() => { document.title = TITLES[path] ?? TITLES["#/portfolio"]; }, [path]);
  if (path === "#/") return <Landing />;
  const page =
    path === "#/portfolio" ? <Portfolio /> :
    path === "#/watch" ? <Watch /> :
    path === "#/lookup" ? <Lookup /> :
    path === "#/send" ? <Send query={query} key={hash} /> :
    path === "#/spy" ? <Spy /> :
    path === "#/network" ? <Network /> :
    <Portfolio />;
  return (
    <>
      <Shell route={path}>{page}</Shell>
      {onboard && <Onboarding onClose={() => setOnboard(false)} />}
    </>
  );
}
