// Turns the engine's numbers into plain-English answers and green / amber / red ratings.
// Thresholds are deliberately simple so anyone on the team can tune them.
import { fmtDuration } from '../app/state.ts';
import { type Track, indexAt, nextEvent } from '../core/timeline.ts';

export type Level = 'good' | 'ok' | 'poor';

export const RATING_LABEL: Record<Level, string> = { good: 'Good', ok: 'Fair', poor: 'Poor' };

/** % of the window the Sun is up (time-averaged visible disk). */
export const rateSun = (pct: number): Level => (pct >= 50 ? 'good' : pct >= 25 ? 'ok' : 'poor');
/** % of the window Earth is in view. */
export const rateEarth = (pct: number): Level => (pct >= 90 ? 'good' : pct >= 50 ? 'ok' : 'poor');
/** Longest continuous darkness, hours. Anything over ~8 days needs very large batteries/heaters. */
export const rateNight = (h: number): Level => (h <= 72 ? 'good' : h <= 192 ? 'ok' : 'poor');

export interface MonthSummary {
  sun: { level: Level; pct: number; text: string };
  earth: { level: Level; pct: number; text: string };
  night: { level: Level; hours: number; text: string };
  both: number;
  verdict: string;
}

export function monthSummary(tr: Track, days: number): MonthSummary {
  const m = tr.metrics;
  const sunL = rateSun(m.sunlitPct);
  const earthL = rateEarth(m.earthVisiblePct);
  const nightL = rateNight(m.longestNightH);
  const span = `${days} days`;
  const sunText =
    m.sunlitPct < 0.5
      ? 'Never — this spot stays in shadow the whole time.'
      : `Up ${m.sunlitPct.toFixed(0)}% of the ${span}.`;
  const earthText =
    m.earthVisiblePct < 0.5
      ? 'Never visible — you would need a relay satellite to talk to Earth.'
      : m.earthVisiblePct > 99.5
        ? 'Always in the sky — you can call home any time.'
        : `In view ${m.earthVisiblePct.toFixed(0)}% of the ${span}.`;
  const nightText =
    m.longestNightH >= days * 24 - 1
      ? 'Dark for the entire period.'
      : `${fmtDuration(m.longestNightH * 3_600_000)} at most — batteries must last this long.`;
  const scores: number[] = [sunL, earthL, nightL].map((l) => (l === 'good' ? 2 : l === 'ok' ? 1 : 0));
  const total = scores.reduce((a, b) => a + b, 0);
  const verdict =
    total >= 5
      ? 'Great choice: plenty of power and contact with Earth.'
      : total >= 3
        ? 'Workable, with trade-offs — check the amber items.'
        : 'Difficult: the mission would struggle for power or communication.';
  return {
    sun: { level: sunL, pct: m.sunlitPct, text: sunText },
    earth: { level: earthL, pct: m.earthVisiblePct, text: earthText },
    night: { level: nightL, hours: m.longestNightH, text: nightText },
    both: m.bothPct,
    verdict,
  };
}

export interface NowStatus {
  t: number;
  sunUp: boolean;
  sunFrac: number;
  sunHeight: number; // deg above the mountains in its direction
  sunEl: number;
  sunAz: number;
  sunText: string;
  earthUp: boolean;
  earthHeight: number;
  earthAz: number;
  earthText: string;
  powerPct: number; // vertical sun-tracking panel, % of full sunlight
  earthPhase: number;
}

export function nowStatus(tr: Track, t: number): NowStatus {
  const i = indexAt(tr, t);
  const sunFrac = tr.sunFrac[i];
  const sunUp = sunFrac >= 0.5;
  const sunHeight = tr.sunEl[i] - tr.sunHorizon[i];
  const earthUp = tr.earthUp[i] === 1;
  const earthHeight = tr.earthEl[i] - tr.earthHorizon[i];
  const sEv = nextEvent(tr, t, [sunUp ? 'sunset' : 'sunrise']);
  const eEv = nextEvent(tr, t, [earthUp ? 'earthset' : 'earthrise']);
  const inT = (e?: { t: number }) => (e ? fmtDuration(e.t - t) : null);
  const sunText = sunUp
    ? `Shining, ${sunHeight.toFixed(1)}° above the mountains. ${inT(sEv) ? `Sets in ${inT(sEv)}.` : 'Stays up for the rest of this period.'}`
    : sunFrac > 0.01
      ? `Peeking over the ridge (${Math.round(sunFrac * 100)}% visible).`
      : `Hidden ${tr.sunEl[i] > 0 ? 'behind the mountains' : 'below the horizon'}. ${inT(sEv) ? `Rises in ${inT(sEv)}.` : 'Does not rise again in this period.'}`;
  const earthText = earthUp
    ? `In the sky, ${earthHeight.toFixed(1)}° up. ${inT(eEv) ? `Sets in ${inT(eEv)}.` : 'Stays in view for the rest of this period.'}`
    : `Out of sight. ${inT(eEv) ? `Rises in ${inT(eEv)}.` : tr.metrics.maxEarthEl < 0 ? 'Never rises here (far side).' : 'Does not rise again in this period.'}`;
  return {
    t,
    sunUp,
    sunFrac,
    sunHeight,
    sunEl: tr.sunEl[i],
    sunAz: tr.sunAz[i],
    sunText,
    earthUp,
    earthHeight,
    earthAz: tr.earthAz[i],
    earthText,
    // Share of full sunlight on an upright panel facing the Sun: visible disk × cos(Sun height).
    powerPct: 100 * sunFrac * Math.max(0, Math.cos((tr.sunEl[i] * Math.PI) / 180)),
    earthPhase: tr.earthPhase[i],
  };
}

/** Per-day summary for calendar strips: fraction of each day with Sun / Earth. */
export function dailyBins(tr: Track): { sun: number; earth: number; start: number }[] {
  const out: { sun: number; earth: number; start: number }[] = [];
  const n = tr.times.length;
  if (n < 2) return out;
  const t0 = tr.times[0];
  for (let i = 0; i < n; i++) {
    const d = Math.floor((tr.times[i] - t0) / 86_400_000);
    out[d] ??= { sun: 0, earth: 0, start: t0 + d * 86_400_000 };
    out[d].sun += tr.sunFrac[i];
    out[d].earth += tr.earthUp[i];
  }
  const perDay = 86_400_000 / (tr.times[1] - t0);
  return out.filter(Boolean).map((b) => ({ ...b, sun: Math.min(1, b.sun / perDay), earth: Math.min(1, b.earth / perDay) }));
}
