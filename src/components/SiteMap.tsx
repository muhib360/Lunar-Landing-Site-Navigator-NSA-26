import { type MouseEvent, type ReactElement, useState } from 'react';
import { COLORS, LABELS, type Scenario, fmtLat, fmtLon } from '../app/state.ts';
import { latLonToPolarPixel, polarPixelToLatLon } from '../core/dem.ts';
import type { Candidate } from '../core/search.ts';
import { SITES } from '../core/sites.ts';

interface Props {
  scenarios: Scenario[];
  active: number;
  candidates: Candidate[] | null;
  onPick: (lat: number, lon: number) => void;
  onPickSite: (siteId: string) => void;
}

// Matches scripts/build-data.ts output.
const POLAR = { size: 1268, kmPerPx: 0.48, minLat: -80 };
const GLOBAL = { w: 1440, h: 720, ppd: 4 };
const base = import.meta.env.BASE_URL;

type View = 'polar' | 'global';

export function SiteMap({ scenarios, active, candidates, onPick, onPickSite }: Props) {
  const act = scenarios[active];
  // The map follows the active scenario's region unless the user picked a view for it.
  const auto: View = act.lat <= POLAR.minLat ? 'polar' : 'global';
  const ctx = `${act.id}:${auto}`;
  const [override, setOverride] = useState<{ ctx: string; view: View } | null>(null);
  const view = override?.ctx === ctx ? override.view : auto;
  const setView = (v: View) => setOverride({ ctx, view: v });
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<{ lat: number; lon: number } | null>(null);

  const toXY = (lat: number, lon: number) => {
    if (view === 'polar') {
      const p = latLonToPolarPixel(lat, lon, POLAR.size, POLAR.kmPerPx);
      return { x: p.col, y: p.row };
    }
    const l = ((lon % 360) + 360) % 360;
    return { x: l * GLOBAL.ppd, y: (90 - lat) * GLOBAL.ppd };
  };
  const fromXY = (x: number, y: number) => {
    if (view === 'polar') return polarPixelToLatLon(x, y, POLAR.size, POLAR.kmPerPx);
    return { lat: 90 - y / GLOBAL.ppd, lon: x / GLOBAL.ppd };
  };
  const inView = (lat: number) => (view === 'polar' ? lat <= POLAR.minLat : true);

  const W = view === 'polar' ? POLAR.size : GLOBAL.w;
  const H = view === 'polar' ? POLAR.size : GLOBAL.h;
  // Zoom around the active scenario.
  const c = inView(act.lat) ? toXY(act.lat, act.lon) : { x: W / 2, y: H / 2 };
  const vw = W / zoom;
  const vh = H / zoom;
  const vx = Math.max(0, Math.min(W - vw, c.x - vw / 2));
  const vy = Math.max(0, Math.min(H - vh, c.y - vh / 2));
  const k = vw / 600; // marker scale relative to on-screen size

  const svgPoint = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: vx + ((e.clientX - r.left) / r.width) * vw, y: vy + ((e.clientY - r.top) / r.height) * vh };
  };

  const graticule: ReactElement[] = [];
  if (view === 'polar') {
    for (const lat of [-82, -84, -86, -88]) {
      const r = latLonToPolarPixel(lat, 0, POLAR.size, POLAR.kmPerPx).row - (POLAR.size - 1) / 2;
      graticule.push(<circle key={lat} cx={(POLAR.size - 1) / 2} cy={(POLAR.size - 1) / 2} r={Math.abs(r)} className="grat" />);
      graticule.push(
        <text key={`t${lat}`} x={(POLAR.size - 1) / 2 + 4 * k} y={(POLAR.size - 1) / 2 + Math.abs(r) - 4 * k} className="grat-t" fontSize={11 * k}>
          {lat}°
        </text>,
      );
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const a = toXY(-80, lon);
      graticule.push(<line key={`l${lon}`} x1={(POLAR.size - 1) / 2} y1={(POLAR.size - 1) / 2} x2={a.x} y2={a.y} className="grat" />);
      const b = toXY(-80.4, lon);
      graticule.push(
        <text key={`lt${lon}`} x={b.x} y={b.y} textAnchor="middle" className="grat-t" fontSize={12 * k}>
          {lon}°E
        </text>,
      );
    }
  } else {
    for (let lat = -60; lat <= 60; lat += 30)
      graticule.push(<line key={lat} x1={0} x2={W} y1={(90 - lat) * 4} y2={(90 - lat) * 4} className="grat" />);
    for (let lon = 0; lon <= 360; lon += 60)
      graticule.push(<line key={`l${lon}`} y1={0} y2={H} x1={lon * 4} x2={lon * 4} className="grat" />);
    graticule.push(
      <text key="near" x={6} y={H - 8} className="grat-t" fontSize={12 * k}>
        0°E · near side centre
      </text>,
      <text key="far" x={180 * 4 + 6} y={H - 8} className="grat-t" fontSize={12 * k}>
        180°E · far side
      </text>,
    );
  }

  return (
    <section className="panel map">
      <header className="panel-head">
        <h2>Map</h2>
        <div className="toggles">
          <button className={view === 'polar' ? 'on' : ''} onClick={() => setView('polar')}>
            South pole
          </button>
          <button className={view === 'global' ? 'on' : ''} onClick={() => setView('global')}>
            Global
          </button>
          <span>Zoom</span>
          {[1, 2, 4, 8].map((z) => (
            <button key={z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>
              {z}×
            </button>
          ))}
        </div>
      </header>
      <svg
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        className="map-svg"
        onPointerMove={(e) => {
          const p = svgPoint(e);
          const ll = fromXY(p.x, p.y);
          setHover(inView(ll.lat) ? ll : null);
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const p = svgPoint(e);
          const ll = fromXY(p.x, p.y);
          if (inView(ll.lat)) onPick(+ll.lat.toFixed(4), +ll.lon.toFixed(4));
        }}
      >
        <image
          href={`${base}data/${view === 'polar' ? 'polar-shade' : 'global-shade'}.png`}
          x={0}
          y={0}
          width={W}
          height={H}
          preserveAspectRatio="none"
          style={{ imageRendering: zoom >= 4 ? 'pixelated' : 'auto' }}
        />
        {graticule}
        {candidates && <CandidateDots list={candidates} toXY={toXY} r={view === 'polar' ? 0.6 * (zoom >= 4 ? 1 : 2) : 1.5 * k} />}
        {SITES.filter((s) => inView(s.lat)).map((s) => {
          const p = toXY(s.lat, s.lon);
          return (
            <g
              key={s.id}
              className="site-marker"
              onClick={(e) => {
                e.stopPropagation();
                onPickSite(s.id);
              }}
            >
              <circle cx={p.x} cy={p.y} r={5 * k} />
              <title>{s.name}</title>
              {zoom >= 2 || view === 'polar' ? (
                <text x={p.x + 7 * k} y={p.y + 4 * k} fontSize={11 * k}>
                  {s.name.split(' — ')[0]}
                </text>
              ) : null}
            </g>
          );
        })}
        {scenarios.map((s, i) => {
          if (!inView(s.lat)) return null;
          const p = toXY(s.lat, s.lon);
          return (
            <g key={s.id} className={`scn-marker ${i === active ? 'active' : ''}`} pointerEvents="none">
              <circle cx={p.x} cy={p.y} r={(i === active ? 11 : 9) * k} fill={COLORS[i]} />
              <text x={p.x} y={p.y + 4 * k} textAnchor="middle" fontSize={11 * k}>
                {LABELS[i]}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="hint">
        {hover
          ? `${fmtLat(hover.lat)} ${fmtLon(hover.lon)} — click to move scenario ${LABELS[active]} here`
          : view === 'polar'
            ? 'LOLA hillshade, 80°S to the pole. Click anywhere to place the active scenario; click a dot for a catalog site.'
            : 'LOLA hillshade of the whole Moon. Click to place the active scenario.'}
      </p>
    </section>
  );
}

function CandidateDots({ list, toXY, r }: { list: Candidate[]; toXY: (lat: number, lon: number) => { x: number; y: number }; r: number }) {
  let lo = Infinity, hi = -Infinity;
  for (const c of list) {
    lo = Math.min(lo, c.score);
    hi = Math.max(hi, c.score);
  }
  return (
    <g pointerEvents="none">
      {list.map((c, i) => {
        const p = toXY(c.lat, c.lon);
        const f = hi > lo ? (c.score - lo) / (hi - lo) : 1;
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={r}
            fill={`hsl(${20 + 30 * f} 100% ${18 + 50 * f}%)`}
            stroke={i === 0 ? '#fff' : 'none'}
            strokeWidth={i === 0 ? r * 0.5 : 0}
          />
        );
      })}
    </g>
  );
}
