// "Is there a better spot nearby?" — scores a grid of points around a site by sunlight and
// Earth visibility over the scenario's time window, using fast low-resolution horizon masks.
import { type Dem, computeHorizon } from './dem.ts';
import { MOON_RADIUS_KM } from './ephemeris.ts';
import { sampleTrack } from './timeline.ts';
import { DEG, RAD, type Vec3, enuBasis } from './vec.ts';

export type Objective = 'sun' | 'both' | 'night';

export interface Candidate {
  lat: number;
  lon: number;
  distKm: number;
  bearingDeg: number;
  groundKm: number;
  sunlitPct: number;
  earthPct: number;
  bothPct: number;
  longestNightH: number;
  score: number;
}

export interface SearchOptions {
  radiusKm: number;
  spacingKm: number;
  startMs: number;
  days: number;
  mastM: number;
  commsMarginDeg: number;
  objective: Objective;
}

/** Point reached by travelling `distKm` from (lat, lon) along initial bearing `bearingDeg`. */
export function destination(lat: number, lon: number, bearingDeg: number, distKm: number) {
  const { e, n, u } = enuBasis(lat, lon);
  const b = bearingDeg * DEG;
  const th = distKm / MOON_RADIUS_KM;
  const t: Vec3 = [
    Math.cos(b) * n[0] + Math.sin(b) * e[0],
    Math.cos(b) * n[1] + Math.sin(b) * e[1],
    Math.cos(b) * n[2] + Math.sin(b) * e[2],
  ];
  const p: Vec3 = [
    Math.cos(th) * u[0] + Math.sin(th) * t[0],
    Math.cos(th) * u[1] + Math.sin(th) * t[1],
    Math.cos(th) * u[2] + Math.sin(th) * t[2],
  ];
  let plon = Math.atan2(p[1], p[0]) * RAD;
  if (plon < 0) plon += 360;
  return { lat: Math.asin(Math.max(-1, Math.min(1, p[2]))) * RAD, lon: plon };
}

export function scoreOf(c: Omit<Candidate, 'score'>, o: Objective): number {
  if (o === 'sun') return c.sunlitPct;
  if (o === 'both') return c.bothPct;
  return -c.longestNightH;
}

/** Grid points within `radiusKm` of the centre (including the centre itself). */
export function gridAround(lat: number, lon: number, radiusKm: number, spacingKm: number) {
  const pts: { lat: number; lon: number; distKm: number; bearingDeg: number }[] = [];
  const n = Math.floor(radiusKm / spacingKm);
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      const dx = j * spacingKm; // east
      const dy = i * spacingKm; // north
      const d = Math.hypot(dx, dy);
      if (d > radiusKm + 1e-9) continue;
      const bearing = ((Math.atan2(dx, dy) * RAD) + 360) % 360;
      const p = d === 0 ? { lat, lon } : destination(lat, lon, bearing, d);
      pts.push({ ...p, distKm: d, bearingDeg: bearing });
    }
  return pts;
}

/**
 * Evaluate one candidate. Uses 2° azimuth bins and hourly sampling: ~10× cheaper than the
 * full-resolution analysis, accurate to a few percent for ranking purposes.
 */
export function evaluate(
  p: { lat: number; lon: number; distKm: number; bearingDeg: number },
  dems: Dem[],
  o: SearchOptions,
): Candidate {
  const h = computeHorizon(p.lat, p.lon, dems, { mastM: o.mastM, bins: 180, maxDistKm: 250 });
  const tr = sampleTrack(
    { lat: p.lat, lon: p.lon, groundHeightKm: h.groundHeightKm, mask: h.mask },
    { startMs: o.startMs, days: o.days, stepMin: o.days > 60 ? 180 : 60, mastM: o.mastM, commsMarginDeg: o.commsMarginDeg },
  );
  const m = tr.metrics;
  const c = {
    ...p,
    groundKm: h.groundHeightKm,
    sunlitPct: m.sunlitPct,
    earthPct: m.earthVisiblePct,
    bothPct: m.bothPct,
    longestNightH: m.longestNightH,
  };
  return { ...c, score: scoreOf(c, o.objective) };
}
