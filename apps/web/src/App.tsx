import { useEffect, useState } from "react";
import Diag from "./pages/Diag";

const routes: Record<string, () => React.ReactNode> = {
  "#/diag": () => <Diag />,
};

function Home() {
  return (
    <main className="page">
      <h1>Bina Pooche</h1>
      <p className="muted">Tap to pay. Your RPC provider learns nothing.</p>
      <nav className="links">
        <a href="#/merchant">Merchant</a>
        <a href="#/customer">Customer</a>
        <a href="#/spy">Spy Panel</a>
        <a href="#/diag">Diagnostics</a>
      </nav>
    </main>
  );
}

export default function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return (routes[hash] ?? Home)();
}
