# Lunar Landing Site Navigator — Plan

NASA Space Apps 2026 challenge: <https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator>

**Goal:** a fast, friendly web app for comparing lunar landing **sites** and **dates**. It shows where the
**Sun** and **Earth** sit relative to the **local horizon**, so a user can judge solar power and
direct‑to‑Earth (DTE) communication windows in seconds instead of juggling Quickmap, Moon Trek and
Horizons.

## Who it is for

| User | What they need |
|---|---|
| Mission planner | "The launch slipped 9 days. Is the site still viable? Is a site 5 km away better?" Exact numbers, events, and side‑by‑side comparison. |
| Educator / public | "Why is the south pole so hard?" A sky view that makes the low Sun, the wobbling Earth and the terrain shadows obvious. |

## Key design decisions

1. **Static web app, all computation in the browser.** No backend and no API calls at runtime, so it
   is instant, works offline, and deploys to GitHub Pages. Stack: Vite + React + TypeScript, plain
   SVG/Canvas charts (no heavy chart library).
2. **Ephemeris from [astronomy-engine](https://github.com/cosinekitty/astronomy)** (MIT, pure JS).
   Geocentric Sun and Moon vectors plus the IAU Moon orientation model give Sun and Earth directions
   in the Moon body‑fixed frame. Topocentric parallax is included (it moves Earth by up to ~0.26°).
   **Validated against JPL Horizons** (`coord@301` topocentric observer), with a target error < 0.05°.
3. **Real terrain horizons from LOLA.** The bare-sphere horizon is wrong at the pole, where the Sun
   peaks at about 1.5° and nearby massifs block it. Horizon masks are 720 azimuths (0.5°) computed by
   ray‑marching a LOLA DEM with lunar curvature included:
   - South polar region (lat < −75°): `LDEM_75S_240M` (240 m/px polar stereographic, 29 MB).
   - Elsewhere: `LDEM_16` (16 px/deg ≈ 1.9 km), downsampled for the browser.
   - Curated sites: masks are **precomputed** at build time and shipped as JSON.
   - Custom sites: masks are computed **in a Web Worker** from the shipped DEM, using the same code.
4. **One shared TypeScript core** (`src/core/`) that runs in both the browser and Node (Node 24 strips
   types natively). Build scripts and validation reuse exactly the code the app runs.
5. **Honest data.** Every catalog site carries a source. Artemis III regions are marked approximate,
   because NASA has published region names, not points.

## Metrics per scenario (site + date window)

- Sun: elevation above the terrain horizon, visible fraction of the solar disk, time until the next
  sunset or sunrise, % of the window sunlit, longest continuous sunlight, **longest night**
  (drives battery and heater sizing), and incident flux on a vertical sun‑tracking array and on a
  horizontal panel.
- Earth: elevation above the terrain horizon, time until the next Earthset or Earthrise, % of the
  window visible, and Earth phase as seen from the Moon.
- Combined: % of the window with **both** power and DTE comms.
- Events list: sunrise/sunset and Earthrise/Earthset times, refined by bisection to under a minute.

## UI

- **Scenarios panel (A–D, colour‑coded):** site picker (Apollo, robotic landers, CLPS, Artemis III
  regions, custom lat/lon), date/time, quick shifts (±1 day, ±1 lunation), duplicate.
- **Sky panorama:** 360° strip with the terrain silhouette, Sun and Earth disks drawn to scale, and
  their tracks over the window. This view explains the south pole at a glance.
- **Timeline:** per‑scenario bands for sunlight and Earth visibility, a Sun/Earth elevation curve,
  a shared scrubber and a play button to animate.
- **Comparison table:** all metrics side by side, with the best value highlighted.
- **Map:** south polar hillshade (and a global map) with site markers. Click to drop a custom site.
- **"Why?" explainers:** short notes for the public on the low Sun, libration, and permanent shadow.

## Phases

1. **Core + MVP**: ephemeris core, Horizons validation, site catalog, scenarios, sky panorama,
   timeline, comparison table. Smooth‑sphere horizon as a fallback.
2. **Terrain**: download and convert LOLA data, horizon ray‑marcher, precomputed masks, worker for
   custom sites, hillshade maps.
3. **Polish / stretch**: "best‑lit spot within N km" search, a 3D terrain view (three.js), shareable
   URLs, and a mobile layout.

## Data sources

- LOLA GDR DEMs: <https://imbrium.mit.edu/DATA/LOLA_GDR/> (`POLAR/IMG/LDEM_75S_240M`,
  `CYLINDRICAL/IMG/LDEM_16`, `LDEM_4`).
- Landing sites: NASA NSSDC lunar artifact table
  <https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html>; IM‑2 from LROC / public
  reports; Nobile Rim 2 from arXiv:2406.19863.
- Validation: JPL Horizons API <https://ssd.jpl.nasa.gov/api/horizons.api>.

## Known limitations (to state in the demo)

- 240 m terrain misses boulders and small ridges. Near-field shadows at the metre scale need the
  5–20 m products, which are too large for a browser.
- The horizon assumes an observer height (default 2 m, adjustable). Panels on a mast see further.
- Ephemeris accuracy is about 0.01°. This is irrelevant next to terrain uncertainty, but it is
  documented and validated.
