import { type ReactElement, useRef } from 'react';
import { COLORS, DAY_MS, LABELS, type Scenario, fmtUtc } from '../app/state.ts';
import type { Track } from '../core/timeline.ts';

interface Props {
  scenarios: Scenario[];
  tracks: Track[];
  active: number;
  days: number;
  cursorMs: number; // elapsed since each scenario's start
  playing: boolean;
  speed: number;
  onCursor: (ms: number) => void;
  onActive: (i: number) => void;
  onPlay: (p: boolean) => void;
  onSpeed: (s: number) => void;
}

const W = 1000;
const PAD = { l: 120, r: 12 };
const CHART_H = 150;
const ROW_H = 40;

export function Timeline(p: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { tracks, days } = p;
  const pw = W - PAD.l - PAD.r;
  const spanMs = days * DAY_MS;
  const x = (ms: number) => PAD.l + (ms / spanMs) * pw;
  const H = CHART_H + 26 + tracks.length * ROW_H + 8;
  const at = tracks[p.active];

  // Clearance above terrain (deg) for the active scenario.
  let lo = -4, hi = 6;
  for (let i = 0; i < at.times.length; i++) {
    hi = Math.max(hi, at.sunEl[i] - at.sunHorizon[i], at.earthEl[i] - at.earthHorizon[i]);
    lo = Math.min(lo, at.sunEl[i] - at.sunHorizon[i], at.earthEl[i] - at.earthHorizon[i]);
  }
  hi = Math.min(90, Math.ceil(hi + 1));
  lo = Math.max(-20, Math.floor(lo - 1));
  const cy = (v: number) => 8 + ((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * (CHART_H - 16);

  const linePath = (vals: (i: number) => number) => {
    const n = at.times.length;
    const stride = Math.max(1, Math.floor(n / 2000));
    let d = '';
    for (let i = 0; i < n; i += stride) {
      d += `${i ? ' L' : 'M'} ${x(at.times[i] - at.times[0]).toFixed(1)} ${cy(vals(i)).toFixed(1)}`;
    }
    return d;
  };

  const tickEvery = days <= 14 ? 1 : days <= 60 ? 5 : days <= 180 ? 15 : 30;
  const ticks: number[] = [];
  for (let d = 0; d <= days; d += tickEvery) ticks.push(d);

  const toMs = (clientX: number) => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(spanMs, ((sx - PAD.l) / pw) * spanMs));
  };

  return (
    <section className="panel timeline">
      <header className="panel-head">
        <h2>Timeline</h2>
        <div className="toggles">
          <button className="on" onClick={() => p.onPlay(!p.playing)}>
            {p.playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <span>Speed</span>
          {[0.5, 2, 8].map((s) => (
            <button key={s} className={p.speed === s ? 'on' : ''} onClick={() => p.onSpeed(s)}>
              {s} d/s
            </button>
          ))}
          <span className="muted">
            Day {(p.cursorMs / DAY_MS).toFixed(2)} · {fmtUtc(at.times[0] + p.cursorMs)} ({LABELS[p.active]})
          </span>
        </div>
      </header>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="timeline-svg"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          p.onPlay(false);
          p.onCursor(toMs(e.clientX));
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) p.onCursor(toMs(e.clientX));
        }}
      >
        {/* Active-scenario elevation-above-terrain chart */}
        <text x={8} y={18} className="axis-title">
          Elevation above
        </text>
        <text x={8} y={32} className="axis-title">
          terrain ({LABELS[p.active]})
        </text>
        <text x={8} y={56} className="legend sun-c">
          ━ Sun
        </text>
        <text x={8} y={72} className="legend earth-c">
          ━ Earth
        </text>
        {[hi, 0, lo].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={cy(v)} y2={cy(v)} className={v === 0 ? 'grid zero' : 'grid'} />
            <text x={PAD.l - 6} y={cy(v) + 4} textAnchor="end" className="axis">
              {v}°
            </text>
          </g>
        ))}
        <path d={linePath((i) => at.earthEl[i] - at.earthHorizon[i])} className="line earth" />
        <path d={linePath((i) => at.sunEl[i] - at.sunHorizon[i])} className="line sun" />

        {ticks.map((d) => (
          <g key={d}>
            <line x1={x(d * DAY_MS)} x2={x(d * DAY_MS)} y1={CHART_H} y2={H - 4} className="grid" />
            <text x={x(d * DAY_MS)} y={CHART_H + 16} textAnchor="middle" className="axis">
              d{d}
            </text>
          </g>
        ))}

        {/* Per-scenario availability bands */}
        {tracks.map((tr, k) => {
          const y0 = CHART_H + 26 + k * ROW_H;
          const step = tr.times.length > 1 ? tr.times[1] - tr.times[0] : 1;
          const bw = (step / spanMs) * pw + 0.6;
          const sunRects: ReactElement[] = [];
          const earthRects: ReactElement[] = [];
          // Merge runs of equal state into rectangles.
          let i = 0;
          while (i < tr.times.length) {
            const f = tr.sunFrac[i];
            const lvl = f >= 0.99 ? 2 : f > 0.01 ? 1 : 0;
            let j = i;
            while (j + 1 < tr.times.length) {
              const g = tr.sunFrac[j + 1];
              if ((g >= 0.99 ? 2 : g > 0.01 ? 1 : 0) !== lvl) break;
              j++;
            }
            if (lvl)
              sunRects.push(
                <rect
                  key={i}
                  x={x(tr.times[i] - tr.times[0])}
                  y={y0}
                  width={x(tr.times[j] - tr.times[0]) - x(tr.times[i] - tr.times[0]) + bw}
                  height={15}
                  className={lvl === 2 ? 'band sun' : 'band sun partial'}
                />,
              );
            i = j + 1;
          }
          i = 0;
          while (i < tr.times.length) {
            const up = tr.earthUp[i];
            let j = i;
            while (j + 1 < tr.times.length && tr.earthUp[j + 1] === up) j++;
            if (up)
              earthRects.push(
                <rect
                  key={i}
                  x={x(tr.times[i] - tr.times[0])}
                  y={y0 + 17}
                  width={x(tr.times[j] - tr.times[0]) - x(tr.times[i] - tr.times[0]) + bw}
                  height={15}
                  className="band earth"
                />,
              );
            i = j + 1;
          }
          return (
            <g key={p.scenarios[k].id} onPointerDown={() => p.onActive(k)} className={k === p.active ? 'row active' : 'row'}>
              <rect x={0} y={y0 - 3} width={W} height={ROW_H - 2} className="row-bg" />
              <rect x={6} y={y0 + 4} width={18} height={18} rx={4} fill={COLORS[k]} />
              <text x={15} y={y0 + 17} textAnchor="middle" className="chip-text">
                {LABELS[k]}
              </text>
              <text x={30} y={y0 + 11} className="row-label">
                {shortName(p.scenarios[k].name)}
              </text>
              <text x={30} y={y0 + 27} className="row-sub">
                {new Date(tr.times[0]).toISOString().slice(0, 10)}
              </text>
              <rect x={PAD.l} y={y0} width={pw} height={15} className="band-bg" />
              <rect x={PAD.l} y={y0 + 17} width={pw} height={15} className="band-bg" />
              {sunRects}
              {earthRects}
            </g>
          );
        })}

        <line x1={x(p.cursorMs)} x2={x(p.cursorMs)} y1={4} y2={H - 4} className="cursor" />
      </svg>
      <p className="hint">
        Rows: <span className="sun-c">■ Sun up</span> (dim = partly hidden) and <span className="earth-c">■ Earth in view</span>.
        Drag anywhere to scrub; every scenario is aligned by time since its own start date.
      </p>
    </section>
  );
}

/** "IM-2 Athena — Mons Mouton" → "IM-2 Athena"; trimmed to fit the row label column. */
function shortName(name: string) {
  const n = name.split(' — ')[0].replace(/^Custom /, '');
  return n.length > 16 ? `${n.slice(0, 15)}…` : n;
}
