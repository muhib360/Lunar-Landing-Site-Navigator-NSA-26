export type Vec3 = [number, number, number];

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => scale(a, 1 / norm(a));
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Unit radial vector for selenographic latitude/longitude (degrees, east-positive). */
export function radial(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

/** Local East-North-Up basis at a surface point. */
export function enuBasis(latDeg: number, lonDeg: number): { e: Vec3; n: Vec3; u: Vec3 } {
  const la = latDeg * DEG;
  const lo = lonDeg * DEG;
  const u: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const e: Vec3 = [-Math.sin(lo), Math.cos(lo), 0];
  const n: Vec3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  return { e, n, u };
}

export const wrap360 = (x: number) => ((x % 360) + 360) % 360;
export const wrap180 = (x: number) => wrap360(x + 180) - 180;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
