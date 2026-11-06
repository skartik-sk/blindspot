// Footer illustration: Mumbai at dusk, the Bandra–Worli Sea Link. Pure SVG, layered for depth (far city, near city
// with lit windows, the bridge, water), colours from CSS tokens. Gentle motion is CSS-only and off for reduced motion.
const W = 1440;
const H = 380;
const HORIZON = 282;

/** Deterministic pseudo-random towers (no Math.random: renders must be stable). */
function towers(x0: number, x1: number, seed: number, minH: number, varH: number, tallChance: number) {
  const out: { x: number; w: number; h: number; s: number }[] = [];
  let x = x0;
  let s = seed;
  while (x < x1) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    const w = 16 + Math.round(r * 30);
    const h = minH + Math.round(((r * 7) % 1) * varH) + (r > 1 - tallChance ? varH * 0.9 : 0);
    out.push({ x, w, h, s });
    x += w + 3 + Math.round(r * 7);
  }
  return out;
}
const FAR = [...towers(-10, 420, 3, 26, 46, 0.12), ...towers(1020, W + 10, 11, 24, 50, 0.14)];
const NEAR = [...towers(-10, 300, 7, 40, 70, 0.2), ...towers(1140, W + 10, 21, 44, 80, 0.22)];

function windows(b: { x: number; w: number; h: number; s: number }) {
  const out: { x: number; y: number }[] = [];
  for (let row = 0; row < Math.floor(b.h / 12); row++)
    for (let col = 0; col < Math.floor(b.w / 9); col++)
      if ((b.s + row * 31 + col * 17) % 11 === 0) out.push({ x: b.x + 4 + col * 9, y: HORIZON - b.h + 6 + row * 12 });
  return out;
}

/** Cable-stayed pylon: inverted Y with a harp of thin stays on both sides. */
function Pylon({ x, deck, top }: { x: number; deck: number; top: number }) {
  const fork = deck - 44;
  return (
    <g>
      <path className="sk-pylon" d={`M${x - 14} ${deck + 2} L${x} ${fork} L${x + 14} ${deck + 2} M${x} ${fork} L${x} ${top}`} />
      {Array.from({ length: 11 }, (_, i) => {
        const y = top + 6 + i * 6;
        const d = 30 + i * 21;
        return <path key={i} className="sk-stay" d={`M${x} ${y} L${x - d} ${deck} M${x} ${y} L${x + d} ${deck}`} />;
      })}
    </g>
  );
}

export default function Skyline() {
  const deckY = (x: number) => 258 - Math.sin((x / W) * Math.PI) * 12;
  const deck = Array.from({ length: 41 }, (_, i) => (i / 40) * (W + 80) - 40).map((x) => `${x.toFixed(1)},${deckY(x).toFixed(1)}`).join(" ");
  return (
    <svg className="S-skyline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" role="img"
      aria-label="Illustration: the Bandra–Worli Sea Link over the Arabian Sea at dusk, Mumbai">
      <defs>
        <linearGradient id="sk-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--bg)" }} />
          <stop offset="0.28" style={{ stopColor: "var(--bg)" }} />
          <stop offset="0.52" style={{ stopColor: "var(--sky-1)" }} />
          <stop offset="0.8" style={{ stopColor: "var(--sky-2)" }} />
          <stop offset="1" style={{ stopColor: "var(--sky-3)" }} />
        </linearGradient>
        <linearGradient id="sk-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sea-1)" }} />
          <stop offset="1" style={{ stopColor: "var(--sea-2)" }} />
        </linearGradient>
        <radialGradient id="sk-sun" cx="0.5" cy="0.45" r="0.55">
          <stop offset="0" style={{ stopColor: "var(--sun-1)" }} />
          <stop offset="1" style={{ stopColor: "var(--sun-2)" }} />
        </radialGradient>
        <linearGradient id="sk-reflect" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sun-2)", stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: "var(--sun-2)", stopOpacity: 0 }} />
        </linearGradient>
        <filter id="sk-blur"><feGaussianBlur stdDeviation="22" /></filter>
        <filter id="sk-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
        <clipPath id="sk-above"><rect width={W} height={HORIZON} /></clipPath>
      </defs>

      <rect width={W} height={HORIZON} fill="url(#sk-sky)" />
      <g className="sk-clouds">
        <ellipse cx="300" cy="175" rx="120" ry="9" /><ellipse cx="360" cy="166" rx="70" ry="7" />
        <ellipse cx="760" cy="150" rx="150" ry="8" /><ellipse cx="1240" cy="168" rx="110" ry="8" />
      </g>
      <g clipPath="url(#sk-above)">
        <circle cx="1030" cy={HORIZON + 6} r="140" fill="var(--sun-2)" opacity="0.32" filter="url(#sk-blur)" />
        <circle className="sk-sun" cx="1030" cy={HORIZON + 6} r="64" fill="url(#sk-sun)" />
      </g>

      <g className="sk-far">{FAR.map((b, i) => <rect key={i} x={b.x} y={HORIZON - b.h} width={b.w} height={b.h} rx="1.5" />)}</g>
      <g className="sk-near">{NEAR.map((b, i) => <rect key={i} x={b.x} y={HORIZON - b.h} width={b.w} height={b.h} rx="1.5" />)}</g>
      <g className="sk-win">{NEAR.flatMap(windows).map((w, i) => <rect key={i} x={w.x} y={w.y} width="3" height="4" rx="0.5" style={{ animationDelay: `${(i % 9) * 0.7}s` }} />)}</g>

      <g className="sk-birds">
        <path d="M600 128 q6 -5 12 0 q6 -5 12 0" /><path d="M640 112 q5 -4 10 0 q5 -4 10 0" /><path d="M580 104 q4 -3 8 0 q4 -3 8 0" />
      </g>

      <rect y={HORIZON} width={W} height={H - HORIZON} fill="url(#sk-sea)" />
      <ellipse cx="1030" cy={HORIZON + 34} rx="58" ry="40" fill="url(#sk-reflect)" filter="url(#sk-soft)" />
      <g className="sk-glint">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={1030 - 64 + i * 7 - (i % 2) * 18} y={HORIZON + 9 + i * 12} width={128 - i * 14} height="2" rx="1" />)}
      </g>

      <g className="sk-piers">{Array.from({ length: 30 }, (_, i) => -20 + i * 52).map((x) => <rect key={x} x={x} y={deckY(x) + 3} width="3" height={HORIZON - deckY(x) + 5} />)}</g>
      <polyline className="sk-deck" points={deck} />
      <Pylon x={520} deck={deckY(520)} top={150} />
      <Pylon x={760} deck={deckY(760)} top={134} />

      <g className="sk-boat"><path d="M300 318 h34 l-6 7 h-22 z" /><path d="M316 318 v-16 l12 16 z" /></g>
      <g className="sk-waves">
        {[312, 334, 356].map((y, i) => <path key={y} d={`M-40 ${y} Q 140 ${y - 4} 320 ${y} T 680 ${y} T 1040 ${y} T 1400 ${y} T 1760 ${y}`} style={{ opacity: 0.45 - i * 0.12 }} />)}
      </g>
    </svg>
  );
}
