// Compares our Sun/Earth azimuth-elevation against JPL Horizons for observers on the Moon.
// Usage: node scripts/validate-ephemeris.ts
import { execFileSync } from 'node:child_process';
import { moonFrame, sunAndEarth } from '../src/core/ephemeris.ts';

const SITES = [
  { name: 'Near south pole', lat: -89.45, lon: 222.7 },
  { name: 'Apollo 11', lat: 0.67416, lon: 23.47314 },
  { name: 'IM-2 (Mons Mouton)', lat: -84.7906, lon: 29.1957 },
  { name: 'Far side mid-lat', lat: 45.0, lon: -120.0 },
];
const TARGETS = [
  { id: '10', key: 'sun' as const },
  { id: '399', key: 'earth' as const },
];
const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function horizons(target: string, lat: number, lon: number) {
  const q = new URLSearchParams({
    format: 'text',
    COMMAND: `'${target}'`,
    CENTER: `'coord@301'`,
    COORD_TYPE: `'GEODETIC'`,
    SITE_COORD: `'${lon},${lat},0'`,
    MAKE_EPHEM: `'YES'`,
    EPHEM_TYPE: `'OBSERVER'`,
    START_TIME: `'2026-11-20'`,
    STOP_TIME: `'2027-11-20'`,
    STEP_SIZE: `'17d'`,
    QUANTITIES: `'4'`,
    ANG_FORMAT: `'DEG'`,
    CSV_FORMAT: `'YES'`,
  });
  const text = execFileSync('curl', ['-sSf', `https://ssd.jpl.nasa.gov/api/horizons.api?${q}`], {
    encoding: 'utf8',
  });
  const body = text.split('$$SOE')[1]?.split('$$EOE')[0];
  if (!body) throw new Error(text.slice(0, 2000));
  return body
    .trim()
    .split('\n')
    .map((line) => {
      const c = line.split(',').map((s) => s.trim());
      const m = /(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})/.exec(c[0])!;
      const t = Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5]);
      return { t, az: +c[3], el: +c[4] };
    });
}

let worst = 0;
for (const site of SITES) {
  for (const target of TARGETS) {
    const rows = horizons(target.id, site.lat, site.lon);
    let maxErr = 0;
    for (const r of rows) {
      const ours = sunAndEarth({ lat: site.lat, lon: site.lon, heightKm: 0 }, moonFrame(r.t))[target.key];
      // Angular separation between the two (az, el) directions.
      const d2r = Math.PI / 180;
      const cosSep =
        Math.sin(ours.el * d2r) * Math.sin(r.el * d2r) +
        Math.cos(ours.el * d2r) * Math.cos(r.el * d2r) * Math.cos((ours.az - r.az) * d2r);
      const sep = Math.acos(Math.min(1, cosSep)) / d2r;
      maxErr = Math.max(maxErr, sep);
    }
    worst = Math.max(worst, maxErr);
    console.log(
      `${site.name.padEnd(22)} ${target.key.padEnd(6)} n=${rows.length}  max sep = ${(maxErr * 3600).toFixed(1)}″`,
    );
  }
}
console.log(`\nWorst-case angular error vs JPL Horizons: ${(worst * 3600).toFixed(1)}″ (${worst.toFixed(4)}°)`);
if (worst > 0.05) {
  console.error('FAIL: error exceeds 0.05°');
  process.exit(1);
}
console.log('PASS (< 0.05°)');
