import { COLORS, LABELS, type Scenario, fmtDuration, fmtLat, fmtLon, fmtUtc } from '../app/state.ts';
import { type Track, indexAt, nextEvent } from '../core/timeline.ts';

interface Props {
  scenarios: Scenario[];
  tracks: Track[];
  cursorMs: number;
  days: number;
  active: number;
  onActive: (i: number) => void;
}

type Better = 'max' | 'min' | null;
interface Row {
  label: string;
  hint?: string;
  values: (number | string)[];
  fmt?: (v: number) => string;
  better?: Better;
  section?: string;
}

const pct = (v: number) => `${v.toFixed(1)}%`;
const deg = (v: number) => `${v.toFixed(2)}°`;

export function CompareTable({ scenarios, tracks, cursorMs, days, active, onActive }: Props) {
  const now = tracks.map((tr) => {
    const t = tr.times[0] + cursorMs;
    const i = indexAt(tr, t);
    const sunUp = tr.sunFrac[i] >= 0.5;
    const earthUp = tr.earthUp[i] === 1;
    const sunEv = nextEvent(tr, t, [sunUp ? 'sunset' : 'sunrise']);
    const earthEv = nextEvent(tr, t, [earthUp ? 'earthset' : 'earthrise']);
    return { t, i, sunUp, earthUp, sunEv, earthEv };
  });

  const rows: Row[] = [
    { section: 'At the cursor time', label: 'Time', values: now.map((n) => fmtUtc(n.t)) },
    {
      label: 'Sun',
      values: now.map((n, k) => {
        const f = tracks[k].sunFrac[n.i];
        return f >= 0.99 ? 'Up' : f > 0.01 ? `Partial (${Math.round(f * 100)}%)` : 'Down';
      }),
    },
    {
      label: 'Sun above terrain',
      hint: 'Sun elevation minus terrain-horizon elevation in the Sun’s direction',
      values: now.map((n, k) => tracks[k].sunEl[n.i] - tracks[k].sunHorizon[n.i]),
      fmt: deg,
      better: 'max',
    },
    {
      label: 'Solar elevation',
      hint: 'Angle of the Sun above the local horizontal plane — drives panel output',
      values: now.map((n, k) => tracks[k].sunEl[n.i]),
      fmt: deg,
      better: 'max',
    },
    {
      label: 'Next sunset / sunrise',
      values: now.map((n) =>
        n.sunEv ? `${n.sunEv.kind === 'sunset' ? '↓ set' : '↑ rise'} in ${fmtDuration(n.sunEv.t - n.t)}` : n.sunUp ? 'No sunset in window' : 'No sunrise in window',
      ),
    },
    {
      label: 'Earth',
      values: now.map((n) => (n.earthUp ? 'In view' : 'Hidden')),
    },
    {
      label: 'Earth above terrain',
      values: now.map((n, k) => tracks[k].earthEl[n.i] - tracks[k].earthHorizon[n.i]),
      fmt: deg,
      better: 'max',
    },
    {
      label: 'Next Earthset / Earthrise',
      values: now.map((n) =>
        n.earthEv
          ? `${n.earthEv.kind === 'earthset' ? '↓ set' : '↑ rise'} in ${fmtDuration(n.earthEv.t - n.t)}`
          : n.earthUp ? 'No Earthset in window' : 'Never rises in window',
      ),
    },
    {
      label: 'Power, vertical array',
      hint: 'Sunlight on a vertical, sun-tracking solar array (W/m²)',
      values: now.map((n, k) => tracks[k].fluxVertical[n.i]),
      fmt: (v) => `${v.toFixed(0)} W/m²`,
      better: 'max',
    },

    { section: `Over the ${days}-day window`, label: 'Sunlight', hint: 'Time-averaged fraction of the solar disk above terrain', values: tracks.map((t) => t.metrics.sunlitPct), fmt: pct, better: 'max' },
    { label: 'Earth in view (DTE comms)', values: tracks.map((t) => t.metrics.earthVisiblePct), fmt: pct, better: 'max' },
    { label: 'Sun AND Earth', hint: 'Power and direct-to-Earth comms at the same time', values: tracks.map((t) => t.metrics.bothPct), fmt: pct, better: 'max' },
    { label: 'Longest night', hint: 'Longest continuous darkness: drives battery and heater sizing', values: tracks.map((t) => t.metrics.longestNightH), fmt: (v) => fmtDuration(v * 3_600_000), better: 'min' },
    { label: 'Longest day', values: tracks.map((t) => t.metrics.longestDayH), fmt: (v) => fmtDuration(v * 3_600_000), better: 'max' },
    { label: 'Mean power, vertical array', values: tracks.map((t) => t.metrics.meanFluxVertical), fmt: (v) => `${v.toFixed(0)} W/m²`, better: 'max' },
    { label: 'Mean power, horizontal panel', values: tracks.map((t) => t.metrics.meanFluxHorizontal), fmt: (v) => `${v.toFixed(0)} W/m²`, better: 'max' },
    { label: 'Max solar elevation', values: tracks.map((t) => t.metrics.maxSunEl), fmt: deg },
    { label: 'Earth elevation range', values: tracks.map((t) => `${t.metrics.minEarthEl.toFixed(1)}° … ${t.metrics.maxEarthEl.toFixed(1)}°`) },
  ];

  return (
    <section className="panel compare">
      <header className="panel-head">
        <h2>Comparison</h2>
        <span className="muted">Best value in each row is highlighted.</span>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th />
              {scenarios.map((s, k) => (
                <th key={s.id} className={k === active ? 'active' : ''} onClick={() => onActive(k)}>
                  <span className="chip" style={{ background: COLORS[k] }}>{LABELS[k]}</span>
                  <div className="th-name">{s.name}</div>
                  <div className="muted">
                    {fmtLat(s.lat)} {fmtLon(s.lon)}
                  </div>
                  <div className="muted">from {fmtUtc(s.startMs).slice(0, 10)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const nums = r.values.filter((v): v is number => typeof v === 'number');
              const best = r.better && nums.length > 1 ? (r.better === 'max' ? Math.max(...nums) : Math.min(...nums)) : null;
              const allSame = nums.length > 1 && nums.every((v) => Math.abs(v - nums[0]) < 1e-6);
              return [
                r.section ? (
                  <tr key={`${r.label}-s`} className="section">
                    <td colSpan={scenarios.length + 1}>{r.section}</td>
                  </tr>
                ) : null,
                <tr key={r.label}>
                  <th title={r.hint}>
                    {r.label}
                    {r.hint ? <span className="q">?</span> : null}
                  </th>
                  {r.values.map((v, k) => (
                    <td key={k} className={best !== null && !allSame && v === best ? 'best' : ''}>
                      {typeof v === 'number' ? (r.fmt ? r.fmt(v) : v.toFixed(2)) : v}
                    </td>
                  ))}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
