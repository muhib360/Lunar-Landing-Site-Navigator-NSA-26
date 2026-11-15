// Converts raw LOLA products (data/raw, from fetch-lola.mjs) into the files the app ships:
//   public/data/polar240.lola     LDEM_75S_240M cropped to lat ≤ −77°, compressed
//   public/data/global8.lola      LDEM_16 averaged 2×2 to 8 px/deg, compressed
//   src/data/horizons.json        precomputed terrain-horizon masks for catalog sites
// Usage: node scripts/build-data.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { computeHorizon, globalDem, polarSouthDem } from '../src/core/dem.ts';
import { SITES } from '../src/core/sites.ts';
import { encodeDem } from '../src/core/demCodec.ts';

const root = join(import.meta.dirname, '..');
const raw = join(root, 'data', 'raw');
const pub = join(root, 'public', 'data');
mkdirSync(pub, { recursive: true });
mkdirSync(join(root, 'src', 'data'), { recursive: true });

const load = (f: string) => {
  const b = readFileSync(join(raw, f));
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2);
};

const POLAR_SIZE = 3812;
const POLAR_SCALE_KM = 0.24;
const POLAR_CROP_LAT = -77;
const polarData = load('LDEM_75S_240M.IMG');
const g16Data = load('LDEM_16.IMG');
const polar = polarSouthDem(polarData, POLAR_SIZE, POLAR_SCALE_KM, -75);
const g16 = globalDem(g16Data, 16);

// 1. Browser DEMs, delta-coded + gzipped (.lola, see src/core/demCodec.ts).
//    Polar: cropped to lat ≤ −77° (the globe and custom-site horizons fall back to the global DEM
//    beyond that). Global: LDEM_16 averaged 2×2 to 8 px/deg.
const writeLola = (file: string, data: Int16Array, w: number, h: number) => {
  const gz = gzipSync(encodeDem(data, w, h), { level: 9 });
  writeFileSync(join(pub, file), gz);
  console.log(`${file}: ${w}×${h}, ${(gz.length / 1e6).toFixed(1)} MB`);
};
{
  const c0 = (POLAR_SIZE - 1) / 2;
  const half = Math.ceil((2 * 1737.4 * Math.tan(Math.PI / 4 + (POLAR_CROP_LAT * Math.PI) / 360)) / POLAR_SCALE_KM);
  const start = c0 + 0.5 - half; // keeps the pole exactly at the centre of the crop
  const S = 2 * half;
  const out = new Int16Array(S * S);
  for (let r = 0; r < S; r++) out.set(polarData.subarray((start + r) * POLAR_SIZE + start, (start + r) * POLAR_SIZE + start + S), r * S);
  writeLola('polar240.lola', out, S, S);
}
{
  const w16 = 5760, w = 2880, h = 1440;
  const out = new Int16Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const i = 2 * r * w16 + 2 * c;
      out[r * w + c] = Math.round((g16Data[i] + g16Data[i + 1] + g16Data[i + w16] + g16Data[i + w16 + 1]) / 4);
    }
  writeLola('global8.lola', out, w, h);
}

// 3. Precomputed horizons for catalog sites (fine polar DEM first, then 16 ppd global).
const horizons: Record<string, { ground: number; mask: number[] }> = {};
for (const s of SITES) {
  const t0 = performance.now();
  const res = computeHorizon(s.lat, s.lon, [polar, g16], { mastM: 2 });
  horizons[s.id] = {
    ground: +res.groundHeightKm.toFixed(4),
    mask: Array.from(res.mask, (v) => +v.toFixed(3)),
  };
  console.log(`${s.id.padEnd(18)} ground ${res.groundHeightKm.toFixed(2)} km   max horizon ${Math.max(...res.mask).toFixed(2)}°   ${(performance.now() - t0).toFixed(0)} ms`);
}
writeFileSync(join(root, 'src', 'data', 'horizons.json'), JSON.stringify(horizons));
console.log('horizons.json written');
