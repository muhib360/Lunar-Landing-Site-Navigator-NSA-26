// Sanity checks for DEM orientation: known features must appear where they belong.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globalDem, polarSouthDem } from '../src/core/dem.ts';

const raw = join(import.meta.dirname, '..', 'data', 'raw');
const load = (f: string) => {
  const b = readFileSync(join(raw, f));
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2);
};

const polar = polarSouthDem(load('LDEM_75S_240M.IMG'), 3812, 0.24, -75);
const g16 = globalDem(load('LDEM_16.IMG'), 16);

const probes: [string, number, number][] = [
  ['Shackleton centre (floor, expect ~-2 to -4 km)', -89.67, 129.78],
  ['Shackleton rim far side (expect higher)', -89.3, 129.78],
  ['Haworth centre (deep, expect low)', -87.45, 355.0],
  ['Malapert massif peak (expect high, ~+5 km)', -86.0, 2.9],
  ['Mons Mouton (expect high, ~+6 km)', -84.6, 31.0],
  ['IM-1 Odysseus', -80.13, 1.44],
  ['Cabeus centre (deep)', -85.33, 317.8],
];
for (const [name, lat, lon] of probes) {
  console.log(
    `${name.padEnd(48)} polar=${polar.height(lat, lon).toFixed(2)} km  global16=${g16.height(lat, lon).toFixed(2)} km`,
  );
}
