// Main-thread handle to the terrain worker (one shared instance for the whole app).
import { dataUrl } from '../app/demLoader.ts';
import type { SiteHorizon } from '../core/timeline.ts';
import type { TileMesh } from './tileMesh.ts';
import type { TerrainRequest } from './terrain.worker.ts';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;

class TerrainClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<{ id: number; error?: string } & Record<string, unknown>>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data);
    };
    this.worker.postMessage({ type: 'init', dataUrl: dataUrl() } satisfies TerrainRequest);
  }

  private call<T>(msg: Distribute<Exclude<TerrainRequest, { type: 'init' }>>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...msg, id });
    });
  }

  tile(west: number, south: number, east: number, north: number, level: number) {
    return this.call<{ tile: TileMesh }>({ type: 'tile', west, south, east, north, level }).then((r) => r.tile);
  }

  /**
   * Terrain heights (m) for [lat, lon] pairs. With detail = false the answer comes from the global
   * map right away instead of waiting for the 13 MB south-pole file.
   */
  heights(points: [number, number][], detail = true) {
    return this.call<{ heights: Float64Array }>({ type: 'heights', points: points.flat(), detail }).then((r) => r.heights);
  }

  horizon(lat: number, lon: number, mastM: number) {
    return this.call<{ horizon: SiteHorizon }>({ type: 'horizon', lat, lon, mastM }).then((r) => r.horizon);
  }
}

let client: TerrainClient | null = null;
export const terrain = () => (client ??= new TerrainClient());
