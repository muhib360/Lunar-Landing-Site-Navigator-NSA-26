import type { Scenario } from '../app/state.ts';
import type { SiteHorizon, Track } from '../core/timeline.ts';

interface Props {
  scenario: Scenario;
  track: Track;
  horizon: SiteHorizon;
}

/** Plain-language explanations, filled in with numbers for the active scenario. */
export function Explainers({ scenario, track, horizon }: Props) {
  const lat = scenario.lat;
  const maxSunTheory = 90 - Math.abs(lat) + 1.54;
  let maxMask = -90, maxMaskAz = 0;
  horizon.mask.forEach((v, i) => {
    if (v > maxMask) {
      maxMask = v;
      maxMaskAz = (i * 360) / horizon.mask.length;
    }
  });
  // Time the Sun is above a bare-sphere horizon but hidden by terrain.
  let lostToTerrain = 0;
  for (let i = 0; i < track.times.length; i++) if (track.sunEl[i] > 0 && track.sunFrac[i] < 0.5) lostToTerrain++;
  const lostPct = (100 * lostToTerrain) / track.times.length;
  const m = track.metrics;

  return (
    <section className="panel explain">
      <h2>Why is this hard?</h2>
      <div className="cards">
        <article>
          <h3>The Sun skims the horizon</h3>
          <p>
            The Moon’s spin axis is tilted only 1.5° to the Sun, so at {Math.abs(lat).toFixed(1)}°{lat < 0 ? 'S' : 'N'} the Sun
            can never climb above about <b>{Math.max(0, maxSunTheory).toFixed(1)}°</b>. Here it peaks at{' '}
            <b>{m.maxSunEl.toFixed(1)}°</b> in this window. Near the poles a solar array must stand vertically and turn to
            follow the Sun around the whole horizon.
          </p>
        </article>
        <article>
          <h3>Earth wobbles in the sky</h3>
          <p>
            Earth stays roughly fixed in the lunar sky, but <i>libration</i> makes it wander by ±7°. At this site it moves
            between <b>{m.minEarthEl.toFixed(1)}°</b> and <b>{m.maxEarthEl.toFixed(1)}°</b> elevation, so it is in view{' '}
            <b>{m.earthVisiblePct.toFixed(0)}%</b> of the time.{' '}
            {m.maxEarthEl < 0 ? 'This site is on the far side: talking to Earth needs a relay satellite.' : ''}
          </p>
        </article>
        <article>
          <h3>Terrain decides everything</h3>
          <p>
            The highest point on this site’s horizon is <b>{maxMask.toFixed(1)}°</b> high, toward azimuth{' '}
            {maxMaskAz.toFixed(0)}°. Mountains and crater walls hide the Sun <b>{lostPct.toFixed(0)}%</b> of the time when a
            flat Moon would have it up. Moving a few kilometres onto a ridge, or a few days in time, can turn a dark site
            into a sunny one.
          </p>
        </article>
      </div>
    </section>
  );
}
