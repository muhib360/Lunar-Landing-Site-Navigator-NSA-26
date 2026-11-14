import { useState } from 'react';
import { maskAt } from '../core/horizon.ts';
import type { SiteHorizon, Track } from '../core/timeline.ts';
import { wrap180 } from '../core/vec.ts';

interface Props {
  track: Track;
  horizon: SiteHorizon;
  index: number;
  color: string;
  label: string;
  title: string;
}

type Center = 'north' | 'sun' | 'earth';
type Zoom = 'auto' | 'horizon' | 'full';

const W = 1000;
const H = 330;
const PAD = { l: 52, r: 12, t: 14, b: 30 };

/**
 * 360° panorama of the sky as seen from the landing site: terrain silhouette, Sun and Earth
 * disks (vertical size to scale) and their paths over the whole window.
 */
export function SkyPanorama({ track, horizon, index, color, label, title }: Props) {
  const [center, setCenter] = useState<Center>('north');
  const [zoom, setZoom] = useState<Zoom>('auto');
  const mask = horizon.mask;
  const n = track.times.length;

  const cAz = center === 'north' ? 0 : center === 'sun' ? track.sunAz[index] : track.earthAz[index];
  let maskMax = -90, maskMin = 90;
  for (const v of mask) {
    maskMax = Math.max(maskMax, v);
    maskMin = Math.min(maskMin, v);
  }
  const lo = Math.min(-2, Math.floor(maskMin - 1));
  let hi: number;
  if (zoom === 'full') hi = 90;
  else if (zoom === 'horizon') hi = Math.max(6, Math.ceil(maskMax + 3));
  else {
    let m = maskMax + 3;
    for (let i = 0; i < n; i++) m = Math.max(m, track.sunEl[i] + 2, track.earthEl[i] + 2);
    hi = Math.min(90, Math.max(6, Math.ceil(m)));
  }

  const pw = W - PAD.l - PAD.r;
  const ph = H - PAD.t - PAD.b;
  const x = (az: number) => PAD.l + ((wrap180(az - cAz) + 180) / 360) * pw;
  const y = (el: number) => PAD.t + ((hi - el) / (hi - lo)) * ph;
  const pxPerDegY = ph / (hi - lo);

  // Terrain silhouette, drawn left to right starting at cAz − 180.
  let terrain = `M ${PAD.l} ${H - PAD.b}`;
  for (let k = 0; k <= 720; k++) {
    const az = cAz - 180 + k * 0.5;
    terrain += ` L ${(PAD.l + (k / 720) * pw).toFixed(1)} ${y(Math.max(lo, maskAt(mask, az))).toFixed(1)}`;
  }
  terrain += ` L ${W - PAD.r} ${H - PAD.b} Z`;

  const pathOf = (az: Float32Array, el: Float32Array) => {
    let d = '';
    let px = NaN;
    const stride = Math.max(1, Math.floor(n / 3000));
    for (let i = 0; i < n; i += stride) {
      const xx = x(az[i]);
      const yy = y(el[i]);
      const inRange = el[i] >= lo - 2 && el[i] <= hi + 2;
      if (!inRange) {
        px = NaN;
        continue;
      }
      d += Number.isNaN(px) || Math.abs(xx - px) > pw / 2 ? ` M ${xx.toFixed(1)} ${yy.toFixed(1)}` : ` L ${xx.toFixed(1)} ${yy.toFixed(1)}`;
      px = xx;
    }
    return d;
  };

  const sun = { az: track.sunAz[index], el: track.sunEl[index] };
  const earth = { az: track.earthAz[index], el: track.earthEl[index] };
  const sunR = Math.max(3, 0.267 * pxPerDegY);
  const earthR = Math.max(5, 0.95 * pxPerDegY);
  const phase = track.earthPhase[index];
  const sunAngle = (Math.atan2(y(sun.el) - y(earth.el), x(sun.az) - x(earth.az)) * 180) / Math.PI;

  const gridStep = hi - lo > 40 ? 15 : hi - lo > 16 ? 5 : hi - lo > 8 ? 2 : 1;
  const grid: number[] = [];
  for (let e = Math.ceil(lo / gridStep) * gridStep; e <= hi; e += gridStep) grid.push(e);
  const cardinals = [
    [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
  ] as const;

  const sunVisible = track.sunFrac[index];
  const earthClear = earth.el - track.earthHorizon[index];

  return (
    <section className="panel sky">
      <header className="panel-head">
        <h2>
          <span className="chip" style={{ background: color }}>{label}</span> Sky from {title}
        </h2>
        <div className="toggles">
          <span>Centre</span>
          {(['north', 'sun', 'earth'] as Center[]).map((c) => (
            <button key={c} className={center === c ? 'on' : ''} onClick={() => setCenter(c)}>
              {c[0].toUpperCase() + c.slice(1)}
            </button>
          ))}
          <span>Zoom</span>
          {(['auto', 'horizon', 'full'] as Zoom[]).map((z) => (
            <button key={z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>
              {z[0].toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
      </header>
      <svg viewBox={`0 0 ${W} ${H}`} className="sky-svg" role="img" aria-label="Sky panorama with Sun, Earth and terrain horizon">
        <defs>
          <linearGradient id="skygrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#05070d" />
            <stop offset="1" stopColor="#0d1424" />
          </linearGradient>
          <clipPath id="plot">
            <rect x={PAD.l} y={PAD.t} width={pw} height={ph} />
          </clipPath>
        </defs>
        <rect x={PAD.l} y={PAD.t} width={pw} height={ph} fill="url(#skygrad)" />
        {grid.map((e) => (
          <g key={e}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(e)} y2={y(e)} className={e === 0 ? 'grid zero' : 'grid'} />
            <text x={PAD.l - 6} y={y(e) + 4} className="axis" textAnchor="end">
              {e}°
            </text>
          </g>
        ))}
        {cardinals.map(([az, l]) => (
          <text key={l} x={x(az)} y={H - 8} className="axis" textAnchor="middle">
            {l}
          </text>
        ))}
        <g clipPath="url(#plot)">
          <path d={pathOf(track.sunAz, track.sunEl)} className="track sun" />
          <path d={pathOf(track.earthAz, track.earthEl)} className="track earth" />
          {/* Disks before terrain so the terrain occludes them. */}
          <circle cx={x(sun.az)} cy={y(sun.el)} r={sunR} className="sun-disk" />
          <g transform={`translate(${x(earth.az)} ${y(earth.el)}) rotate(${sunAngle})`}>
            <circle r={earthR} className="earth-dark" />
            <path d={phasePath(earthR, phase)} className="earth-lit" />
          </g>
          <path d={terrain} className="terrain" />
          <path d={pathOf(track.sunAz, track.sunEl)} className="track sun ghost" />
          <path d={pathOf(track.earthAz, track.earthEl)} className="track earth ghost" />
          <circle cx={x(sun.az)} cy={y(sun.el)} r={sunR} className="ring sun-ring" />
          <circle cx={x(earth.az)} cy={y(earth.el)} r={earthR} className="ring earth-ring" />
        </g>
        <rect x={PAD.l} y={PAD.t} width={pw} height={ph} className="frame" />
      </svg>
      <div className="readout">
        <span className="sun-c">
          ☀ Sun {sun.el.toFixed(2)}° el, az {sun.az.toFixed(1)}° · terrain {track.sunHorizon[index].toFixed(2)}° ·{' '}
          <b>{Math.round(sunVisible * 100)}% of disk visible</b>
        </span>
        <span className="earth-c">
          🜨 Earth {earth.el.toFixed(2)}° el, az {earth.az.toFixed(1)}° ·{' '}
          <b>{earthClear >= 0 ? `${earthClear.toFixed(2)}° above terrain` : `${(-earthClear).toFixed(2)}° below terrain`}</b>{' '}
          · {Math.round(phase * 100)}% lit
        </span>
      </div>
      <p className="hint">
        Dashed paths show where the Sun and Earth go over the whole window. Disk sizes are to vertical scale; the
        horizontal axis is compressed (360° wide).
      </p>
    </section>
  );
}

/** Lit part of a disk of radius r, with the Sun towards +x; k = illuminated fraction. */
function phasePath(r: number, k: number): string {
  const rx = Math.abs(1 - 2 * k) * r;
  const sweep = k > 0.5 ? 1 : 0;
  return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${sweep} 0 ${-r} Z`;
}
