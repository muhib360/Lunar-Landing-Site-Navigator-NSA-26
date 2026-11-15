import { useMemo, useRef } from 'react';
import { DAY_MS, fmtUtc } from '../app/state.ts';
import type { Track } from '../core/timeline.ts';

const SPEEDS = [
  [0.5, 'Slow'],
  [2, 'Normal'],
  [6, 'Fast'],
] as const;

interface Props {
  track: Track;
  cursorMs: number;
  days: number;
  playing: boolean;
  speed: number;
  onCursor: (ms: number) => void;
  onPlay: (p: boolean) => void;
  onSpeed: (s: number) => void;
}

/**
 * Video-player style time control. The strip behind the handle shows when the Sun is up (gold)
 * and when Earth is in view (blue), so good and bad periods are visible at a glance.
 */
export function TimeBar({ track, cursorMs, days, playing, speed, onCursor, onPlay, onSpeed }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const span = days * DAY_MS;
  const t0 = track.times[0];
  const n = track.times.length;

  const toMs = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(span, ((clientX - r.left) / r.width) * span));
  };

  // Gradient strips from the track (≤ 200 segments); rebuilt only when the track changes.
  const { sunBg, earthBg } = useMemo(() => {
    const seg = Math.max(1, Math.floor(n / 200));
    const sunStops: string[] = [];
    const earthStops: string[] = [];
    for (let i = 0; i < n; i += seg) {
      const x = ((track.times[i] - t0) / span) * 100;
      const f = track.sunFrac[i];
      sunStops.push(`rgba(255,201,77,${(0.08 + 0.92 * f).toFixed(2)}) ${x.toFixed(2)}%`);
      earthStops.push(`${track.earthUp[i] ? 'rgba(94,200,255,0.95)' : 'rgba(94,200,255,0.06)'} ${x.toFixed(2)}%`);
    }
    return {
      sunBg: `linear-gradient(90deg, ${sunStops.join(',')})`,
      earthBg: `linear-gradient(90deg, ${earthStops.join(',')})`,
    };
  }, [track, n, t0, span]);
  const ticks = [];
  const every = days <= 14 ? 1 : days <= 60 ? 5 : 30;
  for (let d = 0; d <= days; d += every) ticks.push(d);

  return (
    <div className="timebar glass">
      <button className="play" onClick={() => onPlay(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="tb-main">
        <div className="tb-head">
          <span className="tb-date">{fmtUtc(t0 + cursorMs)}</span>
          <span className="muted">
            Day {Math.floor(cursorMs / DAY_MS) + 1} of {days}
          </span>
        </div>
        <div
          className="tb-track"
          ref={ref}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            onPlay(false);
            onCursor(toMs(e.clientX));
          }}
          onPointerMove={(e) => {
            if (e.buttons & 1) onCursor(toMs(e.clientX));
          }}
          role="slider"
          aria-label="Time"
          aria-valuemin={0}
          aria-valuemax={days}
          aria-valuenow={+(cursorMs / DAY_MS).toFixed(1)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') onCursor(Math.min(span, cursorMs + (e.shiftKey ? DAY_MS : DAY_MS / 8)));
            if (e.key === 'ArrowLeft') onCursor(Math.max(0, cursorMs - (e.shiftKey ? DAY_MS : DAY_MS / 8)));
          }}
        >
          <div className="tb-band sun" style={{ background: sunBg }} />
          <div className="tb-band earth" style={{ background: earthBg }} />
          {ticks.map((d) => (
            <span key={d} className="tb-tick" style={{ left: `${(d / days) * 100}%` }}>
              {d}d
            </span>
          ))}
          <div className="tb-handle" style={{ left: `${(cursorMs / span) * 100}%` }} />
        </div>
        <div className="tb-legend">
          <span>
            <i className="sw sun" /> Sun up
          </span>
          <span>
            <i className="sw earth" /> Earth in view
          </span>
        </div>
      </div>
      <div className="speed" role="group" aria-label="Playback speed">
        {SPEEDS.map(([s, label]) => (
          <button key={s} className={speed === s ? 'on' : ''} onClick={() => onSpeed(s)} title={`${s} days per second`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
