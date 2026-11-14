// Samples Sun and Earth visibility over a time window for one site, finds rise/set events and
// summarises the power and communication metrics shown in the comparison table.
import { AU_KM, type MoonFrame, SOLAR_CONSTANT, moonFrame, sunAndEarth } from './ephemeris.ts';
import { diskFraction, maskAt } from './horizon.ts';
import { norm } from './vec.ts';

const frameCache = new Map<number, MoonFrame>();
export function cachedFrame(t: number): MoonFrame {
  let f = frameCache.get(t);
  if (!f) {
    if (frameCache.size > 200_000) frameCache.clear();
    f = moonFrame(t);
    frameCache.set(t, f);
  }
  return f;
}

export interface SiteHorizon {
  lat: number;
  lon: number;
  /** Ground height above the 1737.4 km sphere (km). */
  groundHeightKm: number;
  /** Terrain horizon mask, deg per azimuth bin. */
  mask: Float32Array;
}

export interface SampleOptions {
  startMs: number;
  days: number;
  stepMin: number;
  mastM: number;
  /** Earth's centre must clear the horizon by this much for DTE comms (deg). */
  commsMarginDeg: number;
}

export type EventKind = 'sunrise' | 'sunset' | 'earthrise' | 'earthset';
export interface VisEvent {
  t: number;
  kind: EventKind;
}

export interface Track {
  times: Float64Array;
  sunAz: Float32Array;
  sunEl: Float32Array;
  sunHorizon: Float32Array;
  sunFrac: Float32Array;
  /** Incident flux on a vertical, sun-tracking panel (W/m²). */
  fluxVertical: Float32Array;
  /** Incident flux on a horizontal panel (W/m²). */
  fluxHorizontal: Float32Array;
  earthAz: Float32Array;
  earthEl: Float32Array;
  earthHorizon: Float32Array;
  earthUp: Uint8Array;
  earthPhase: Float32Array;
  events: VisEvent[];
  metrics: Metrics;
}

export interface Metrics {
  sunlitPct: number; // time-average fraction of the solar disk above terrain
  earthVisiblePct: number;
  bothPct: number; // Sun ≥ half visible AND Earth up
  longestNightH: number;
  longestDayH: number;
  meanFluxVertical: number;
  meanFluxHorizontal: number;
  maxSunEl: number;
  maxSunClearance: number; // max (sun elevation − terrain horizon)
  maxEarthEl: number;
  minEarthEl: number;
}

interface Instant {
  sunAz: number;
  sunEl: number;
  sunH: number;
  sunFrac: number;
  sunDist: number;
  earthAz: number;
  earthEl: number;
  earthH: number;
  earthR: number;
  earthPhase: number;
}

export function instant(site: SiteHorizon, mastM: number, t: number): Instant {
  const f = cachedFrame(t);
  const { sun, earth } = sunAndEarth(
    { lat: site.lat, lon: site.lon, heightKm: site.groundHeightKm + mastM / 1000 },
    f,
  );
  const sunH = maskAt(site.mask, sun.az);
  const earthH = maskAt(site.mask, earth.az);
  return {
    sunAz: sun.az,
    sunEl: sun.el,
    sunH,
    sunFrac: diskFraction(sun.el, sunH, sun.radiusDeg),
    sunDist: norm(f.sun),
    earthAz: earth.az,
    earthEl: earth.el,
    earthH,
    earthR: earth.radiusDeg,
    earthPhase: f.earthPhase,
  };
}

const sunUp = (x: Instant) => x.sunFrac >= 0.5;
const earthUpFn = (margin: number) => (x: Instant) => x.earthEl - x.earthH >= margin;

/** Bisect the moment a boolean condition flips between t0 and t1 (to ~20 s). */
function refine(site: SiteHorizon, mastM: number, t0: number, t1: number, pred: (x: Instant) => boolean) {
  const a = pred(instant(site, mastM, t0));
  let lo = t0;
  let hi = t1;
  while (hi - lo > 20_000) {
    // Use uncached frames for bisection points (they are one-off times).
    const mid = Math.round((lo + hi) / 2 / 1000) * 1000;
    if (pred(instant(site, mastM, mid)) === a) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

export function sampleTrack(site: SiteHorizon, o: SampleOptions): Track {
  const step = o.stepMin * 60_000;
  const n = Math.max(2, Math.floor((o.days * 86_400_000) / step) + 1);
  const tr: Track = {
    times: new Float64Array(n),
    sunAz: new Float32Array(n),
    sunEl: new Float32Array(n),
    sunHorizon: new Float32Array(n),
    sunFrac: new Float32Array(n),
    fluxVertical: new Float32Array(n),
    fluxHorizontal: new Float32Array(n),
    earthAz: new Float32Array(n),
    earthEl: new Float32Array(n),
    earthHorizon: new Float32Array(n),
    earthUp: new Uint8Array(n),
    earthPhase: new Float32Array(n),
    events: [],
    metrics: undefined as unknown as Metrics,
  };
  const earthUp = earthUpFn(o.commsMarginDeg);
  let sumFrac = 0, earthN = 0, bothN = 0, sumFV = 0, sumFH = 0;
  let maxSunEl = -90, maxClear = -90, maxEarthEl = -90, minEarthEl = 90;
  let run = 0, longestNight = 0, longestDay = 0;
  let prev: Instant | null = null;

  for (let i = 0; i < n; i++) {
    const t = o.startMs + i * step;
    const x = instant(site, o.mastM, t);
    const flux = SOLAR_CONSTANT * (AU_KM / x.sunDist) ** 2 * x.sunFrac;
    tr.times[i] = t;
    tr.sunAz[i] = x.sunAz;
    tr.sunEl[i] = x.sunEl;
    tr.sunHorizon[i] = x.sunH;
    tr.sunFrac[i] = x.sunFrac;
    tr.fluxVertical[i] = flux * Math.max(0, Math.cos((x.sunEl * Math.PI) / 180));
    tr.fluxHorizontal[i] = flux * Math.max(0, Math.sin((x.sunEl * Math.PI) / 180));
    tr.earthAz[i] = x.earthAz;
    tr.earthEl[i] = x.earthEl;
    tr.earthHorizon[i] = x.earthH;
    const eu = earthUp(x);
    tr.earthUp[i] = eu ? 1 : 0;
    tr.earthPhase[i] = x.earthPhase;

    sumFrac += x.sunFrac;
    sumFV += tr.fluxVertical[i];
    sumFH += tr.fluxHorizontal[i];
    if (eu) earthN++;
    if (eu && sunUp(x)) bothN++;
    maxSunEl = Math.max(maxSunEl, x.sunEl);
    maxClear = Math.max(maxClear, x.sunEl - x.sunH);
    maxEarthEl = Math.max(maxEarthEl, x.earthEl);
    minEarthEl = Math.min(minEarthEl, x.earthEl);

    if (prev) {
      const t0 = t - step;
      if (sunUp(prev) !== sunUp(x)) {
        tr.events.push({ t: refine(site, o.mastM, t0, t, sunUp), kind: sunUp(x) ? 'sunrise' : 'sunset' });
      }
      if (earthUp(prev) !== eu) {
        tr.events.push({ t: refine(site, o.mastM, t0, t, earthUp), kind: eu ? 'earthrise' : 'earthset' });
      }
      if (sunUp(prev) === sunUp(x)) run += step;
      else run = step;
    } else run = step;
    if (sunUp(x)) longestDay = Math.max(longestDay, run);
    else longestNight = Math.max(longestNight, run);
    prev = x;
  }
  tr.events.sort((a, b) => a.t - b.t);
  tr.metrics = {
    sunlitPct: (100 * sumFrac) / n,
    earthVisiblePct: (100 * earthN) / n,
    bothPct: (100 * bothN) / n,
    longestNightH: longestNight / 3_600_000,
    longestDayH: longestDay / 3_600_000,
    meanFluxVertical: sumFV / n,
    meanFluxHorizontal: sumFH / n,
    maxSunEl,
    maxSunClearance: maxClear,
    maxEarthEl,
    minEarthEl,
  };
  return tr;
}

/** Index of the sample nearest to time t. */
export function indexAt(track: Track, t: number): number {
  const { times } = track;
  if (times.length < 2) return 0;
  const step = times[1] - times[0];
  return Math.max(0, Math.min(times.length - 1, Math.round((t - times[0]) / step)));
}

export function nextEvent(track: Track, t: number, kinds: EventKind[]): VisEvent | undefined {
  return track.events.find((e) => e.t > t && kinds.includes(e.kind));
}
