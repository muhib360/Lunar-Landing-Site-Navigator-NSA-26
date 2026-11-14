import { MOON_RADIUS_KM } from './ephemeris.ts';
import { RAD, clamp } from './vec.ts';

/** Terrain horizon elevation (deg) at azimuth `az` (deg), linear interpolation with wrap. */
export function maskAt(mask: ArrayLike<number>, az: number): number {
  const n = mask.length;
  const x = ((((az % 360) + 360) % 360) * n) / 360;
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return mask[i] * (1 - f) + mask[(i + 1) % n] * f;
}

/** Horizon dip below horizontal for an observer `hKm` above a smooth sphere (deg, negative). */
export function sphereHorizonDeg(hKm: number): number {
  return -Math.acos(MOON_RADIUS_KM / (MOON_RADIUS_KM + Math.max(hKm, 0))) * RAD;
}

/** Smooth-sphere mask (no terrain), for when no DEM is loaded. */
export function sphereMask(mastM = 2, bins = 720): Float32Array {
  return new Float32Array(bins).fill(sphereHorizonDeg(mastM / 1000));
}

/**
 * Fraction (0..1) of a circular disk of angular radius `r` centred at elevation `el` that lies
 * above a locally straight horizon at elevation `h`.
 */
export function diskFraction(el: number, h: number, r: number): number {
  const x = clamp((el - h) / r, -1, 1);
  return 1 - (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI;
}
