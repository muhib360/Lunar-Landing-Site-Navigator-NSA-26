// Shared DEM loader for the terrain worker, the search worker and (lazily) the main thread.
import { type Dem, globalDem, polarSouthDem } from '../core/dem.ts';
import { decodeDem } from '../core/demCodec.ts';

/** Polar DEM is cropped to this latitude (see scripts/build-data.ts). */
export const POLAR_EDGE_LAT = -77;

export interface DemLoader {
  /** DEMs to use around a site, fine → coarse. */
  demsFor(lat: number): Promise<Dem[]>;
  polar(): Promise<Dem>;
  global(): Promise<Dem>;
}

async function fetchLola(url: URL) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url.pathname}: HTTP ${res.status}`);
  // Files are gzip-compressed; decompress in the browser (servers don't need special headers).
  const raw = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return decodeDem(raw);
}

export function makeDemLoader(dataUrl: string): DemLoader {
  let polarP: Promise<Dem> | null = null;
  let globalP: Promise<Dem> | null = null;
  const polar = () =>
    (polarP ??= fetchLola(new URL('polar240.lola', dataUrl)).then((d) => polarSouthDem(d.data, d.width, 0.24, POLAR_EDGE_LAT)));
  const global = () => (globalP ??= fetchLola(new URL('global8.lola', dataUrl)).then((d) => globalDem(d.data, 8)));
  return {
    polar,
    global,
    async demsFor(lat) {
      const dems: Dem[] = [];
      if (lat <= POLAR_EDGE_LAT + 1) dems.push(await polar());
      dems.push(await global());
      return dems;
    },
  };
}

/** Absolute URL of the app's data/ folder (works for any deploy base path). */
export const dataUrl = () => new URL(`${import.meta.env.BASE_URL}data/`, document.baseURI).href;
