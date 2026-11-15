// Beginner level: one site, one date, a plain-English answer.
import { DAY_MS, type Scenario, SYNODIC_MS, fromInputValue, toInputValue } from '../app/state.ts';
import type { Track } from '../core/timeline.ts';
import { AnswerCard } from '../ui/AnswerCard.tsx';
import { SitePicker } from '../ui/SitePicker.tsx';
import { Term } from '../ui/Term.tsx';

interface Props {
  scenario: Scenario;
  track: Track;
  timeMs: number;
  days: number;
  terrainReady: boolean;
  onPickSite: (id: string) => void;
  onStart: (ms: number) => void;
}

export function Explore({ scenario, track, timeMs, days, terrainReady, onPickSite, onStart }: Props) {
  return (
    <div className="mode-panel">
      <SitePicker scenario={scenario} onPickSite={onPickSite} />
      <div className="date-row">
        <label>
          <span className="eyebrow">Landing date (UTC)</span>
          <input
            type="datetime-local"
            value={toInputValue(scenario.startMs)}
            onChange={(e) => {
              const t = fromInputValue(e.target.value);
              if (Number.isFinite(t)) onStart(t);
            }}
          />
        </label>
        <div className="chips">
          <button className="chip-btn" onClick={() => onStart(scenario.startMs - DAY_MS)}>
            −1 day
          </button>
          <button className="chip-btn" onClick={() => onStart(scenario.startMs + DAY_MS)}>
            +1 day
          </button>
          <button
            className="chip-btn"
            onClick={() => onStart(scenario.startMs + SYNODIC_MS)}
            title="One lunar day later (29.5 Earth days)"
          >
            +1 Moon month
          </button>
        </div>
      </div>
      <AnswerCard track={track} timeMs={timeMs} days={days} terrainReady={terrainReady} />
      <p className="muted small tip">
        Uses NASA <Term id="lola">LOLA</Term> terrain and a Sun/Earth <Term id="ephemeris">position model</Term> checked
        against NASA JPL. Press <b>Stand here</b> to see it for yourself.
      </p>
    </div>
  );
}
