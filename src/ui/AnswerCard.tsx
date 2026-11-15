import { fmtUtc } from '../app/state.ts';
import type { Track } from '../core/timeline.ts';
import { type Level, RATING_LABEL, monthSummary, nowStatus } from './ratings.ts';
import { Term } from './Term.tsx';

interface Props {
  track: Track;
  timeMs: number;
  days: number;
  terrainReady: boolean;
}

function Dot({ level }: { level: Level }) {
  return <span className={`dot ${level}`} aria-label={RATING_LABEL[level]} />;
}

/** The plain-English answer: "will we have power, and can we talk to Earth?" */
export function AnswerCard({ track, timeMs, days, terrainReady }: Props) {
  const now = nowStatus(track, timeMs);
  const month = monthSummary(track, days);
  return (
    <div className="answer">
      <div className="answer-now">
        <div className="answer-time">At {fmtUtc(timeMs)}</div>
        <div className={`now-row ${now.sunUp ? 'on' : 'off'}`}>
          <span className="now-icon sun">☀</span>
          <div>
            <b>Sun {now.sunUp ? 'up' : 'hidden'}</b>
            <p>{now.sunText}</p>
          </div>
        </div>
        <div className={`now-row ${now.earthUp ? 'on' : 'off'}`}>
          <span className="now-icon earth">◐</span>
          <div>
            <b>Earth {now.earthUp ? 'in view' : 'out of sight'}</b>
            <p>{now.earthText}</p>
          </div>
        </div>
        <div className="power">
          <span>
            Solar power now <Term id="verticalPanel">ⓘ</Term>
          </span>
          <div className="meter">
            <div style={{ width: `${Math.min(100, now.powerPct)}%` }} />
          </div>
          <b>{Math.round(now.powerPct)}%</b>
        </div>
      </div>

      <div className="answer-month">
        <h3>Over the next {days} days</h3>
        <div className="rating">
          <Dot level={month.sun.level} />
          <div>
            <b>Sunlight · {RATING_LABEL[month.sun.level]}</b>
            <p>{month.sun.text}</p>
          </div>
        </div>
        <div className="rating">
          <Dot level={month.earth.level} />
          <div>
            <b>
              Talking to Earth · {RATING_LABEL[month.earth.level]} <Term id="dte">ⓘ</Term>
            </b>
            <p>{month.earth.text}</p>
          </div>
        </div>
        <div className="rating">
          <Dot level={month.night.level} />
          <div>
            <b>Longest night · {RATING_LABEL[month.night.level]}</b>
            <p>{month.night.text}</p>
          </div>
        </div>
        <p className="verdict">{month.verdict}</p>
        {!terrainReady && <p className="muted small">Loading NASA terrain for this spot…</p>}
      </div>
    </div>
  );
}
