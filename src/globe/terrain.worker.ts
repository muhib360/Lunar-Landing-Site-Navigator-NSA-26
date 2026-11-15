// Background worker that owns the LOLA DEMs: builds 3D terrain tiles, samples heights and
// computes horizon masks, so none of that heavy work runs on the UI thread.
import { POLAR_EDGE_LAT, makeDemLoader } from '../app/demLoader.ts';
import { computeHorizon } from '../core/dem.ts';
import { type TileDems, buildTile, heightM } from './tileMesh.ts';

export type TerrainRequest =
  | { type: 'init'; dataUrl: string }
  | { type: 'tile'; id: number; west: number; south: number; east: number; north: number; level: number }
  | { type: 'heights'; id: number; points: number[]; detail: boolean } // points: [lat, lon, lat, lon, …]
  | { type: 'horizon'; id: number; lat: number; lon: number; mastM: number };

let loader: ReturnType<typeof makeDemLoader> | null = null;

/** Coarse tiles (≥ ~5 km cells) look the same from the global DEM, so they never wait for the pole. */
const POLAR_DETAIL_LEVEL = 6;

/** DEMs needed for an area: wait for the 13 MB polar DEM only when the detail is actually needed. */
async function demsForArea(southLat: number, needDetail = true): Promise<TileDems> {
  const global = await loader!.global();
  if (southLat > POLAR_EDGE_LAT || !needDetail) return { global, polarEdgeLat: POLAR_EDGE_LAT };
  return { global, polar: await loader!.polar(), polarEdgeLat: POLAR_EDGE_LAT };
}

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

// ---- Tile queue ----
// Tiles arrive by the hundred while the globe loads. They are queued and built a few milliseconds
// at a time, so quick requests (ground height for "Stand here", horizons) are answered in between
// instead of waiting behind the whole backlog.
type TileMsg = Extract<TerrainRequest, { type: 'tile' }>;
const queue: TileMsg[] = [];
const waitingForPolar: TileMsg[] = [];
let globalDem: TileDems['global'] | null = null;
let polarDem: TileDems['polar'] | null = null;
let pumping = false;
const tick = new MessageChannel(); // yields without timer throttling (unlike setTimeout)
tick.port1.onmessage = () => pump();

function buildAndPost(m: TileMsg) {
  const detail = m.south <= POLAR_EDGE_LAT && m.level >= POLAR_DETAIL_LEVEL;
  const d: TileDems = { global: globalDem!, polar: detail ? polarDem! : undefined, polarEdgeLat: POLAR_EDGE_LAT };
  const t = buildTile(d, m.west, m.south, m.east, m.north);
  post({ id: m.id, tile: t }, [t.quantizedVertices.buffer, t.encodedNormals.buffer]);
}

function pump() {
  pumping = false;
  if (!globalDem) return; // resumes when the global DEM arrives
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 8) {
    const m = queue.shift()!;
    const needsPolar = m.south <= POLAR_EDGE_LAT && m.level >= POLAR_DETAIL_LEVEL;
    if (needsPolar && !polarDem) waitingForPolar.push(m);
    else buildAndPost(m);
  }
  if (queue.length) schedule();
}
function schedule() {
  if (pumping) return;
  pumping = true;
  tick.port2.postMessage(0);
}

self.onmessage = async (e: MessageEvent<TerrainRequest>) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      loader = makeDemLoader(m.dataUrl);
      // Start downloads right away: global first (needed for the first view), then the pole.
      loader.global().then((g) => {
        globalDem = g;
        schedule();
        return loader!.polar();
      }).then((p) => {
        polarDem = p;
        queue.push(...waitingForPolar.splice(0));
        schedule();
      });
      return;
    }
    if (m.type === 'tile') {
      queue.push(m);
      schedule();
      return;
    }
    if (m.type === 'heights') {
      let south = 90;
      for (let i = 0; i < m.points.length; i += 2) south = Math.min(south, m.points[i]);
      const d = await demsForArea(south, m.detail);
      const out = new Float64Array(m.points.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = heightM(d, m.points[2 * i], m.points[2 * i + 1]);
      post({ id: m.id, heights: out }, [out.buffer]);
      return;
    }
    if (m.type === 'horizon') {
      const dems = await loader!.demsFor(m.lat);
      const r = computeHorizon(m.lat, m.lon, dems, { mastM: m.mastM });
      post({ id: m.id, horizon: { lat: m.lat, lon: m.lon, groundHeightKm: r.groundHeightKm, mask: r.mask } }, [r.mask.buffer]);
    }
  } catch (err) {
    post({ id: (m as { id?: number }).id, error: (err as Error).message });
  }
};
