import { useState } from 'react';
import { SITES, SITE_GROUPS, siteById } from '../core/sites.ts';
import { type Scenario, fmtLat, fmtLon } from '../app/state.ts';

interface Props {
  scenario: Scenario;
  onPickSite: (id: string) => void;
}

/** Current site, with a searchable list to change it. Clicking the globe also picks a spot. */
export function SitePicker({ scenario, onPickSite }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const cat = scenario.siteId ? siteById(scenario.siteId) : undefined;
  const match = (s: (typeof SITES)[number]) =>
    !q || `${s.name} ${s.group}`.toLowerCase().includes(q.toLowerCase());

  return (
    <div className="picker">
      <div className="picker-current">
        <div>
          <div className="eyebrow">{cat ? cat.group : 'Your own spot'}</div>
          <div className="site-name">{scenario.name}</div>
          <div className="muted small">
            {fmtLat(scenario.lat)} · {fmtLon(scenario.lon)}
            {cat?.approx ? ' · approximate' : ''}
          </div>
        </div>
        <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Close' : 'Change'}
        </button>
      </div>
      {cat?.note && !open && <p className="note">{cat.note}</p>}
      {open && (
        <div className="picker-list">
          <input
            className="search"
            placeholder="Search sites — Apollo, Artemis, Chang'e…"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
          <p className="muted small">Or close this and click anywhere on the Moon.</p>
          {SITE_GROUPS.map((g) => {
            const list = SITES.filter((s) => s.group === g && match(s));
            if (!list.length) return null;
            return (
              <div key={g} className="picker-group">
                <div className="eyebrow">{g}</div>
                {list.map((s) => (
                  <button
                    key={s.id}
                    className={`picker-item ${s.id === scenario.siteId ? 'on' : ''}`}
                    onClick={() => {
                      onPickSite(s.id);
                      setOpen(false);
                      setQ('');
                    }}
                  >
                    <span>{s.name}</span>
                    <span className="muted small">
                      {fmtLat(s.lat)}
                      {s.approx ? ' ~' : ''}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
