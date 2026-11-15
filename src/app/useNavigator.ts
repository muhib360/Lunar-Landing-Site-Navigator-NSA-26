// All app state in one hook: scenarios, settings, time cursor, terrain horizons, tracks.
// UI components stay simple: they read from this and call its setters.
import { useEffect, useRef, useState } from 'react';
import type { Candidate } from '../core/search.ts';
import { type SiteHorizon, type Track, sampleTrack } from '../core/timeline.ts';
import {
  DAY_MS,
  DEFAULT_SETTINGS,
  type Scenario,
  type Settings,
  decodeState,
  defaultScenarios,
  encodeState,
} from './state.ts';
import { computeSiteHorizon, horizonKey, precomputedHorizon, sphereHorizon } from './terrain.ts';

const trackCache = new Map<string, Track>();

function initialState() {
  const fromUrl = decodeState(window.location.hash);
  if (fromUrl) return fromUrl;
  return { scenarios: defaultScenarios(), settings: DEFAULT_SETTINGS, active: 0 };
}

export function useNavigator() {
  const [init] = useState(initialState);
  const [scenarios, setScenarios] = useState<Scenario[]>(init.scenarios);
  const [settings, setSettings] = useState<Settings>(init.settings);
  const [active, setActive] = useState(init.active);
  const [cursorMs, setCursorMs] = useState(15 * DAY_MS);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [computed, setComputed] = useState<Record<string, SiteHorizon>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const pending = useRef(new Set<string>());
  const [search, setSearch] = useState<{ forId: string; list: Candidate[] } | null>(null);

  const activeIdx = Math.min(active, scenarios.length - 1);
  const mast = settings.mastM;

  // Terrain horizon for every scenario: computed > precomputed > smooth sphere (while loading).
  const resolved = scenarios.map((s) => {
    const key = horizonKey(s.lat, s.lon, mast);
    const h = computed[key] ?? precomputedHorizon(s.siteId, s.lat, s.lon, mast);
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

  // Tracks are cached by everything that affects them, so rebuilding the list each render is cheap.
  const tracks: Track[] = resolved.map((r, i) => {
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

  // Play animation.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
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

  const act = scenarios[activeIdx];
  const updateActive = (fn: (s: Scenario) => Scenario) =>
    setScenarios((list) => list.map((s, i) => (i === activeIdx ? fn(s) : s)));

  return {
    scenarios,
    setScenarios,
    settings,
    setSettings,
    active: activeIdx,
    setActive,
    act,
    updateActive,
    cursor,
    setCursor: setCursorMs,
    playing,
    setPlaying,
    speed,
    setSpeed,
    tracks,
    horizons: resolved.map((r) => r.horizon),
    terrainReady: resolved.map((r) => r.terrain),
    status,
    candidates: search?.forId === act.id ? search.list : null,
    setCandidates: (list: Candidate[] | null) => setSearch(list ? { forId: act.id, list } : null),
    timeMs: act.startMs + cursorMs,
  };
}
