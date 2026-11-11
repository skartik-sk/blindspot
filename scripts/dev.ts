// `bun run dev`: a local relay (http://localhost:8787) and the web app (http://localhost:5173) together.
// The web app reaches a relay on localhost directly (mixnet exits can't reach your machine; the app says so).
// Everything else (second checks, light client, lookups) still goes through Anon-RPC.
const relay = Bun.spawn(["bun", "--watch", "src/server.ts"], { cwd: "apps/relay", stdout: "inherit", stderr: "inherit", env: { ...process.env, PORT: "8787" } });
const web = Bun.spawn(["bunx", "vite", "--port", "5173"], { cwd: "apps/web", stdout: "inherit", stderr: "inherit", env: { ...process.env, VITE_RELAY_URL: process.env.VITE_RELAY_URL ?? "http://localhost:8787" } });
const stop = () => { relay.kill(); web.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log("relay: http://localhost:8787/health · web: http://localhost:5173 (Ctrl-C stops both)");
await Promise.race([relay.exited, web.exited]);
stop();
