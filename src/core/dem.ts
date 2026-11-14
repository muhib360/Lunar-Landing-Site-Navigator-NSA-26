// LOLA digital elevation models and terrain-horizon ray marching.
//
// Heights are stored as int16 DN with 0.5 m per DN relative to a 1737.4 km sphere, exactly as in
// the PDS LOLA GDR products, so the same arrays work in Node (build scripts) and the browser.
import { MOON_RADIUS_KM } from './ephemeris.ts';
import { DEG, RAD, type Vec3, enuBasis } from './vec.ts';

const DN_TO_KM = 0.5 / 1000;

export interface Dem {
  kind: 'polar-south' | 'global';
  /** Approximate pixel size in km (used to pick ray-march step sizes). */
  resKm: number;
  /** Height above the 1737.4 km sphere in km, or NaN outside coverage. */
  height(latDeg: number, lonDeg: number): number;
  /** True if the point is inside the DEM's coverage. */
  covers(latDeg: number, lonDeg: number): boolean;
  /** Upper bound of terrain height in the DEM (km); lets ray marching stop early. */
  maxHeightKm: number;
}

function bilinear(data: Int16Array, w: number, h: number, col: number, row: number): number {
  if (col < 0 || row < 0 || col > w - 1 || row > h - 1) return NaN;
  const c0 = Math.min(Math.floor(col), w - 2);
  const r0 = Math.min(Math.floor(row), h - 2);
  const fc = col - c0;
  const fr = row - r0;
  const i = r0 * w + c0;
  const v =
    data[i] * (1 - fc) * (1 - fr) + data[i + 1] * fc * (1 - fr) + data[i + w] * (1 - fc) * fr + data[i + w + 1] * fc * fr;
  return v * DN_TO_KM;
}

function maxOf(data: Int16Array) {
  let m = -32768;
  for (let i = 0; i < data.length; i++) if (data[i] > m) m = data[i];
  return m * DN_TO_KM;
}

/**
 * South polar stereographic DEM (spherical, R = 1737.4 km, centre lon 0°), e.g. LDEM_75S_240M.
 * x = ρ·sin(lon), y = ρ·cos(lon) with ρ = 2R·tan(45° + lat/2); 0-based pixel col = c0 + x/scale,
 * row = c0 − y/scale. Orientation verified against LDEM_16 (mean |Δh| ≈ 50 m) in scripts/check-dem.ts.
 */
export function polarSouthDem(data: Int16Array, size: number, scaleKm: number, minLatDeg: number): Dem {
  const c0 = (size - 1) / 2;
  const R = MOON_RADIUS_KM;
  const toPixel = (latDeg: number, lonDeg: number) => {
    const rho = 2 * R * Math.tan(Math.PI / 4 + (latDeg * DEG) / 2);
    const x = rho * Math.sin(lonDeg * DEG);
    const y = rho * Math.cos(lonDeg * DEG);
    return { col: c0 + x / scaleKm, row: c0 - y / scaleKm };
  };
  return {
    kind: 'polar-south',
    resKm: scaleKm,
    maxHeightKm: maxOf(data),
    covers: (lat) => lat <= minLatDeg,
    height(lat, lon) {
      if (lat > minLatDeg) return NaN;
      const p = toPixel(lat, lon);
      return bilinear(data, size, size, p.col, p.row);
    },
  };
}

/** Polar-stereographic pixel → (lat, lon), for rendering maps and picking clicks. */
export function polarPixelToLatLon(col: number, row: number, size: number, scaleKm: number) {
  const c0 = (size - 1) / 2;
  const x = (col - c0) * scaleKm;
  const y = (c0 - row) * scaleKm;
  const rho = Math.hypot(x, y);
  const lat = (2 * Math.atan(rho / (2 * MOON_RADIUS_KM)) - Math.PI / 2) * RAD;
  let lon = Math.atan2(x, y) * RAD;
  if (lon < 0) lon += 360;
  return { lat, lon };
}

export function latLonToPolarPixel(lat: number, lon: number, size: number, scaleKm: number) {
  const c0 = (size - 1) / 2;
  const rho = 2 * MOON_RADIUS_KM * Math.tan(Math.PI / 4 + (lat * DEG) / 2);
  return { col: c0 + (rho * Math.sin(lon * DEG)) / scaleKm, row: c0 - (rho * Math.cos(lon * DEG)) / scaleKm };
}

/**
 * Global simple-cylindrical DEM, pixel registered, like LDEM_16: row 0 starts at 90°N,
 * col 0 starts at 0°E, `ppd` pixels per degree.
 */
export function globalDem(data: Int16Array, ppd: number): Dem {
  const w = 360 * ppd;
  const h = 180 * ppd;
  return {
    kind: 'global',
    resKm: (MOON_RADIUS_KM * DEG) / ppd,
    maxHeightKm: maxOf(data),
    covers: () => true,
    height(lat, lon) {
      const row = (90 - lat) * ppd - 0.5;
      let col = ((((lon % 360) + 360) % 360) * ppd) - 0.5;
      // Wrap longitude: sample with an explicit seam fix.
      if (col < 0) col += w;
      const r = Math.min(Math.max(row, 0), h - 1);
      if (col > w - 1) {
        // between last column and first column
        const f = col - (w - 1);
        const a = bilinear(data, w, h, w - 1, r);
        const b = bilinear(data, w, h, 0, r);
        return a * (1 - f) + b * f;
      }
      return bilinear(data, w, h, col, r);
    },
  };
}

/** Pick the best DEM covering a point (first in the list that covers it). */
export function demFor(dems: Dem[], lat: number, lon: number): Dem | undefined {
  return dems.find((d) => d.covers(lat, lon));
}

export const HORIZON_BINS = 720; // 0.5° azimuth resolution

export interface HorizonResult {
  /** Terrain horizon elevation (deg) for azimuth i * 360 / bins, measured from north clockwise. */
  mask: Float32Array;
  /** Distance (km) to the horizon-forming terrain for each azimuth. */
  distKm: Float32Array;
  groundHeightKm: number;
}

/**
 * Ray-march the DEM outward along great circles from the site for every azimuth and record the
 * maximum elevation angle of terrain, including the curvature of the Moon.
 * `dems` is ordered fine → coarse; each sample uses the first DEM that covers it.
 */
export function computeHorizon(
  lat: number,
  lon: number,
  dems: Dem[],
  opts: { mastM?: number; bins?: number; maxDistKm?: number } = {},
): HorizonResult {
  const bins = opts.bins ?? HORIZON_BINS;
  const maxDist = opts.maxDistKm ?? 400;
  const R = MOON_RADIUS_KM;
  const primary = demFor(dems, lat, lon);
  if (!primary) throw new Error('No DEM covers this site');
  const ground = primary.height(lat, lon);
  const h0 = ground + (opts.mastM ?? 2) / 1000;
  const r0 = R + h0;
  const maxH = Math.max(...dems.map((d) => d.maxHeightKm));

  const { e, n, u } = enuBasis(lat, lon);
  const mask = new Float32Array(bins);
  const distKm = new Float32Array(bins);
  const baseStep = primary.resKm * 0.5;

  for (let i = 0; i < bins; i++) {
    const az = ((i * 360) / bins) * DEG;
    const t: Vec3 = [
      Math.cos(az) * n[0] + Math.sin(az) * e[0],
      Math.cos(az) * n[1] + Math.sin(az) * e[1],
      Math.cos(az) * n[2] + Math.sin(az) * e[2],
    ];
    let best = -90 * DEG;
    let bestTan = Math.tan(best);
    let bestDist = 0;
    let s = baseStep;
    while (s < maxDist) {
      const th = s / R;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      // Early exit: even the highest terrain at this distance cannot beat the current maximum.
      const ub = ((R + maxH) * c - r0) / ((R + maxH) * sn);
      if (ub < bestTan) break;
      const ux = c * u[0] + sn * t[0];
      const uy = c * u[1] + sn * t[1];
      const uz = c * u[2] + sn * t[2];
      const plat = Math.asin(Math.max(-1, Math.min(1, uz))) * RAD;
      const plon = Math.atan2(uy, ux) * RAD;
      const dem = demFor(dems, plat, plon);
      if (!dem) break;
      const hh = dem.height(plat, plon);
      if (Number.isNaN(hh)) break;
      const rr = R + hh;
      // Elevation angle of the terrain point from the observer: tan = (vertical) / (horizontal)
      const vert = rr * c - r0;
      const horiz = rr * sn;
      const tn = vert / horiz;
      if (tn > bestTan) {
        bestTan = tn;
        best = Math.atan(tn);
        bestDist = s;
      }
      // Step: half a pixel of the DEM in use near the site, growing slowly with distance.
      s += Math.max(dem.resKm * 0.5, baseStep, s * 0.004);
    }
    mask[i] = best * RAD;
    distKm[i] = bestDist;
  }
  return { mask, distKm, groundHeightKm: ground };
}
