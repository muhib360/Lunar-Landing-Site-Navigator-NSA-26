import type { CSSProperties } from 'react';
import { SITES, SITE_GROUPS, siteById } from '../core/sites.ts';
import {
  COLORS,
  DAY_MS,
  LABELS,
  MAX_SCENARIOS,
  type Scenario,
  type Settings,
  SYNODIC_MS,
  customScenario,
  fmtLat,
  fmtLon,
  fromInputValue,
  newId,
  scenarioFromSite,
  toInputValue,
} from '../app/state.ts';

interface Props {
  scenarios: Scenario[];
  active: number;
  settings: Settings;
  status: Record<string, string>;
  onActive: (i: number) => void;
  onChange: (scenarios: Scenario[]) => void;
  onSettings: (s: Settings) => void;
}

export function ScenarioPanel({ scenarios, active, settings, status, onActive, onChange, onSettings }: Props) {
  const update = (i: number, s: Scenario) => onChange(scenarios.map((x, j) => (j === i ? s : x)));
  const shift = (i: number, ms: number) => update(i, { ...scenarios[i], startMs: scenarios[i].startMs + ms });

  return (
    <aside className="panel scenarios">
      <h2>Scenarios</h2>
      <p className="hint">Each scenario is a site + start date. Compare up to four side by side.</p>
      {scenarios.map((s, i) => {
        const cat = s.siteId ? siteById(s.siteId) : undefined;
        return (
          <div
            key={s.id}
            className={`scenario ${i === active ? 'active' : ''}`}
            style={{ '--c': COLORS[i] } as CSSProperties}
            onClick={() => onActive(i)}
          >
            <div className="scenario-head">
              <span className="chip">{LABELS[i]}</span>
              <select
                value={s.siteId ?? 'custom'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'custom') update(i, customScenario(s.lat, s.lon, s.startMs, s.id));
                  else update(i, { ...scenarioFromSite(v, s.startMs), id: s.id });
                }}
                aria-label={`Site for scenario ${LABELS[i]}`}
              >
                {SITE_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {SITES.filter((x) => x.group === g).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.approx ? ' (approx.)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value="custom">Custom coordinates…</option>
              </select>
            </div>
            <div className="coords">
              <label>
                Lat
                <NumInput
                  value={s.lat}
                  onCommit={(v) => update(i, customScenario(Math.max(-90, Math.min(90, v)), s.lon, s.startMs, s.id))}
                />
              </label>
              <label>
                Lon °E
                <NumInput value={s.lon} onCommit={(v) => update(i, customScenario(s.lat, v, s.startMs, s.id))} />
              </label>
            </div>
            <div className="coords">
              <label className="wide">
                Start (UTC)
                <input
                  type="datetime-local"
                  value={toInputValue(s.startMs)}
                  onChange={(e) => {
                    const t = fromInputValue(e.target.value);
                    if (Number.isFinite(t)) update(i, { ...s, startMs: t });
                  }}
                />
              </label>
            </div>
            <div className="shift">
              <button onClick={() => shift(i, -SYNODIC_MS)} title="One lunar day (29.5 days) earlier">
                −1 lunation
              </button>
              <button onClick={() => shift(i, -DAY_MS)}>−1 d</button>
              <button onClick={() => shift(i, DAY_MS)}>+1 d</button>
              <button onClick={() => shift(i, SYNODIC_MS)} title="One lunar day (29.5 days) later">
                +1 lunation
              </button>
            </div>
            <div className="scenario-foot">
              <span className="muted">
                {fmtLat(s.lat)} {fmtLon(s.lon)}
                {status[s.id] ? <em> · {status[s.id]}</em> : null}
              </span>
              <span className="actions">
                {scenarios.length < MAX_SCENARIOS && (
                  <button
                    className="link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange([...scenarios.slice(0, i + 1), { ...s, id: newId() }, ...scenarios.slice(i + 1)]);
                    }}
                  >
                    duplicate
                  </button>
                )}
                {scenarios.length > 1 && (
                  <button
                    className="link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(scenarios.filter((_, j) => j !== i));
                      if (active >= scenarios.length - 1) onActive(Math.max(0, scenarios.length - 2));
                    }}
                  >
                    remove
                  </button>
                )}
              </span>
            </div>
            {cat?.note && <p className="note">{cat.note}</p>}
            {cat?.approx && <p className="note">Approximate point within a candidate region.</p>}
          </div>
        );
      })}
      {scenarios.length < MAX_SCENARIOS && (
        <button
          className="add"
          onClick={() => {
            const last = scenarios[scenarios.length - 1];
            onChange([...scenarios, { ...last, id: newId() }]);
            onActive(scenarios.length);
          }}
        >
          + Add scenario
        </button>
      )}

      <h2>Settings</h2>
      <div className="settings">
        <label>
          Window
          <select value={settings.days} onChange={(e) => onSettings({ ...settings, days: +e.target.value })}>
            {[7, 14, 30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <label>
          Time step
          <select value={settings.stepMin} onChange={(e) => onSettings({ ...settings, stepMin: +e.target.value })}>
            {[5, 10, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <label title="Height of the solar array / antenna above the ground. Higher sees over nearby terrain.">
          Mast height
          <select value={settings.mastM} onChange={(e) => onSettings({ ...settings, mastM: +e.target.value })}>
            {[2, 10, 20, 50].map((m) => (
              <option key={m} value={m}>
                {m} m
              </option>
            ))}
          </select>
        </label>
        <label title="Minimum Earth elevation above the terrain for direct-to-Earth comms.">
          Comms margin
          <select
            value={settings.commsMarginDeg}
            onChange={(e) => onSettings({ ...settings, commsMarginDeg: +e.target.value })}
          >
            {[0, 1, 2, 5].map((m) => (
              <option key={m} value={m}>
                {m}° above terrain
              </option>
            ))}
          </select>
        </label>
      </div>
    </aside>
  );
}

/** Number field that commits on Enter or blur, so typing does not trigger terrain work per keystroke. */
function NumInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const shown = +value.toFixed(4);
  return (
    <input
      key={shown}
      type="number"
      step="0.01"
      defaultValue={shown}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      onBlur={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && Math.abs(v - shown) > 1e-9) onCommit(v);
        else e.target.value = String(shown);
      }}
    />
  );
}
