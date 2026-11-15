# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026 —
[Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator).

Compare lunar landing sites and dates in seconds: where the **Sun** and **Earth** are relative to
the **real terrain horizon**, how long until sunset or Earthset, and how much power and
direct‑to‑Earth comms time each option gives. The design and its reasoning are in [PLAN.md](PLAN.md).

## What it does

A full-screen **3D Moon** (CesiumJS, fully offline, no account needed) with three levels of detail:

| Level | For | What you get |
|---|---|---|
| **Explore** | Everyone | Pick a site (or click the Moon), pick a date, read a plain-English answer: is the Sun up, is Earth in view, how much solar power, how long the night lasts — with green / amber / red ratings. **Stand here** drops you onto the surface to see the real mountains, the Sun and Earth. A guided tour explains the south pole. |
| **Compare** | Teachers, quick what-ifs | Up to four site/date cards with bars and a day-by-day calendar, plus **Better spot nearby?** which searches the surrounding terrain. |
| **Expert** | Mission planners | Sky panorama, timeline, full comparison table, mast height and comms-margin settings. |

The **time bar** at the bottom plays the month like a video: the gold strip is sunlight, the blue strip is Earth in view.

## Code map (for the team)

```
src/core/      science engine — Sun/Earth positions, terrain horizons, metrics (don't need to touch)
src/app/       state (useNavigator.ts), terrain loading, search worker
src/globe/     3D Moon: MoonGlobe.tsx (Cesium), lolaTerrain.ts (LOLA → 3D terrain), sky.ts (Sun/Earth sprites)
src/ui/        shared pieces: AnswerCard, TimeBar, SitePicker, Tour (edit tour text here), glossary.ts (edit definitions here), ratings.ts (rating thresholds)
src/modes/     Explore.tsx, Compare.tsx, Expert.tsx — one file per level
src/components v1 charts used by Expert mode
```

## How it works

| Piece | Source | Notes |
|---|---|---|
| Sun / Earth directions | [Astronomy Engine](https://github.com/cosinekitty/astronomy) + IAU 2015 lunar orientation | Topocentric parallax included. `npm run validate` checks against **JPL Horizons**: worst case **12″ (0.003°)** over a year at 4 sites. |
| Terrain horizon | LRO **LOLA** `LDEM_75S_240M` (240 m, south pole) + `LDEM_16` (global) | 720‑azimuth horizon masks, ray‑marched with lunar curvature. Catalog sites are precomputed; custom sites are computed in the browser. |
| 3D globe | **CesiumJS** (offline) | Terrain tiles are built in the browser from the same LOLA data, with surface normals so mountains are lit and cast shadows from the computed Sun direction. Surface photos: NASA SVS **CGI Moon Kit** (LROC), 682 tiles in `public/moon/`. |
| Visibility | Solar‑disk fraction above the local horizon; Earth "in view" = centre above terrain + comms margin | Rise/set times are refined by bisection to under 20 s. |

All computation runs client‑side: no server, no API keys, works offline once loaded.

## Run it

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` first copies CesiumJS's runtime files into `public/cesium/` (automatic, gitignored).
The processed data in `public/data/`, `public/moon/` and `src/data/horizons.json` is already included. To rebuild it
from the original NASA files (about 64 MB of downloads):

```bash
npm run data:fetch
```

```bash
npm run data:build
```

```bash
node scripts/build-moon-tiles.mjs
```

Validation (needs internet for JPL Horizons):

```bash
npm run validate
```

Production build (static, deployable from any path such as GitHub Pages):

```bash
npm run build
```

## Limitations

- The 240 m terrain misses small features. Metre‑scale shadows need the 5–20 m LOLA products.
- Horizons assume an observer 2 m above the ground (adjustable to 10–50 m in Expert settings).
- The offline 3D terrain is 240 m detail at the pole and ~3.8 km elsewhere, so close-ups look smooth; the photo map fades to grey near the pole where it is too coarse.
- The globe needs a WebGL-capable browser; very old laptops may render slowly.
- Artemis III entries are approximate reference points: NASA publishes regions, not exact sites.
- Earth visibility ignores DSN station availability on Earth.

## Data credits

LOLA GDR (NASA GSFC / MIT, PDS). Landing-site coordinates: NASA NSSDC lunar artifact table, LROC, and
the papers cited in `src/core/sites.ts`. Ephemeris: Astronomy Engine (MIT licence) and JPL Horizons
(for validation).
