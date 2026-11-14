import { SITES, siteById } from '../core/sites.ts';

export interface Scenario {
  id: string;
  /** Catalog site id, or null for a custom point. */
  siteId: string | null;
  name: string;
  lat: number;
  lon: number;
  startMs: number;
}

export interface Settings {
  days: number;
  stepMin: number;
  mastM: number;
  commsMarginDeg: number;
}

export const COLORS = ['#ffb547', '#5ec8ff', '#c49bff', '#6ee7a8'];
export const LABELS = ['A', 'B', 'C', 'D'];
export const MAX_SCENARIOS = 4;
export const DAY_MS = 86_400_000;
export const SYNODIC_MS = 29.530589 * DAY_MS;

export const DEFAULT_SETTINGS: Settings = { days: 30, stepMin: 10, mastM: 2, commsMarginDeg: 0 };

let counter = 0;
export const newId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export function scenarioFromSite(siteId: string, startMs: number): Scenario {
  const s = siteById(siteId) ?? SITES[0];
  return { id: newId(), siteId: s.id, name: s.name, lat: s.lat, lon: s.lon, startMs };
}

export function customScenario(lat: number, lon: number, startMs: number, id = newId()): Scenario {
  return { id, siteId: null, name: `Custom ${fmtLat(lat)}, ${fmtLon(lon)}`, lat, lon, startMs };
}

export const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'}`;
export const fmtLon = (lon: number) => {
  const l = ((lon % 360) + 360) % 360;
  return `${l.toFixed(3)}°E`;
};

const DEFAULT_START = Date.UTC(2026, 11, 1, 0, 0);
export function defaultScenarios(): Scenario[] {
  return [
    scenarioFromSite('im2', DEFAULT_START),
    scenarioFromSite('malapert', DEFAULT_START),
    { ...scenarioFromSite('im2', DEFAULT_START + 14 * DAY_MS) },
  ];
}

// ---- Shareable URL state (#s=...) ----
interface Packed {
  v: 1;
  s: [string | null, number, number, number][];
  o: [number, number, number, number];
  a: number;
}

export function encodeState(scenarios: Scenario[], settings: Settings, active: number): string {
  const p: Packed = {
    v: 1,
    s: scenarios.map((x) => [x.siteId, +x.lat.toFixed(5), +x.lon.toFixed(5), Math.round(x.startMs / 60000)]),
    o: [settings.days, settings.stepMin, settings.mastM, settings.commsMarginDeg],
    a: active,
  };
  return btoa(JSON.stringify(p)).replace(/=+$/, '');
}

export function decodeState(hash: string): { scenarios: Scenario[]; settings: Settings; active: number } | null {
  try {
    const m = /s=([A-Za-z0-9+/]+)/.exec(hash);
    if (!m) return null;
    const p = JSON.parse(atob(m[1])) as Packed;
    if (p.v !== 1 || !Array.isArray(p.s) || p.s.length === 0) return null;
    const scenarios = p.s.slice(0, MAX_SCENARIOS).map(([siteId, lat, lon, min]) => {
      const startMs = min * 60000;
      if (siteId && siteById(siteId)) return scenarioFromSite(siteId, startMs);
      return customScenario(lat, lon, startMs);
    });
    const [days, stepMin, mastM, commsMarginDeg] = p.o;
    return {
      scenarios,
      settings: { days, stepMin, mastM, commsMarginDeg },
      active: Math.min(Math.max(0, p.a | 0), scenarios.length - 1),
    };
  } catch {
    return null;
  }
}

// ---- Formatting ----
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(ms / 60000)} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${Math.round(h - d * 24)} h`;
}

export function fmtUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/** For <input type="datetime-local">, interpreted as UTC. */
export const toInputValue = (ms: number) => new Date(ms).toISOString().slice(0, 16);
export const fromInputValue = (v: string) => Date.parse(`${v}:00Z`);
