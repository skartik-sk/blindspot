// Footer illustration: Mumbai at dusk, the Bandra–Worli Sea Link over the water. Pure SVG, colours from CSS tokens.
const W = 1440;
const HORIZON = 262;

// Distant city: deterministic towers (left: Worli, right: Bandra), no randomness so renders are stable.
function towers(x0: number, x1: number, seed: number) {
  const out: { x: number; w: number; h: number }[] = [];
  let x = x0;
  let s = seed;
  while (x < x1) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    const w = 14 + Math.round(r * 26);
    const h = 18 + Math.round(((r * 7) % 1) * 70) + (r > 0.82 ? 50 : 0);
    out.push({ x, w, h });
    x += w + 2 + Math.round(r * 6);
  }
  return out;
}
const CITY = [...towers(0, 360, 7), ...towers(1080, W, 21)];

/** Cable-stayed pylon: inverted Y with a fan of stays on both sides. */
function Pylon({ x, deck, top }: { x: number; deck: number; top: number }) {
  const fork = deck - 46;
  const stays = Array.from({ length: 9 }, (_, i) => i);
  return (
    <g className="sk-link">
      <path d={`M${x - 15} ${deck} L${x} ${fork} L${x + 15} ${deck} M${x} ${fork} L${x} ${top}`} strokeWidth="5" fill="none" strokeLinejoin="round" />
      {stays.map((i) => {
        const y = top + 8 + i * 7;
        const d = 34 + i * 24;
        return <path key={i} d={`M${x} ${y} L${x - d} ${deck} M${x} ${y} L${x + d} ${deck}`} strokeWidth="1" fill="none" opacity="0.75" />;
      })}
    </g>
  );
}

export default function Skyline() {
  const deckY = (x: number) => 238 + Math.sin((x / W) * Math.PI) * -10; // gentle arc
  const deck = Array.from({ length: 25 }, (_, i) => (i / 24) * (W + 80) - 40).map((x) => `${x},${deckY(x)}`).join(" ");
  return (
    <svg className="S-skyline" viewBox={`0 0 ${W} 360`} preserveAspectRatio="xMidYMax slice" role="img"
      aria-label="Illustration: the Bandra–Worli Sea Link over the sea at dusk, Mumbai">
      <defs>
        <linearGradient id="sk-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--bg)" }} />
          <stop offset="0.3" style={{ stopColor: "var(--bg)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--sky-1)" }} />
          <stop offset="0.78" style={{ stopColor: "var(--sky-2)" }} />
          <stop offset="1" style={{ stopColor: "var(--sky-3)" }} />
        </linearGradient>
        <linearGradient id="sk-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sea-1)" }} />
          <stop offset="1" style={{ stopColor: "var(--sea-2)" }} />
        </linearGradient>
        <radialGradient id="sk-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: "var(--sun-1)" }} />
          <stop offset="1" style={{ stopColor: "var(--sun-2)" }} />
        </radialGradient>
        <filter id="sk-soft"><feGaussianBlur stdDeviation="18" /></filter>
      </defs>

      <rect width={W} height={HORIZON} fill="url(#sk-sky)" />
      <circle cx="1010" cy={HORIZON - 4} r="120" fill="var(--sun-2)" opacity="0.35" filter="url(#sk-soft)" />
      <circle cx="1010" cy={HORIZON - 4} r="62" fill="url(#sk-sun)" />

      <g className="sk-city">
        {CITY.map((b, i) => <rect key={i} x={b.x} y={HORIZON - b.h} width={b.w} height={b.h} rx="1.5" />)}
      </g>

      <rect y={HORIZON} width={W} height={360 - HORIZON} fill="url(#sk-sea)" />
      <g className="sk-glint">
        {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={1010 - 70 + i * 9 - (i % 2) * 20} y={HORIZON + 10 + i * 13} width={140 - i * 18} height="2.5" rx="1.25" />)}
      </g>

      <polyline className="sk-link" points={deck} fill="none" strokeWidth="6" strokeLinecap="round" />
      <Pylon x={520} deck={deckY(520)} top={118} />
      <Pylon x={760} deck={deckY(760)} top={104} />
      <g className="sk-piers">
        {Array.from({ length: 30 }, (_, i) => -20 + i * 52).map((x) => <rect key={x} x={x} y={deckY(x) + 3} width="3" height={HORIZON - deckY(x) + 4} />)}
      </g>
      <g className="sk-waves">
        {[300, 318, 336].map((y, i) => <path key={y} d={`M0 ${y} Q 180 ${y - 4} 360 ${y} T 720 ${y} T 1080 ${y} T 1440 ${y}`} fill="none" strokeWidth="1.2" opacity={0.5 - i * 0.12} />)}
      </g>
    </svg>
  );
}
