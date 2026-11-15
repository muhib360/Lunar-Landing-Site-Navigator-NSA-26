// Cuts the NASA SVS "CGI Moon Kit" LROC colour map into a small tile pyramid for the offline globe.
// Source (public domain): https://svs.gsfc.nasa.gov/4720 — lroc_color_16bit_srgb_8k.tif (8192×4096)
// Output: public/moon/{z}/{x}/{y}.jpg in Cesium's geographic tiling (2×1 tiles at level 0, y=0 north).
// Usage: node scripts/build-moon-tiles.mjs
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import sharp from 'sharp';

const root = join(import.meta.dirname, '..');
const src = join(root, 'data', 'raw', 'lroc_color_16bit_srgb_8k.tif');
const URL = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_8k.tif';
const out = join(root, 'public', 'moon');
const TILE = 256;
const MAX_LEVEL = 4; // 2^(4+1) × 256 = 8192 px wide

if (!existsSync(src)) {
  console.log('Downloading NASA CGI Moon Kit colour map (243 MB)…');
  mkdirSync(join(root, 'data', 'raw'), { recursive: true });
  execFileSync('curl', ['-sSfL', '--retry', '3', '-o', src, URL], { stdio: 'inherit' });
}

rmSync(out, { recursive: true, force: true });
sharp.cache(false);
// 16-bit → 8-bit sRGB once, kept in memory as raw RGB.
const { data, info } = await sharp(src, { limitInputPixels: false })
  .toColourspace('srgb')
  .raw({ depth: 'uchar' })
  .toBuffer({ resolveWithObject: true });
console.log(`source ${info.width}×${info.height}, ${info.channels} channels`);

let count = 0;
for (let z = 0; z <= MAX_LEVEL; z++) {
  const cols = 2 ** (z + 1);
  const rows = 2 ** z;
  const level = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .resize(cols * TILE, rows * TILE, { kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let x = 0; x < cols; x++) {
    mkdirSync(join(out, String(z), String(x)), { recursive: true });
    for (let y = 0; y < rows; y++) {
      await sharp(level.data, { raw: level.info })
        .extract({ left: x * TILE, top: y * TILE, width: TILE, height: TILE })
        .removeAlpha()
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(join(out, String(z), String(x), `${y}.jpg`));
      count++;
    }
  }
  console.log(`level ${z}: ${cols}×${rows}`);
}
console.log(`${count} tiles written to public/moon/`);
