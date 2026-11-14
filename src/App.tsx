import { useEffect, useRef, useState } from 'react';
import {
  COLORS,
  DAY_MS,
  DEFAULT_SETTINGS,
  LABELS,
  type Scenario,
  type Settings,
  customScenario,
  decodeState,
  defaultScenarios,
  encodeState,
  scenarioFromSite,
} from './app/state.ts';
import { computeSiteHorizon, horizonKey, precomputedHorizon, sphereHorizon } from './app/terrain.ts';
import { type SiteHorizon, type Track, sampleTrack } from './core/timeline.ts';
import type { Candidate } from './core/search.ts';
import { CompareTable } from './components/CompareTable.tsx';
import { NearbySearch } from './components/NearbySearch.tsx';
import { Explainers } from './components/Explainers.tsx';
import { ScenarioPanel } from './components/ScenarioPanel.tsx';
import { SiteMap } from './components/SiteMap.tsx';
import { SkyPanorama } from './components/SkyPanorama.tsx';
import { Timeline } from './components/Timeline.tsx';

const trackCache = new Map<string, Track>();

function initialState() {
  const fromUrl = decodeState(window.location.hash);
  if (fromUrl) return fromUrl;
  return { scenarios: defaultScenarios(), settings: DEFAULT_SETTINGS, active: 0 };
}

export default function App() {
  const [init] = useState(initialState);
  const [scenarios, setScenarios] = useState<Scenario[]>(init.scenarios);
  const [settings, setSettings] = useState<Settings>(init.settings);
  const [active, setActive] = useState(init.active);
  const [cursorMs, setCursorMs] = useState(0.5 * DAY_MS);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [computed, setComputed] = useState<Record<string, SiteHorizon>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const pending = useRef(new Set<string>());
  const [search, setSearch] = useState<{ forId: string; list: Candidate[] } | null>(null);

  const activeIdx = Math.min(active, scenarios.length - 1);
  const mast = settings.mastM;

  // Resolve a terrain horizon for every scenario: computed > precomputed > smooth sphere.
  const resolved = scenarios.map((s) => {
    const key = horizonKey(s.lat, s.lon, mast);
    const pre = precomputedHorizon(s.siteId, s.lat, s.lon, mast);
    const h = computed[key] ?? pre;
    return { key, horizon: h ?? sphereHorizon(s.lat, s.lon, mast), terrain: !!h };
  });

  useEffect(() => {
    for (const s of scenarios) {
      const key = horizonKey(s.lat, s.lon, mast);
      if (computed[key] || failed[key] || pending.current.has(key)) continue;
      if (precomputedHorizon(s.siteId, s.lat, s.lon, mast)) continue;
      pending.current.add(key);
      computeSiteHorizon(s.lat, s.lon, mast)
        .then((h) => setComputed((c) => ({ ...c, [key]: h })))
        .catch((err: Error) => setFailed((f) => ({ ...f, [key]: err.message })))
        .finally(() => pending.current.delete(key));
    }
  }, [scenarios, mast, computed, failed]);

  const status: Record<string, string> = {};
  scenarios.forEach((s, i) => {
    const r = resolved[i];
    if (failed[r.key]) status[s.id] = 'terrain unavailable — smooth sphere';
    else if (!r.terrain) status[s.id] = 'loading LOLA terrain…';
  });

  // Tracks are cached by everything that affects them, so recomputing the list each render is cheap.
  const tracks = resolved.map((r, i) => {
    const s = scenarios[i];
    const k = `${r.key}|${r.terrain ? 't' : 's'}|${s.startMs}|${settings.days}|${settings.stepMin}|${settings.commsMarginDeg}`;
    let tr = trackCache.get(k);
    if (!tr) {
      tr = sampleTrack(r.horizon, {
        startMs: s.startMs,
        days: settings.days,
        stepMin: settings.stepMin,
        mastM: mast,
        commsMarginDeg: settings.commsMarginDeg,
      });
      if (trackCache.size > 60) trackCache.clear();
      trackCache.set(k, tr);
    }
    return tr;
  });
  const cursor = Math.min(cursorMs, settings.days * DAY_MS);

  // Animation.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCursorMs((c) => {
        const n = c + dt * speed * DAY_MS;
        return n > settings.days * DAY_MS ? 0 : n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, settings.days]);

  // Shareable URL.
  useEffect(() => {
    const h = `#s=${encodeState(scenarios, settings, activeIdx)}`;
    if (window.location.hash !== h) history.replaceState(null, '', h);
  }, [scenarios, settings, activeIdx]);

  const at = tracks[activeIdx];
  const idx = Math.max(0, Math.min(at.times.length - 1, Math.round(cursor / (settings.stepMin * 60_000))));
  const act = scenarios[activeIdx];

  const setActiveScenario = (fn: (s: Scenario) => Scenario) =>
    setScenarios((list) => list.map((s, i) => (i === activeIdx ? fn(s) : s)));
  const candidates = search?.forId === act.id ? search.list : null;

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Lunar Landing Site Navigator</h1>
          <p className="tagline">
            Where are the Sun and Earth from a landing site, and for how long? Compare sites and dates in seconds.
          </p>
        </div>
        <div className="badges">
          <span className="badge" title="scripts/validate-ephemeris.ts: worst case 12 arcseconds over one year, four sites">
            Ephemeris validated vs JPL Horizons (≤ 0.004°)
          </span>
          <span className="badge">Terrain: LRO LOLA</span>
          <button
            className="badge btn"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
            }}
            title="Copy a link that reopens these exact scenarios"
          >
            Copy share link
          </button>
        </div>
      </header>
      <div className="layout">
        <ScenarioPanel
          scenarios={scenarios}
          active={activeIdx}
          settings={settings}
          status={status}
          onActive={setActive}
          onChange={setScenarios}
          onSettings={setSettings}
        />
        <main>
          <div className="row2">
            <SkyPanorama
              track={at}
              horizon={resolved[activeIdx].horizon}
              index={idx}
              color={COLORS[activeIdx]}
              label={LABELS[activeIdx]}
              title={act.name}
            />
            <div className="col">
              <SiteMap
                scenarios={scenarios}
                active={activeIdx}
                candidates={candidates}
                onPick={(lat, lon) => setActiveScenario((s) => customScenario(lat, lon, s.startMs, s.id))}
                onPickSite={(id) => setActiveScenario((s) => ({ ...scenarioFromSite(id, s.startMs), id: s.id }))}
              />
              <NearbySearch
                scenario={act}
                activeIndex={activeIdx}
                scenarioCount={scenarios.length}
                settings={settings}
                results={candidates}
                onResults={(list) => setSearch(list ? { forId: act.id, list } : null)}
                onUse={(lat, lon) => setActiveScenario((s) => customScenario(lat, lon, s.startMs, s.id))}
                onAdd={(lat, lon) => {
                  setScenarios((list) => [...list, customScenario(lat, lon, act.startMs)]);
                  setActive(scenarios.length);
                }}
              />
            </div>
          </div>
          <Timeline
            scenarios={scenarios}
            tracks={tracks}
            active={activeIdx}
            days={settings.days}
            cursorMs={cursor}
            playing={playing}
            speed={speed}
            onCursor={setCursorMs}
            onActive={setActive}
            onPlay={setPlaying}
            onSpeed={setSpeed}
          />
          <CompareTable
            scenarios={scenarios}
            tracks={tracks}
            cursorMs={cursor}
            days={settings.days}
            active={activeIdx}
            onActive={setActive}
          />
          <Explainers scenario={act} track={at} horizon={resolved[activeIdx].horizon} />
        </main>
      </div>
      <footer>
        Ephemeris: <a href="https://github.com/cosinekitty/astronomy">Astronomy Engine</a> (IAU 2015 lunar orientation),
        checked against <a href="https://ssd.jpl.nasa.gov/horizons/">JPL Horizons</a>. Terrain:{' '}
        <a href="https://imbrium.mit.edu/DATA/LOLA_GDR/">LRO LOLA</a> LDEM_75S_240M and LDEM_16. Landing sites: NASA NSSDC
        and published sources. Horizon masks assume an observer {settings.mastM} m above the ground. Built for the NASA Space
        Apps Challenge 2026.
      </footer>
    </div>
  );
}
