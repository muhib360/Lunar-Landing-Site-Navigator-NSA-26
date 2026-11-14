// Converts raw LOLA products (data/raw, from fetch-lola.mjs) into the files the app ships:
//   public/data/polar240.bin      LDEM_75S_240M as int16 LE (unchanged)
//   public/data/global8.bin       LDEM_16 averaged 2×2 to 8 px/deg, int16 LE
//   public/data/polar-shade.png   hillshade of lat ≤ −80°, 480 m/px
//   public/data/global-shade.png  hillshade of the whole Moon, 4 px/deg
//   src/data/horizons.json        precomputed terrain-horizon masks for catalog sites
// Usage: node scripts/build-data.ts
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { computeHorizon, globalDem, polarSouthDem } from '../src/core/dem.ts';
import { SITES } from '../src/core/sites.ts';

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
const polarData = load('LDEM_75S_240M.IMG');
const g16Data = load('LDEM_16.IMG');
const polar = polarSouthDem(polarData, POLAR_SIZE, POLAR_SCALE_KM, -75);
const g16 = globalDem(g16Data, 16);

// 1. Browser DEMs
copyFileSync(join(raw, 'LDEM_75S_240M.IMG'), join(pub, 'polar240.bin'));
{
  const w16 = 5760, h16 = 2880, w = 2880, h = 1440;
  const out = new Int16Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const i = 2 * r * w16 + 2 * c;
      out[r * w + c] = Math.round((g16Data[i] + g16Data[i + 1] + g16Data[i + w16] + g16Data[i + w16 + 1]) / 4);
    }
  writeFileSync(join(pub, 'global8.bin'), Buffer.from(out.buffer));
  void h16;
}
console.log('DEMs written');

// 2. Hillshades (sun from the upper left, 35° up).
function shadePng(w: number, h: number, heightAt: (c: number, r: number) => number, pixKm: number, file: string) {
  const png = new PNG({ width: w, height: h });
  const az = (315 * Math.PI) / 180, alt = (35 * Math.PI) / 180;
  const lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const hc = heightAt(c, r);
      const o = (r * w + c) * 4;
      if (Number.isNaN(hc)) {
        png.data[o + 3] = 0;
        continue;
      }
      const dx = (heightAt(Math.min(c + 1, w - 1), r) - heightAt(Math.max(c - 1, 0), r)) / (2 * pixKm);
      const dy = (heightAt(c, Math.max(r - 1, 0)) - heightAt(c, Math.min(r + 1, h - 1))) / (2 * pixKm);
      const nl = Math.hypot(dx, dy, 1);
      let s = (-dx * lx - dy * ly + lz) / nl;
      s = Math.max(0, s);
      // Tint slightly by elevation so highs read warmer than lows.
      const t = Math.max(0, Math.min(1, (hc + 6) / 14));
      const v = 30 + 200 * s;
      png.data[o] = Math.min(255, v * (0.92 + 0.12 * t));
      png.data[o + 1] = Math.min(255, v * (0.94 + 0.04 * t));
      png.data[o + 2] = Math.min(255, v * (1.04 - 0.1 * t));
      png.data[o + 3] = 255;
    }
  writeFileSync(join(pub, file), PNG.sync.write(png));
}

{
  // Polar: crop to the lat −80° circle, 2× downsample → 480 m/px.
  const radiusKm = 2 * 1737.4 * Math.tan(Math.PI / 4 + (-80 * Math.PI) / 360);
  const half = Math.ceil(radiusKm / 0.48);
  const size = 2 * half;
  const c0 = (POLAR_SIZE - 1) / 2;
  const at = (c: number, r: number) => {
    // map shade pixel → source pixel (centre-aligned)
    const sc = c0 + (c - half + 0.5) * 2;
    const sr = c0 + (r - half + 0.5) * 2;
    const ic = Math.round(sc), ir = Math.round(sr);
    if (ic < 0 || ir < 0 || ic >= POLAR_SIZE || ir >= POLAR_SIZE) return NaN;
    return polarData[ir * POLAR_SIZE + ic] * 0.0005;
  };
  shadePng(size, size, at, 0.48, 'polar-shade.png');
  writeFileSync(
    join(pub, 'polar-shade.json'),
    JSON.stringify({ size, kmPerPx: 0.48, note: 'Polar stereographic, centre = south pole, lat ≥ −80° edge' }),
  );
  console.log(`polar-shade.png ${size}px`);
}
{
  const g4 = load('LDEM_4.IMG');
  const w = 1440, h = 720;
  const pixKm = (1737.4 * Math.PI) / 180 / 4;
  shadePng(w, h, (c, r) => g4[r * w + c] * 0.0005, pixKm, 'global-shade.png');
  console.log('global-shade.png');
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
