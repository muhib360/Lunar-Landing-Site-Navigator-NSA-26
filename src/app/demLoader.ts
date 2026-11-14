// Shared DEM loader for the main thread and the search worker.
import { type Dem, globalDem, polarSouthDem } from '../core/dem.ts';

export function makeDemLoader(dataUrl: string) {
  const fetchInt16 = async (file: string) => {
    const res = await fetch(new URL(file, dataUrl));
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    return new Int16Array(await res.arrayBuffer());
  };
  let polarP: Promise<Dem> | null = null;
  let globalP: Promise<Dem> | null = null;
  const loadPolar = () => (polarP ??= fetchInt16('polar240.bin').then((d) => polarSouthDem(d, 3812, 0.24, -75)));
  const loadGlobal = () => (globalP ??= fetchInt16('global8.bin').then((d) => globalDem(d, 8)));

  /** DEMs to use around a site, fine → coarse. */
  return async function demsFor(lat: number): Promise<Dem[]> {
    const dems: Dem[] = [];
    if (lat <= -74) dems.push(await loadPolar());
    dems.push(await loadGlobal());
    return dems;
  };
}

/** Absolute URL of the app's data/ folder (works for any deploy base path). */
export const dataUrl = () => new URL(`${import.meta.env.BASE_URL}data/`, document.baseURI).href;
