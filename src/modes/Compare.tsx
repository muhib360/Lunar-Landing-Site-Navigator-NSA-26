// Middle level: up to four site/date options as cards, with a calendar of good and bad days
// and a search for a sunnier spot nearby.
import { type CSSProperties, memo } from 'react';
import {
  COLORS,
  DAY_MS,
  LABELS,
  MAX_SCENARIOS,
  type Scenario,
  type Settings,
  SYNODIC_MS,
  customScenario,
  fromInputValue,
  newId,
  scenarioFromSite,
  toInputValue,
} from '../app/state.ts';
import type { Candidate } from '../core/search.ts';
import { SITES, SITE_GROUPS } from '../core/sites.ts';
import type { Track } from '../core/timeline.ts';
import { NearbySearch } from '../components/NearbySearch.tsx';
import { RATING_LABEL, dailyBins, monthSummary } from '../ui/ratings.ts';

interface Props {
  scenarios: Scenario[];
  tracks: Track[];
  active: number;
  settings: Settings;
  candidates: Candidate[] | null;
  onActive: (i: number) => void;
  onScenarios: (s: Scenario[]) => void;
  onResults: (c: Candidate[] | null) => void;
}

// Memoised: the cards don't depend on the time cursor, so playback doesn't re-render them.
export const Compare = memo(function Compare(p: Props) {
  const { scenarios, tracks, active } = p;
  const update = (i: number, s: Scenario) => p.onScenarios(scenarios.map((x, j) => (j === i ? s : x)));
  const act = scenarios[active];

  return (
    <div className="mode-panel">
      <p className="muted small" style={{ margin: '0 0 4px' }}>
        Compare places or dates. The highlighted card is shown on the Moon and in the time bar.
      </p>
      {scenarios.map((s, i) => {
        const sum = monthSummary(tracks[i], p.settings.days);
        const bins = dailyBins(tracks[i]);
        return (
          <div
            key={s.id}
            className={`ccard ${i === active ? 'on' : ''}`}
            style={{ '--c': COLORS[i] } as CSSProperties}
            onClick={() => p.onActive(i)}
          >
            <div className="ccard-head">
              <span className="badge-letter">{LABELS[i]}</span>
              <select
                value={s.siteId ?? 'custom'}
                onChange={(e) =>
                  e.target.value !== 'custom' && update(i, { ...scenarioFromSite(e.target.value, s.startMs), id: s.id })
                }
                onClick={(e) => e.stopPropagation()}
                aria-label={`Site for option ${LABELS[i]}`}
              >
                {SITE_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {SITES.filter((x) => x.group === g).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {!s.siteId && <option value="custom">{s.name}</option>}
              </select>
            </div>
            <div className="ccard-date" onClick={(e) => e.stopPropagation()}>
              <input
                type="datetime-local"
                value={toInputValue(s.startMs)}
                onChange={(e) => {
                  const t = fromInputValue(e.target.value);
                  if (Number.isFinite(t)) update(i, { ...s, startMs: t });
                }}
              />
              <button className="chip-btn" onClick={() => update(i, { ...s, startMs: s.startMs - DAY_MS })}>
                −1d
              </button>
              <button className="chip-btn" onClick={() => update(i, { ...s, startMs: s.startMs + DAY_MS })}>
                +1d
              </button>
              <button className="chip-btn" onClick={() => update(i, { ...s, startMs: s.startMs + SYNODIC_MS })} title="+1 Moon month">
                +1m
              </button>
            </div>
            <div className="bars">
              <Bar label="Sunlight" pct={sum.sun.pct} level={sum.sun.level} cls="sun" />
              <Bar label="Earth in view" pct={sum.earth.pct} level={sum.earth.level} cls="earth" />
              <div className="bar-row">
                <span>Longest night</span>
                <span className={`pill ${sum.night.level}`}>
                  {sum.night.hours >= 48 ? `${(sum.night.hours / 24).toFixed(1)} days` : `${sum.night.hours.toFixed(0)} h`}
                </span>
              </div>
            </div>
            <div className="calendar" title="Each square is one day: gold = sunlight, blue line = Earth in view">
              {bins.map((b, d) => (
                <span key={d} style={{ '--s': b.sun.toFixed(2), '--e': b.earth.toFixed(2) } as CSSProperties}>
                  <i />
                </span>
              ))}
            </div>
            <div className="ccard-foot">
              <span className="muted small">{sum.verdict}</span>
              <span className="actions" onClick={(e) => e.stopPropagation()}>
                {scenarios.length < MAX_SCENARIOS && (
                  <button
                    className="link"
                    onClick={() =>
                      p.onScenarios([...scenarios.slice(0, i + 1), { ...s, id: newId() }, ...scenarios.slice(i + 1)])
                    }
                  >
                    copy
                  </button>
                )}
                {scenarios.length > 1 && (
                  <button
                    className="link"
                    onClick={() => {
                      p.onScenarios(scenarios.filter((_, j) => j !== i));
                      if (active >= scenarios.length - 1) p.onActive(Math.max(0, scenarios.length - 2));
                    }}
                  >
                    remove
                  </button>
                )}
              </span>
            </div>
          </div>
        );
      })}
      {scenarios.length < MAX_SCENARIOS && (
        <button
          className="add-card"
          onClick={() => {
            p.onScenarios([...scenarios, { ...scenarios[scenarios.length - 1], id: newId() }]);
            p.onActive(scenarios.length);
          }}
        >
          + Add an option
        </button>
      )}
      <NearbySearch
        scenario={act}
        activeIndex={active}
        scenarioCount={scenarios.length}
        settings={p.settings}
        results={p.candidates}
        onResults={p.onResults}
        onUse={(lat, lon) => update(active, customScenario(lat, lon, act.startMs, act.id))}
        onAdd={(lat, lon) => {
          p.onScenarios([...scenarios, customScenario(lat, lon, act.startMs)]);
          p.onActive(scenarios.length);
        }}
      />
    </div>
  );
});

function Bar({ label, pct, level, cls }: { label: string; pct: number; level: 'good' | 'ok' | 'poor'; cls: string }) {
  return (
    <div className="bar-row">
      <span>{label}</span>
      <div className={`bar ${cls}`}>
        <div style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`pill ${level}`} title={RATING_LABEL[level]}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}
