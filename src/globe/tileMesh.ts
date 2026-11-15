// Builds one terrain tile (a 33×33 height grid with surface normals) from LOLA DEMs. Pure math,
// no Cesium import, so it runs inside the terrain Web Worker and never blocks the UI.
import type { Dem } from '../core/dem.ts';

export const TILE_N = 33; // vertices per tile edge
const R = 1_737_400; // Cesium Ellipsoid.MOON radius (m) — same reference sphere as LOLA
const D2R = Math.PI / 180;

export interface TileDems {
  global: Dem;
  polar?: Dem;
  polarEdgeLat: number;
}

/** Terrain height in metres above the 1737.4 km sphere. */
export function heightM(d: TileDems, lat: number, lon: number): number {
  if (d.polar && lat <= d.polarEdgeLat) {
    const h = d.polar.height(lat, lon);
    if (!Number.isNaN(h)) return h * 1000;
  }
  const h = d.global.height(Math.max(-89.99, Math.min(89.99, lat)), lon);
  return Number.isNaN(h) ? 0 : h * 1000;
}

export interface TileMesh {
  quantizedVertices: Uint16Array;
  encodedNormals: Uint8Array;
  minimumHeight: number;
  maximumHeight: number;
  center: [number, number, number];
  radius: number;
  /** Horizon-culling point in ellipsoid-scaled space, or null if it can't be computed. */
  horizonPoint: [number, number, number] | null;
}

const snorm = (v: number) => Math.round((Math.max(-1, Math.min(1, v)) * 0.5 + 0.5) * 255);
const sgn = (v: number) => (v < 0 ? -1 : 1);

/** Cesium-compatible "oct" encoding of a unit normal into two bytes. */
function octEncode(x: number, y: number, z: number, out: Uint8Array, i: number) {
  const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z);
  let u = x / l1;
  let v = y / l1;
  if (z < 0) {
    const ou = u;
    u = (1 - Math.abs(v)) * sgn(ou);
    v = (1 - Math.abs(ou)) * sgn(v);
  }
  out[i] = snorm(u);
  out[i + 1] = snorm(v);
}

export function buildTile(d: TileDems, westDeg: number, southDeg: number, eastDeg: number, northDeg: number): TileMesh {
  const N = TILE_N;
  const M = N + 2; // one extra ring so normals are seamless across tile edges
  const dLon = (eastDeg - westDeg) / (N - 1);
  const dLat = (northDeg - southDeg) / (N - 1);

  // Positions (ECEF, metres) on the (N+2)² grid.
  const P = new Float64Array(M * M * 3);
  const H = new Float64Array(M * M);
  for (let i = 0; i < M; i++) {
    const lat = Math.max(-90, Math.min(90, southDeg + (i - 1) * dLat));
    const cl = Math.cos(lat * D2R), sl = Math.sin(lat * D2R);
    for (let j = 0; j < M; j++) {
      const lon = westDeg + (j - 1) * dLon;
      const h = heightM(d, lat, lon);
      const r = R + h;
      const k = i * M + j;
      H[k] = h;
      P[3 * k] = r * cl * Math.cos(lon * D2R);
      P[3 * k + 1] = r * cl * Math.sin(lon * D2R);
      P[3 * k + 2] = r * sl;
    }
  }

  const n = N * N;
  let minH = Infinity, maxH = -Infinity;
  for (let i = 1; i <= N; i++)
    for (let j = 1; j <= N; j++) {
      const h = H[i * M + j];
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  if (maxH - minH < 1) maxH = minH + 1;

  const qv = new Uint16Array(3 * n);
  const normals = new Uint8Array(2 * n);
  let bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const k = i * N + j;
      const g = (i + 1) * M + (j + 1);
      qv[k] = Math.round((j / (N - 1)) * 32767);
      qv[n + k] = Math.round((i / (N - 1)) * 32767);
      qv[2 * n + k] = Math.round(((H[g] - minH) / (maxH - minH)) * 32767);
      const px = P[3 * g], py = P[3 * g + 1], pz = P[3 * g + 2];
      if (px < bx0) bx0 = px; if (px > bx1) bx1 = px;
      if (py < by0) by0 = py; if (py > by1) by1 = py;
      if (pz < bz0) bz0 = pz; if (pz > bz1) bz1 = pz;
      // normal = (east neighbour − west neighbour) × (north neighbour − south neighbour)
      const e = 3 * (g + 1), w = 3 * (g - 1), nn = 3 * (g + M), s = 3 * (g - M);
      const ex = P[e] - P[w], ey = P[e + 1] - P[w + 1], ez = P[e + 2] - P[w + 2];
      const nx = P[nn] - P[s], ny = P[nn + 1] - P[s + 1], nz = P[nn + 2] - P[s + 2];
      let ux = ey * nz - ez * ny, uy = ez * nx - ex * nz, uz = ex * ny - ey * nx;
      let len = Math.hypot(ux, uy, uz);
      if (len < 1e-9) {
        ux = px; uy = py; uz = pz; // degenerate at the pole: use the radial direction
        len = Math.hypot(ux, uy, uz);
      }
      octEncode(ux / len, uy / len, uz / len, normals, 2 * k);
    }

  // Bounding sphere around the box centre.
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, cz = (bz0 + bz1) / 2;
  let rad = 0;
  for (let i = 1; i <= N; i++)
    for (let j = 1; j <= N; j++) {
      const g = 3 * (i * M + j);
      rad = Math.max(rad, Math.hypot(P[g] - cx, P[g + 1] - cy, P[g + 2] - cz));
    }

  return {
    quantizedVertices: qv,
    encodedNormals: normals,
    minimumHeight: minH,
    maximumHeight: maxH,
    center: [cx, cy, cz],
    radius: rad,
    horizonPoint: horizonPoint(P, M, N, cx, cy, cz, minH),
  };
}

/**
 * Cesium's EllipsoidalOccluder.computeHorizonCullingPointPossiblyUnderEllipsoid, specialised for a
 * sphere: a point that is visible whenever any vertex of the tile could be.
 */
function horizonPoint(P: Float64Array, M: number, N: number, cx: number, cy: number, cz: number, minH: number): [number, number, number] | null {
  const Rs = R + Math.min(0, minH);
  const cl = Math.hypot(cx, cy, cz);
  if (cl === 0) return null;
  const dx = cx / cl, dy = cy / cl, dz = cz / cl;
  let best = 0;
  for (let i = 1; i <= N; i++)
    for (let j = 1; j <= N; j++) {
      const g = 3 * (i * M + j);
      const sx = P[g] / Rs, sy = P[g + 1] / Rs, sz = P[g + 2] / Rs;
      let mag2 = sx * sx + sy * sy + sz * sz;
      let mag = Math.sqrt(mag2);
      const ux = sx / mag, uy = sy / mag, uz = sz / mag;
      mag2 = Math.max(1, mag2);
      mag = Math.max(1, mag);
      const cosA = ux * dx + uy * dy + uz * dz;
      const sinA = Math.hypot(uy * dz - uz * dy, uz * dx - ux * dz, ux * dy - uy * dx);
      const cosB = 1 / mag;
      const sinB = Math.sqrt(mag2 - 1) * cosB;
      const m = 1 / (cosA * cosB - sinA * sinB);
      if (!(m > 0) || !Number.isFinite(m)) return null;
      if (m > best) best = m;
    }
  return [dx * best, dy * best, dz * best];
}
