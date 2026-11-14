// Smoke test: metrics for a few catalog sites over one year (2027), 30-min steps.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sampleTrack } from '../src/core/timeline.ts';
import { SITES } from '../src/core/sites.ts';

const horizons = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src', 'data', 'horizons.json'), 'utf8'));
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ['south-pole', 'shackleton-floor', 'im2', 'malapert', 'a11', 'ce4']) {
  const s = SITES.find((x) => x.id === id)!;
  const h = horizons[id];
  const t0 = performance.now();
  const tr = sampleTrack(
    { lat: s.lat, lon: s.lon, groundHeightKm: h.ground, mask: Float32Array.from(h.mask) },
    { startMs: Date.UTC(2027, 0, 1), days: 365, stepMin: 30, mastM: 2, commsMarginDeg: 0 },
  );
  const m = tr.metrics;
  console.log(
    `${id.padEnd(17)} sun ${m.sunlitPct.toFixed(1).padStart(5)}%  earth ${m.earthVisiblePct.toFixed(1).padStart(5)}%  both ${m.bothPct.toFixed(1).padStart(5)}%  ` +
      `night ${m.longestNightH.toFixed(0).padStart(5)} h  maxSunEl ${m.maxSunEl.toFixed(2)}°  events ${tr.events.length}  ${(performance.now() - t0).toFixed(0)} ms`,
  );
}
