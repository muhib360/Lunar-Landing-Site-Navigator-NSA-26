// Expert level: the full v1 analysis — sky panorama, timeline, comparison table, settings.
import { COLORS, LABELS, type Scenario, type Settings } from '../app/state.ts';
import type { SiteHorizon, Track } from '../core/timeline.ts';
import { CompareTable } from '../components/CompareTable.tsx';
import { Explainers } from '../components/Explainers.tsx';
import { ScenarioPanel } from '../components/ScenarioPanel.tsx';
import { SkyPanorama } from '../components/SkyPanorama.tsx';
import { Timeline } from '../components/Timeline.tsx';

interface Props {
  scenarios: Scenario[];
  tracks: Track[];
  horizons: SiteHorizon[];
  active: number;
  settings: Settings;
  status: Record<string, string>;
  cursorMs: number;
  playing: boolean;
  speed: number;
  onActive: (i: number) => void;
  onScenarios: (s: Scenario[]) => void;
  onSettings: (s: Settings) => void;
  onCursor: (ms: number) => void;
  onPlay: (p: boolean) => void;
  onSpeed: (s: number) => void;
}

export function Expert(p: Props) {
  const at = p.tracks[p.active];
  const idx = Math.max(0, Math.min(at.times.length - 1, Math.round(p.cursorMs / (p.settings.stepMin * 60_000))));
  return (
    <div className="expert">
      <div className="expert-grid">
        <ScenarioPanel
          scenarios={p.scenarios}
          active={p.active}
          settings={p.settings}
          status={p.status}
          onActive={p.onActive}
          onChange={p.onScenarios}
          onSettings={p.onSettings}
        />
        <div className="expert-main">
          <SkyPanorama
            track={at}
            horizon={p.horizons[p.active]}
            index={idx}
            color={COLORS[p.active]}
            label={LABELS[p.active]}
            title={p.scenarios[p.active].name}
          />
          <Timeline
            scenarios={p.scenarios}
            tracks={p.tracks}
            active={p.active}
            days={p.settings.days}
            cursorMs={p.cursorMs}
            playing={p.playing}
            speed={p.speed}
            onCursor={p.onCursor}
            onActive={p.onActive}
            onPlay={p.onPlay}
            onSpeed={p.onSpeed}
          />
          <CompareTable
            scenarios={p.scenarios}
            tracks={p.tracks}
            cursorMs={p.cursorMs}
            days={p.settings.days}
            active={p.active}
            onActive={p.onActive}
          />
          <Explainers scenario={p.scenarios[p.active]} track={at} horizon={p.horizons[p.active]} />
        </div>
      </div>
    </div>
  );
}
