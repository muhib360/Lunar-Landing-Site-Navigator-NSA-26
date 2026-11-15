// Runs the nearby-site search off the main thread.
import { type Candidate, type SearchOptions, evaluate, gridAround } from '../core/search.ts';
import { makeDemLoader } from './demLoader.ts';

export type SearchRequest = { id: number; dataUrl: string; lat: number; lon: number; opts: SearchOptions };
export type SearchMessage =
  | { id: number; progress: number }
  | { id: number; done: Candidate[] }
  | { id: number; error: string };

let loader: ReturnType<typeof makeDemLoader> | null = null;

// The loop below never yields (timers in background workers can be heavily throttled), so the
// main thread cancels a search by terminating the worker.
self.onmessage = async (e: MessageEvent<SearchRequest>) => {
  const msg = e.data;
  const { id, lat, lon, opts } = msg;
  const post = (m: SearchMessage) => (self as unknown as Worker).postMessage(m);
  try {
    loader ??= makeDemLoader(msg.dataUrl);
    const dems = await loader.demsFor(lat);
    const pts = gridAround(lat, lon, opts.radiusKm, opts.spacingKm);
    const out: Candidate[] = [];
    for (let i = 0; i < pts.length; i++) {
      out.push(evaluate(pts[i], dems, opts));
      if (i % 4 === 3) post({ id, progress: (i + 1) / pts.length });
    }
    out.sort((a, b) => b.score - a.score);
    post({ id, done: out });
  } catch (err) {
    post({ id, error: (err as Error).message });
  }
};
