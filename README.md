# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026 —
[Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator).

Compare lunar landing sites and dates in seconds: where the **Sun** and **Earth** are relative to
the **real terrain horizon**, how long until sunset or Earthset, and how much power and
direct‑to‑Earth comms time each option gives. The design and its reasoning are in [PLAN.md](PLAN.md).

## Features

- **Up to 4 scenarios** (site + start date) side by side. Pick a catalog site (Apollo, robotic
  landers, CLPS, Artemis III regions) or enter any coordinates or click the map. Quick buttons
  shift a scenario by ±1 day or ±1 lunation.
- **Sky panorama:** 360° view from the site with the LOLA terrain silhouette, the Sun and Earth (with
  Earth's phase), and their paths over the whole window.
- **Timeline:** sunlight and Earth‑visibility bands for every scenario, plus elevation above terrain.
  Scrub it or press play.
- **Comparison table:** status at the cursor time (next sunset/Earthset, elevation above terrain,
  panel flux) and window totals (sunlight %, Earth‑in‑view %, both at once, longest night,
  mean power). The best value in each row is highlighted.
- **Better spot nearby?** Scores a grid of points within 2–20 km by sunlight, by sunlight plus Earth,
  or by shortest night, runs in a Web Worker, and plots the results on the map.
- **"Why is this hard?"** Plain‑language notes for educators, filled with the active site's numbers.
- **Share link:** the URL encodes all scenarios and settings.

## How it works

| Piece | Source | Notes |
|---|---|---|
| Sun / Earth directions | [Astronomy Engine](https://github.com/cosinekitty/astronomy) + IAU 2015 lunar orientation | Topocentric parallax included. `npm run validate` checks against **JPL Horizons**: worst case **12″ (0.003°)** over a year at 4 sites. |
| Terrain horizon | LRO **LOLA** `LDEM_75S_240M` (240 m, south pole) + `LDEM_16` (global) | 720‑azimuth horizon masks, ray‑marched with lunar curvature. Catalog sites are precomputed; custom sites are computed in the browser. |
| Visibility | Solar‑disk fraction above the local horizon; Earth "in view" = centre above terrain + comms margin | Rise/set times are refined by bisection to under 20 s. |

All computation runs client‑side: no server, works offline once loaded.

## Run it

```bash
npm install
```

```bash
npm run dev
```

The processed data in `public/data/` and `src/data/horizons.json` is already included. To rebuild it
from the original NASA files (about 64 MB of downloads):

```bash
npm run data:fetch
```

```bash
npm run data:build
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
- Horizons assume an observer 2 m above the ground (adjustable to 10–50 m in Settings).
- Artemis III entries are approximate reference points: NASA publishes regions, not exact sites.
- Earth visibility ignores DSN station availability on Earth.

## Data credits

LOLA GDR (NASA GSFC / MIT, PDS). Landing-site coordinates: NASA NSSDC lunar artifact table, LROC, and
the papers cited in `src/core/sites.ts`. Ephemeris: Astronomy Engine (MIT licence) and JPL Horizons
(for validation).
