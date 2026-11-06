// Footer illustration: Mumbai at dusk — the Bandra–Worli Sea Link over the Arabian Sea, Worli's towers behind.
// Pure SVG with atmospheric depth (three skyline layers, haze), a cable-stayed bridge drawn to its real form
// (inverted-Y pylons, fan of stays, box deck, tapered piers) and the whole scene reflected in the water.
// Colours come from CSS tokens; gentle motion is CSS-only and stops under reduced motion.
const W = 1440;
const H = 380;
const HZ = 286; // horizon / waterline

type Tower = { x: number; w: number; h: number; kind: number; s: number };

/** Deterministic towers (no Math.random: renders must be stable). */
function skyline(x0: number, x1: number, seed: number, minH: number, varH: number, tall: number, gap: number): Tower[] {
  const out: Tower[] = [];
  let x = x0;
  let s = seed;
  while (x < x1) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    const w = 14 + Math.round(r * 26);
    const h = minH + Math.round(((r * 13) % 1) * varH) + (r > 1 - tall ? varH : 0);
    out.push({ x, w, h, kind: Math.floor(((r * 31) % 1) * 5), s });
    x += w + gap + Math.round(((r * 7) % 1) * 6);
  }
  return out;
}

/** A tower outline: flat roof, setback, spire, slanted top, or a crowned slab. */
function towerPath({ x, w, h, kind }: Tower) {
  const t = HZ - h;
  switch (kind) {
    case 1: { // setback
      const i = Math.round(w * 0.22);
      return `M${x} ${HZ} V${t + 14} H${x + i} V${t} H${x + w - i} V${t + 14} H${x + w} V${HZ} Z`;
    }
    case 2: // spire
      return `M${x} ${HZ} V${t} H${x + w / 2 - 1} V${t - 16} H${x + w / 2 + 1} V${t} H${x + w} V${HZ} Z`;
    case 3: // slanted roof
      return `M${x} ${HZ} V${t + 8} L${x + w} ${t} V${HZ} Z`;
    case 4: { // crown
      const c = Math.max(4, Math.round(w * 0.3));
      return `M${x} ${HZ} V${t} H${x + c} V${t - 6} H${x + w - c} V${t} H${x + w} V${HZ} Z`;
    }
    default:
      return `M${x} ${HZ} V${t} H${x + w} V${HZ} Z`;
  }
}

const FAR = [...skyline(-20, 470, 5, 30, 34, 0.15, 1), ...skyline(980, W + 20, 13, 28, 40, 0.18, 1)];
const MID = [...skyline(-10, 400, 17, 44, 46, 0.2, 3), ...skyline(1040, W + 10, 29, 46, 58, 0.22, 3)];
// Worli's signature slim towers, front right
const NEAR: Tower[] = [
  ...skyline(-10, 250, 41, 58, 62, 0.25, 5),
  { x: 1188, w: 26, h: 168, kind: 4, s: 7 }, { x: 1222, w: 30, h: 150, kind: 1, s: 11 },
  ...skyline(1262, W + 10, 53, 64, 74, 0.3, 5),
];

function windows(b: Tower) {
  const out: { x: number; y: number; on: boolean }[] = [];
  for (let row = 0; row < Math.floor((b.h - 10) / 9); row++)
    for (let col = 0; col < Math.floor((b.w - 6) / 6); col++) {
      const v = (b.s * 7 + row * 13 + col * 29) % 17;
      if (v < 6) out.push({ x: b.x + 4 + col * 6, y: HZ - b.h + 8 + row * 9, on: v === 0 });
    }
  return out;
}

const deckY = (x: number) => 252 - Math.sin(((x + 40) / (W + 80)) * Math.PI) * 14;

/** Cable-stayed pylon: inverted Y whose legs stand in the water, a single mast above, and a fan of stays. */
function Pylon({ x, top }: { x: number; top: number }) {
  const d = deckY(x);
  const join = d - 34;
  const stays = Array.from({ length: 16 }, (_, i) => i);
  return (
    <g>
      <g className="sk-stays">
        {stays.map((i) => {
          const y = top + 10 + i * 4.2;
          const reach = 36 + i * 15.5;
          return <path key={i} d={`M${x} ${y} L${x - reach} ${deckY(x - reach) + 1} M${x} ${y} L${x + reach} ${deckY(x + reach) + 1}`} />;
        })}
      </g>
      <path className="sk-pylon" d={`M${x - 3} ${top} L${x + 3} ${top} L${x + 4} ${join} L${x + 22} ${HZ + 2} L${x + 13} ${HZ + 2} L${x} ${join + 22} L${x - 13} ${HZ + 2} L${x - 22} ${HZ + 2} L${x - 4} ${join} Z`} />
      <rect className="sk-pylon-cap" x={x - 3} y={top - 3} width="6" height="5" rx="1" />
    </g>
  );
}

function Bridge() {
  const xs = Array.from({ length: 49 }, (_, i) => (i / 48) * (W + 80) - 40);
  const top = xs.map((x) => `${x.toFixed(1)},${deckY(x).toFixed(1)}`).join(" L");
  const bottom = [...xs].reverse().map((x) => `${x.toFixed(1)},${(deckY(x) + 7).toFixed(1)}`).join(" L");
  const piers = Array.from({ length: 31 }, (_, i) => -16 + i * 48).filter((x) => Math.abs(x - 560) > 46 && Math.abs(x - 800) > 46);
  return (
    <g>
      <g className="sk-piers">
        {piers.map((x) => {
          const y = deckY(x) + 6;
          return <path key={x} d={`M${x - 3} ${y} L${x + 3} ${y} L${x + 4.5} ${HZ + 1} L${x - 4.5} ${HZ + 1} Z`} />;
        })}
      </g>
      <path className="sk-deck" d={`M${top} L${bottom} Z`} />
      <path className="sk-rail" d={`M${xs.map((x) => `${x.toFixed(1)},${(deckY(x) - 1.5).toFixed(1)}`).join(" L")}`} />
      <Pylon x={560} top={132} />
      <Pylon x={800} top={118} />
    </g>
  );
}

function City() {
  return (
    <g>
      <g className="sk-far">{FAR.map((b, i) => <path key={i} d={towerPath(b)} />)}</g>
      <g className="sk-mid">{MID.map((b, i) => <path key={i} d={towerPath(b)} />)}</g>
      <rect x="0" y={HZ - 70} width={W} height="70" fill="url(#sk-haze)" />
      <g className="sk-near">{NEAR.map((b, i) => <path key={i} d={towerPath(b)} />)}</g>
      <g className="sk-win">
        {NEAR.flatMap(windows).map((w, i) => <rect key={i} x={w.x} y={w.y} width="2.6" height="3.4" className={w.on ? "on" : undefined} style={w.on ? { animationDelay: `${(i % 11) * 0.6}s` } : undefined} />)}
      </g>
    </g>
  );
}

export default function Skyline() {
  return (
    <svg className="S-skyline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" role="img"
      aria-label="Illustration: the Bandra–Worli Sea Link over the Arabian Sea at dusk, with Worli's towers behind">
      <defs>
        <linearGradient id="sk-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--bg)" }} />
          <stop offset="0.3" style={{ stopColor: "var(--bg)" }} />
          <stop offset="0.55" style={{ stopColor: "var(--sky-1)" }} />
          <stop offset="0.82" style={{ stopColor: "var(--sky-2)" }} />
          <stop offset="1" style={{ stopColor: "var(--sky-3)" }} />
        </linearGradient>
        <linearGradient id="sk-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sea-1)" }} />
          <stop offset="1" style={{ stopColor: "var(--sea-2)" }} />
        </linearGradient>
        <linearGradient id="sk-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--sky-3)", stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: "var(--sky-3)", stopOpacity: 0.75 }} />
        </linearGradient>
        <radialGradient id="sk-sun" cx="0.5" cy="0.42" r="0.6">
          <stop offset="0" style={{ stopColor: "var(--sun-1)" }} />
          <stop offset="1" style={{ stopColor: "var(--sun-2)" }} />
        </radialGradient>
        <radialGradient id="sk-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: "var(--sun-2)", stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: "var(--sun-2)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id="sk-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="sk-reflect-mask"><rect x="0" y={HZ} width={W} height={H - HZ} fill="url(#sk-fade)" /></mask>
        <filter id="sk-ripple" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="0.8" />
        </filter>
        <filter id="sk-cloud" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5" /></filter>
        <clipPath id="sk-sky-clip"><rect width={W} height={HZ} /></clipPath>
      </defs>

      {/* sky, sun, clouds */}
      <rect width={W} height={HZ} fill="url(#sk-sky)" />
      <g clipPath="url(#sk-sky-clip)">
        <circle cx="885" cy={HZ - 10} r="200" fill="url(#sk-glow)" />
        <circle className="sk-sun" cx="885" cy={HZ - 18} r="38" fill="url(#sk-sun)" />
      </g>
      <g className="sk-clouds" filter="url(#sk-cloud)">
        <ellipse cx="250" cy="170" rx="150" ry="7" /><ellipse cx="330" cy="160" rx="80" ry="6" />
        <ellipse cx="690" cy="138" rx="190" ry="6" /><ellipse cx="760" cy="146" rx="110" ry="5" />
        <ellipse cx="1180" cy="176" rx="140" ry="6" /><ellipse cx="1290" cy="166" rx="70" ry="5" />
      </g>
      <g className="sk-birds">
        <path d="M640 112 q5 -4 10 0 q5 -4 10 0" /><path d="M668 100 q4 -3 8 0 q4 -3 8 0" /><path d="M622 96 q3.5 -3 7 0 q3.5 -3 7 0" />
      </g>

      <g id="sk-city"><City /></g>

      {/* water, then the scene mirrored in it */}
      <rect y={HZ} width={W} height={H - HZ} fill="url(#sk-sea)" />
      <g mask="url(#sk-reflect-mask)" filter="url(#sk-ripple)" opacity="0.55">
        <g transform={`translate(0 ${2 * HZ}) scale(1 -1)`}>
          <use href="#sk-city" />
          <use href="#sk-bridge" />
          <circle cx="885" cy={HZ - 18} r="38" fill="url(#sk-sun)" />
        </g>
      </g>
      <g className="sk-glint">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={885 - 50 + ((i * 37) % 23) - i * 2} y={HZ + 6 + i * 10} width={100 - i * 9} height="1.6" rx="0.8" />)}
      </g>

      <g id="sk-bridge"><Bridge /></g>

      <g className="sk-boat">
        <path className="sk-hull" d="M262 322 h46 q-4 8 -12 9 h-24 q-8 -1 -10 -9 z" />
        <path className="sk-sail" d="M284 321 v-26 l15 24 z" /><path className="sk-mast" d="M284 321 v-30" />
      </g>
      <g className="sk-boat far">
        <path className="sk-hull" d="M1300 300 h22 q-2 4 -6 4.5 h-10 q-4 -0.5 -6 -4.5 z" /><path className="sk-sail" d="M1310 299.5 v-12 l7 11.5 z" />
      </g>
      <g className="sk-waves">
        {[310, 332, 356].map((y, i) => <path key={y} d={`M-40 ${y} Q 140 ${y - 3} 320 ${y} T 680 ${y} T 1040 ${y} T 1400 ${y} T 1760 ${y}`} style={{ opacity: 0.35 - i * 0.09 }} />)}
      </g>
    </svg>
  );
}
