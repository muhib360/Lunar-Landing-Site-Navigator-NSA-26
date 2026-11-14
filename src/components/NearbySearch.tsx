import { useEffect, useRef, useState } from 'react';
import { dataUrl } from '../app/demLoader.ts';
import type { SearchMessage, SearchRequest } from '../app/search.worker.ts';
import { LABELS, MAX_SCENARIOS, type Scenario, type Settings, fmtDuration, fmtLat, fmtLon } from '../app/state.ts';
import type { Candidate, Objective } from '../core/search.ts';

interface Props {
  scenario: Scenario;
  activeIndex: number;
  scenarioCount: number;
  settings: Settings;
  results: Candidate[] | null;
  onResults: (c: Candidate[] | null) => void;
  onUse: (lat: number, lon: number) => void;
  onAdd: (lat: number, lon: number) => void;
}

const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: 'sun', label: 'Most sunlight' },
  { id: 'both', label: 'Sun + Earth' },
  { id: 'night', label: 'Shortest night' },
];
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (b: number) => COMPASS[Math.round(b / 45) % 8];

export function NearbySearch(p: Props) {
  const [radius, setRadius] = useState(5);
  const [objective, setObjective] = useState<Objective>('sun');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);
  const worker = useRef<Worker | null>(null);
  const onResults = useRef(p.onResults);
  useEffect(() => {
    onResults.current = p.onResults;
  });
  useEffect(() => () => worker.current?.terminate(), []);

  const start = () => {
    const id = ++run.current;
    setError(null);
    p.onResults(null);
    setProgress(0);
    if (worker.current && progress !== null) {
      worker.current.terminate();
      worker.current = null;
    }
    if (!worker.current) {
      worker.current = new Worker(new URL('../app/search.worker.ts', import.meta.url), { type: 'module' });
      worker.current.onmessage = (e: MessageEvent<SearchMessage>) => {
        const m = e.data;
        if (m.id !== run.current) return;
        if ('progress' in m) setProgress(m.progress);
        else if ('done' in m) {
          onResults.current(m.done);
          setProgress(null);
        } else {
          setError(m.error);
          setProgress(null);
        }
      };
    }
    const s = p.scenario;
    const req: SearchRequest = {
      id,
      dataUrl: dataUrl(),
      lat: s.lat,
      lon: s.lon,
      opts: {
        radiusKm: radius,
        spacingKm: radius / 6,
        startMs: s.startMs,
        days: p.settings.days,
        mastM: p.settings.mastM,
        commsMarginDeg: p.settings.commsMarginDeg,
        objective,
      },
    };
    worker.current.postMessage(req);
  };
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    run.current++;
    setProgress(null);
  };

  const here = p.results?.find((c) => c.distKm === 0);
  const top = p.results?.slice(0, 5) ?? [];
  const fmtScore = (c: Candidate) =>
    objective === 'night' ? fmtDuration(c.longestNightH * 3_600_000) : `${c.score.toFixed(1)}%`;

  return (
    <section className="panel nearby">
      <header className="panel-head">
        <h2>Better spot nearby?</h2>
      </header>
      <p className="hint" style={{ marginTop: 0 }}>
        Scores a grid of points around scenario {LABELS[p.activeIndex]} over its {p.settings.days}-day window, using LOLA
        terrain. Useful when a slip in the schedule makes the planned point dark.
      </p>
      <div className="toggles">
        <span>Radius</span>
        {[2, 5, 10, 20].map((r) => (
          <button key={r} className={radius === r ? 'on' : ''} onClick={() => setRadius(r)}>
            {r} km
          </button>
        ))}
      </div>
      <div className="toggles" style={{ marginTop: 6 }}>
        <span>Goal</span>
        {OBJECTIVES.map((o) => (
          <button key={o.id} className={objective === o.id ? 'on' : ''} onClick={() => setObjective(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="search-run">
        {progress === null ? (
          <button className="primary" onClick={start}>
            Search around {LABELS[p.activeIndex]}
          </button>
        ) : (
          <>
            <button onClick={cancel}>Cancel</button>
            <div className="progress">
              <div style={{ width: `${(progress * 100).toFixed(0)}%` }} />
            </div>
          </>
        )}
        {p.results && (
          <button className="link" onClick={() => p.onResults(null)}>
            clear
          </button>
        )}
      </div>
      {error && <p className="note">Search failed: {error}</p>}
      {p.results && (
        <table className="cand">
          <thead>
            <tr>
              <th>Where</th>
              <th>Score</th>
              <th>Sun</th>
              <th>Earth</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {here && (
              <tr className="here">
                <td>Search centre</td>
                <td>{fmtScore(here)}</td>
                <td>{here.sunlitPct.toFixed(0)}%</td>
                <td>{here.earthPct.toFixed(0)}%</td>
                <td />
              </tr>
            )}
            {top.map((c, k) => (
              <tr key={k}>
                <td title={`${fmtLat(c.lat)} ${fmtLon(c.lon)}, ground ${c.groundKm.toFixed(2)} km`}>
                  {c.distKm === 0 ? 'Search centre' : `${c.distKm.toFixed(1)} km ${compass(c.bearingDeg)}`}
                </td>
                <td className={here && c.score > here.score ? 'best' : ''}>{fmtScore(c)}</td>
                <td>{c.sunlitPct.toFixed(0)}%</td>
                <td>{c.earthPct.toFixed(0)}%</td>
                <td className="cand-actions">
                  <button className="link" onClick={() => p.onUse(c.lat, c.lon)}>
                    move {LABELS[p.activeIndex]}
                  </button>
                  {p.scenarioCount < MAX_SCENARIOS && (
                    <button className="link" onClick={() => p.onAdd(c.lat, c.lon)}>
                      + new
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {p.results && (
        <p className="hint">
          Quick estimate (2° horizon bins, hourly sampling). Moving the scenario re-runs the full-resolution analysis. Dots
          on the map show every point tested (brighter = better).
        </p>
      )}
    </section>
  );
}
