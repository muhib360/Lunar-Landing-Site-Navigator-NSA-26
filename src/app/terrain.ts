// Terrain-horizon provider for the browser: precomputed masks for catalog sites, and on-demand
// ray marching in the terrain worker for custom sites or other mast heights.
import { sphereMask } from '../core/horizon.ts';
import type { SiteHorizon } from '../core/timeline.ts';
import precomputedJson from '../data/horizons.json';
import { terrain } from '../globe/terrainClient.ts';

const PRECOMPUTED = precomputedJson as Record<string, { ground: number; mask: number[] }>;
const PRECOMPUTED_MAST_M = 2;

export const horizonKey = (lat: number, lon: number, mastM: number) =>
  `${lat.toFixed(5)},${lon.toFixed(5)},${mastM}`;

export function precomputedHorizon(siteId: string | null, lat: number, lon: number, mastM: number): SiteHorizon | null {
  if (!siteId || mastM !== PRECOMPUTED_MAST_M) return null;
  const p = PRECOMPUTED[siteId];
  if (!p) return null;
  return { lat, lon, groundHeightKm: p.ground, mask: Float32Array.from(p.mask) };
}

/** Smooth-sphere fallback while terrain loads. */
export function sphereHorizon(lat: number, lon: number, mastM: number): SiteHorizon {
  return { lat, lon, groundHeightKm: 0, mask: sphereMask(mastM) };
}

/** Terrain horizon for any point, computed in the terrain worker (same code as the build script). */
export function computeSiteHorizon(lat: number, lon: number, mastM: number): Promise<SiteHorizon> {
  return terrain().horizon(lat, lon, mastM);
}
