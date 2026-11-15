// Shared DEM loader for the main thread, the 3D globe and the search worker.
import { type Dem, globalDem, polarSouthDem } from '../core/dem.ts';

export interface DemLoader {
  /** DEMs to use around a site, fine → coarse. */
  demsFor(lat: number): Promise<Dem[]>;
  polar(): Promise<Dem>;
  global(): Promise<Dem>;
}

export function makeDemLoader(dataUrl: string): DemLoader {
  const fetchInt16 = async (file: string) => {
    const res = await fetch(new URL(file, dataUrl));
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    return new Int16Array(await res.arrayBuffer());
  };
  let polarP: Promise<Dem> | null = null;
  let globalP: Promise<Dem> | null = null;
  const polar = () => (polarP ??= fetchInt16('polar240.bin').then((d) => polarSouthDem(d, 3812, 0.24, -75)));
  const global = () => (globalP ??= fetchInt16('global8.bin').then((d) => globalDem(d, 8)));
  return {
    polar,
    global,
    async demsFor(lat) {
      const dems: Dem[] = [];
      if (lat <= -74) dems.push(await polar());
      dems.push(await global());
      return dems;
    },
  };
}

/** Absolute URL of the app's data/ folder (works for any deploy base path). */
export const dataUrl = () => new URL(`${import.meta.env.BASE_URL}data/`, document.baseURI).href;
