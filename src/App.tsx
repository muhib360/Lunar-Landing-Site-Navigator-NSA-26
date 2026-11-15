import { Suspense, lazy, useMemo, useState } from 'react';
import { COLORS, DAY_MS, LABELS, customScenario, scenarioFromSite } from './app/state.ts';
import { useNavigator } from './app/useNavigator.ts';
import { SITES } from './core/sites.ts';
import type { CameraMode, GlobePin } from './globe/MoonGlobe.tsx';
import { Compare } from './modes/Compare.tsx';
import { Explore } from './modes/Explore.tsx';
import { Expert } from './modes/Expert.tsx';
import { nowStatus } from './ui/ratings.ts';
import { TimeBar } from './ui/TimeBar.tsx';
import { STEPS, Tour, type TourApi } from './ui/Tour.tsx';

// The 3D engine is ~1.5 MB (gzipped): load it after the panels so the app is usable at once.
const MoonGlobe = lazy(() => import('./globe/MoonGlobe.tsx').then((m) => ({ default: m.MoonGlobe })));

type Mode = 'explore' | 'compare' | 'expert';
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'explore', label: 'Explore', hint: 'One site, plain answers' },
  { id: 'compare', label: 'Compare', hint: 'Sites and dates side by side' },
  { id: 'expert', label: 'Expert', hint: 'Full charts and numbers' },
];

export default function App() {
  const nav = useNavigator();
  const [mode, setMode] = useState<Mode>('explore');
  const [camera, setCamera] = useState<CameraMode>('orbit');
  const [look, setLook] = useState({ az: 0, n: 0 });
  const lookAt = (az: number) => setLook((l) => ({ az, n: l.n + 1 }));
  const [tourStep, setTourStep] = useState<number | null>(() => (localStorageGet('tourDone') ? null : 0));
  const [overviewKey, setOverviewKey] = useState(0);
  const [globeReady, setGlobeReady] = useState(false);

  const { act, tracks, active, scenarios, settings } = nav;
  const track = tracks[active];
  const now = nowStatus(track, nav.timeMs);

  const enterSurface = () => {
    lookAt(now.sunUp ? now.sunAz : now.earthAz);
    setCamera('surface');
  };

  // Pins on the globe: catalog sites, the scenario markers, nearby-search results.
  const pins = useMemo<GlobePin[]>(() => {
    const out: GlobePin[] = SITES.map((s) => ({
      id: `site:${s.id}`,
      lat: s.lat,
      lon: s.lon,
      label: s.name.split(' — ')[0],
      color: '#e9edf5',
      kind: 'site',
    }));
    const shown = mode === 'explore' ? [active] : scenarios.map((_, i) => i);
    for (const i of shown)
      out.push({ id: `scn:${i}`, lat: scenarios[i].lat, lon: scenarios[i].lon, label: LABELS[i], color: COLORS[i], kind: 'scenario' });
    if (nav.candidates) {
      const sc = nav.candidates.map((c) => c.score);
      const lo = Math.min(...sc), hi = Math.max(...sc);
      nav.candidates.forEach((c, i) => {
        const f = hi > lo ? (c.score - lo) / (hi - lo) : 1;
        out.push({ id: `cand:${i}`, lat: c.lat, lon: c.lon, label: '', color: `hsl(${20 + 30 * f}, 100%, ${20 + 50 * f}%)`, kind: 'candidate', size: i === 0 ? 11 : 7 });
      });
    }
    return out;
  }, [scenarios, mode, active, nav.candidates]);

  const pickPin = (id: string) => {
    if (id.startsWith('site:')) nav.updateActive((s) => ({ ...scenarioFromSite(id.slice(5), s.startMs), id: s.id }));
    else if (id.startsWith('scn:')) nav.setActive(+id.slice(4));
    else if (id.startsWith('cand:') && nav.candidates) {
      const c = nav.candidates[+id.slice(5)];
      nav.updateActive((s) => customScenario(+c.lat.toFixed(4), +c.lon.toFixed(4), s.startMs, s.id));
    }
  };

  const tourApi: TourApi = {
    selectSite: (id) => nav.updateActive((s) => ({ ...scenarioFromSite(id, s.startMs), id: s.id })),
    setCamera: (m) => (m === 'surface' ? enterSurface() : setCamera('orbit')),
    setDay: (d) => nav.setCursor(d * DAY_MS),
    play: nav.setPlaying,
    overview: () => {
      setCamera('orbit');
      setOverviewKey((k) => k + 1);
    },
  };
  const goStep = (n: number | null) => {
    setTourStep(n);
    if (n === null) {
      localStorageSet('tourDone', '1');
      return;
    }
    if (mode === 'expert') setMode('explore');
    STEPS[n]?.run?.(tourApi);
  };

  return (
    <div className={`shell mode-${mode} cam-${camera}`}>
      <Suspense fallback={null}>
        <MoonGlobe
        onReady={() => setGlobeReady(true)}
        timeMs={nav.timeMs}
        pins={pins}
        focus={{ lat: act.lat, lon: act.lon, key: `${act.id}:${act.lat}:${act.lon}:${overviewKey}` }}
        mode={camera}
        surface={{ lat: act.lat, lon: act.lon, lookAz: look.az, key: `${act.lat}:${act.lon}:${look.n}` }}
        onPickPin={pickPin}
        onPickPoint={(lat, lon) => nav.updateActive((s) => customScenario(+lat.toFixed(4), +lon.toFixed(4), s.startMs, s.id))}
        />
      </Suspense>
      {!globeReady && (
        <div className="globe-loading" aria-live="polite">
          <div className="moon-spinner" />
          <span>Loading the Moon…</span>
        </div>
      )}

      <header className="topbar glass">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◐
          </span>
          <div>
            <h1>Lunar Landing Site Navigator</h1>
            <p>Will there be sunlight, and can we call Earth?</p>
          </div>
        </div>
        <nav className="modes" aria-label="Detail level">
          {MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)} title={m.hint}>
              {m.label}
              <small>{m.hint}</small>
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button className="btn" onClick={() => goStep(0)}>
            Take the tour
          </button>
          <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(location.href)} title="Copy a link to exactly this view">
            Share
          </button>
        </div>
      </header>

      {mode !== 'expert' && (
        <aside className="side glass">
          {mode === 'explore' ? (
            <Explore
              scenario={act}
              track={track}
              timeMs={nav.timeMs}
              days={settings.days}
              terrainReady={nav.terrainReady[active]}
              onPickSite={tourApi.selectSite}
              onStart={(ms) => nav.updateActive((s) => ({ ...s, startMs: ms }))}
            />
          ) : (
            <Compare
              scenarios={scenarios}
              tracks={tracks}
              active={active}
              settings={settings}
              candidates={nav.candidates}
              onActive={nav.setActive}
              onScenarios={nav.setScenarios}
              onResults={nav.setCandidates}
            />
          )}
          <p className="credits">
            Data: NASA LRO — LOLA terrain, LROC imagery (CGI Moon Kit). Sun/Earth positions checked against NASA JPL
            Horizons. Globe: CesiumJS.
          </p>
        </aside>
      )}

      {mode === 'expert' && (
        <section className="expert-sheet glass">
          <Expert
            scenarios={scenarios}
            tracks={tracks}
            horizons={nav.horizons}
            active={active}
            settings={settings}
            status={nav.status}
            cursorMs={nav.cursor}
            playing={nav.playing}
            speed={nav.speed}
            onActive={nav.setActive}
            onScenarios={nav.setScenarios}
            onSettings={nav.setSettings}
            onCursor={nav.setCursor}
            onPlay={nav.setPlaying}
            onSpeed={nav.setSpeed}
          />
        </section>
      )}

      {mode !== 'expert' && (
        <div className="view-controls">
          {camera === 'orbit' ? (
            <button className="big-btn primary" onClick={enterSurface}>
              <span aria-hidden>🧑‍🚀</span> Stand here
            </button>
          ) : (
            <>
              <div className="hud glass">
                <span className={now.sunUp ? 'on sun' : 'off'}>☀ {now.sunUp ? 'Sun up' : 'Sun hidden'}</span>
                <span className={now.earthUp ? 'on earth' : 'off'}>◐ {now.earthUp ? 'Earth in view' : 'No Earth'}</span>
                <span className="muted">Drag to look around</span>
              </div>
              <button className="big-btn" onClick={() => setCamera('orbit')}>
                <span aria-hidden>🛰️</span> Back to orbit
              </button>
              <div className="look-buttons">
                <button className="btn" onClick={() => lookAt(now.sunAz)}>
                  Look at Sun
                </button>
                <button className="btn" onClick={() => lookAt(now.earthAz)}>
                  Look at Earth
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {mode !== 'expert' && (
        <TimeBar
          track={track}
          cursorMs={nav.cursor}
          days={settings.days}
          playing={nav.playing}
          speed={nav.speed}
          onCursor={nav.setCursor}
          onPlay={nav.setPlaying}
          onSpeed={nav.setSpeed}
        />
      )}

      {tourStep !== null && mode !== 'expert' && <Tour step={tourStep} onStep={goStep} />}
    </div>
  );
}

function localStorageGet(k: string) {
  try {
    return localStorage.getItem(`llsn:${k}`);
  } catch {
    return null;
  }
}
function localStorageSet(k: string, v: string) {
  try {
    localStorage.setItem(`llsn:${k}`, v);
  } catch {
    /* private mode: ignore */
  }
}
