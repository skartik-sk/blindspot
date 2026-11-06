// Phone -> three mix nodes -> exit -> RPC node. Packets carry block numbers, never addresses.
import { motion, useReducedMotion } from "motion/react";
import { useStore } from "../lib/store";

const NODES = [
  { x: 60, y: 110, label: "Your phone" },
  { x: 250, y: 50, label: "Mix 1" },
  { x: 430, y: 160, label: "Mix 2" },
  { x: 610, y: 60, label: "Mix 3" },
  { x: 790, y: 120, label: "Exit" },
  { x: 960, y: 110, label: "RPC node" },
];
const PATH = NODES.map((n, i) => `${i ? "L" : "M"}${n.x} ${n.y}`).join(" ");

export default function MixnetRoute() {
  const reduce = useReducedMotion();
  const head = useStore((s) => s.status.head);
  const base = head ? Number(head) : 12074105;
  return (
    <div className="mx">
      <svg viewBox="0 0 1020 220" role="img" aria-label="A request travelling from your phone through three mix nodes and an exit to an RPC node">
        <defs>
          <linearGradient id="mx-line" x1="0" x2="1">
            <stop offset="0" stopColor="var(--l-signal)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--l-good)" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <path d={PATH} fill="none" stroke="var(--l-line-strong)" strokeWidth="2" strokeDasharray="4 8" />
        <motion.path d={PATH} fill="none" stroke="url(#mx-line)" strokeWidth="2.5"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.8, ease: "easeInOut" }} />
        {NODES.map((n, i) => (
          <g key={n.label} transform={`translate(${n.x} ${n.y})`}>
            <circle r={i === 0 || i === NODES.length - 1 ? 18 : 14} fill="var(--l-surface-2)" stroke={i === 0 ? "var(--l-signal)" : i === NODES.length - 1 ? "var(--l-good)" : "var(--l-line-strong)"} strokeWidth="2" />
            {i > 0 && i < NODES.length - 1 && <circle r="4" fill="var(--l-ink-3)" />}
            <text y={i % 2 ? -28 : 40} textAnchor="middle" className="mx-label">{n.label}</text>
          </g>
        ))}
        {!reduce && [0, 1, 2].map((k) => (
          <g key={k}>
            <circle r="6" fill="var(--l-signal)">
              <animateMotion dur="4.5s" begin={`${k * 1.5}s`} repeatCount="indefinite" path={PATH} />
            </circle>
            <text className="mx-packet" dy="-12" textAnchor="middle">
              #{(base - k).toLocaleString("en-US")}
              <animateMotion dur="4.5s" begin={`${k * 1.5}s`} repeatCount="indefinite" path={PATH} />
            </text>
          </g>
        ))}
      </svg>
      <div className="mx-notes">
        <span><b>Each hop</b> peels one layer of encryption and knows only its neighbours.</span>
        <span><b>The RPC node</b> sees a block number from an exit. Not you, not your wallets.</span>
      </div>
    </div>
  );
}
