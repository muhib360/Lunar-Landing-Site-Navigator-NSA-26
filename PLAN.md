# Lunar Landing Site Navigator — Plan v2

NASA Space Apps 2026 challenge: <https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator>

> **Status:** approved 2026‑11‑15; first build done on branch `v2-cesium-moon` (globe, stand-here, three levels, tour). v1 (a working 2D dashboard, commit `3955765`) proved the science.
> v2 rebuilds the experience around a real 3D Moon, with three levels of detail for three kinds of user.
> **Deadline:** about 12 hours from 2026‑11‑15, team project, so the code must stay simple to work on.

## The one question the app answers

> **"If we land *here*, on *this date*, will we have sunlight for power, and can we talk to Earth?"**

Every screen answers that first, in plain words, and shows detail only on request.

## What changes from v1

| Keep (works, invisible to users) | Replace (what people see) |
|---|---|
| Sun/Earth position engine, validated vs JPL Horizons (≤ 0.003°) | The 2D dashboard layout |
| LOLA terrain horizons, catalog sites, nearby‑spot search (Web Worker) | The 360° graph as the main view |
| Data scripts, share links | The map → a 3D globe |

## The experience

### 1. A 3D Moon you can explore (CesiumJS, offline, no account)

- A full-screen globe drawn by **CesiumJS**, which is open source and runs fully offline. We supply
  the Moon ourselves from free NASA data that ships with the app:
  - **Surface photos:** NASA SVS *CGI Moon Kit* LROC colour map
    (<https://svs.gsfc.nasa.gov/4720>), cut into map tiles.
  - **Terrain shape:** the LOLA height maps we already use: 240 m around the south pole and about
    3.8 km elsewhere. Cesium reads them through its built-in `CustomHeightmapTerrainProvider`.
- **No account, no token, no internet needed at the demo.**
- **Optional sharper view:** if someone later adds a free Cesium ion token, the app can switch to
  Cesium's hosted *Cesium Moon* tiles (5 m terrain, 1 m photos at the pole). This is a bonus,
  never required.
- Landing sites appear as pins. Clicking one **flies the camera down** to it.
- **"Stand here"** puts you on the surface at eye level, looking around: real mountains, the Sun
  skimming the ridges, and Earth in the sky. The lighting comes from our validated Sun position,
  so shadows fall where they really would.
- **Time slider** at the bottom, like a video player: drag or press play to watch a month go by.
  The Sun slips behind a mountain and the scene goes dark; Earth dips behind a ridge and a
  "no signal" icon appears.

### 2. Three levels in one app

A switch at the top changes how much detail you see. Underneath it's the same Moon and the same numbers.

| Level | For | What you see |
|---|---|---|
| **Explore** (default) | Public, students, beginners | Globe, "stand here" and the time slider. A plain-English **answer card**: ☀️ Sunlight *Good — up 59% of the month* · 📡 Earth *In view, except 3 days behind a ridge* · 🌙 Longest night *14 days — batteries must last*. Green/amber/red ratings. A **guided tour** (4–5 steps): "Why the south pole?", "Why the Sun stays low", "Why Earth wobbles", "Why mountains matter". |
| **Compare** | Teachers, curious users, quick what‑ifs | Two to four site/date **cards** side by side with simple bars. A **calendar strip** of good and bad days ("launch slipped a week — still OK?"). A **"Find a sunnier spot nearby"** button (v1 search) that drops pins on the globe. |
| **Expert** | Mission planners, judges | v1's graphs, exact numbers, a sunrise/sunset/Earthrise/Earthset event list, settings (mast height, comms margin) and a CSV download. |

- **ⓘ glossary tips** on every technical word (elevation, azimuth, libration, terminator).
- **Plain labels:** "Earth in view", not "DTE comms". "Sun height", not "solar elevation", except in Expert.

### 3. Look and feel

- The 3D scene **fills the screen**. The controls float over it as see-through ("glass") panels, like
  a mission display.
- One characterful font for headings, a clean one for text, and three colours that carry meaning:
  lunar grey, **sun gold** and **Earth blue**.
- Answer first, explanation second; icons over paragraphs.
- Works on a laptop and at phone width; on a phone the globe stays on top and the panels stack below.

## Technical approach (kept simple for the team)

- **Stack:** Vite + React + TypeScript (unchanged) + **CesiumJS 1.147**, used directly through one
  wrapper component. No extra wrapper library: one fewer thing to learn.
- **Cesium setup (offline):** `Ellipsoid.default = Ellipsoid.MOON`. Cesium ion is switched off
  entirely (no default token, no online imagery or geocoder). Earth-only features are turned off
  (atmosphere, Earth sun/moon). Lighting is a `DirectionalLight` aimed from our ephemeris. Sun and
  Earth in the sky are sprites placed along the computed directions; Earth's sprite shows its phase.
- **Moon data (prepared once by a script, then shipped):**
  - Photos: the CGI Moon Kit 8k colour map, cut into a small tile pyramid.
  - Polar close-up: our LOLA south-pole shading, with photos if time allows.
  - Terrain: our existing `polar240.bin` and `global8.bin` through `CustomHeightmapTerrainProvider`.
- **Optional online mode:** if `VITE_CESIUM_ION_TOKEN` is set in `.env.local` (never committed),
  the app uses the hosted Cesium Moon tileset instead. Without it, everything still works.
- **Numbers stay ours:** the answer cards and charts use the validated engine and LOLA horizons,
  never the 3D view, so the numbers are identical on every machine.

```
src/
  core/      engine — unchanged (ephemeris, horizons, timeline, search, sites)
  app/       state, terrain loading, search worker — unchanged
  globe/     NEW: MoonGlobe.tsx (Cesium wrapper), sky.ts (Sun/Earth sprites), lighting.ts, pins.ts
  ui/        NEW: ModeSwitch, AnswerCard, TimeSlider, GlossaryTip, Tour, Panel
  modes/     NEW: Explore.tsx, Compare.tsx, Expert.tsx (Expert reuses v1 components)
```

Each mode is one file built from shared pieces, so teammates can work on different modes without
editing the same files.

## Timeline (≈12 h)

| Hours | Who | Work | Checkpoint |
|---|---|---|---|
| 0–1.5 | Claude | Cesium installed offline; NASA photo tiles + LOLA terrain on the globe; pins; fly‑to | You see the 3D Moon |
| 1.5–3.5 | Claude | "Stand here" camera, Sun lighting from our engine, Sun/Earth sprites, time slider | **Show you: the key moment** |
| 3.5–5.5 | Claude | Explore mode: answer card, ratings, glossary tips, mode switch, glass styling | Beginner flow complete |
| 5.5–7.5 | Claude + team | Compare mode cards, calendar strip, nearby search on the globe; Expert mode re‑homes v1 | All three levels work |
| 7.5–9.5 | Team (content) + Claude | Guided tour text, phone layout, performance pass, README | Feature freeze |
| 9.5–12 | Team | Demo video, Space Apps project page and submission; Claude fixes bugs | **Submitted with buffer** |

If time runs short, drop features from the bottom up: CSV download, then the calendar strip, then
the guided tour. **Never** cut the globe, "stand here" or Explore mode.

## Tasks for teammates (no 3D knowledge needed)

- Guided tour and glossary text: plain words, 1–2 sentences each (`src/ui/Tour.tsx`, `src/ui/glossary.ts`).
- Check the catalog sites and add Artemis III regions with sourced coordinates (`src/core/sites.ts`).
- Demo script and video; the Space Apps submission page.
- Test on their own laptops and phones and report what is confusing.

## Risks and how we handle them

| Risk | Mitigation |
|---|---|
| Offline terrain is coarser (240 m at the pole, ~3.8 km elsewhere) than Cesium's hosted 5 m tiles | Fine for mountains and crater walls, which are what block the Sun. Close-ups look softer. The optional token mode gives sharp close-ups if wanted. |
| The app download gets bigger (photo tiles add ~20–40 MB) | Tiles load on demand as you zoom; only what you look at is downloaded. |
| Cesium is large (several MB) and needs a decent GPU | Load the globe first and the rest after; test on the weakest team laptop. |
| A forum user reports Cesium Moon heights ~2.5 km off vs LOLA (optional online mode only) | Offline mode uses our own LOLA heights, so it is consistent. In online mode, pins and the camera are placed on the tileset's surface. |
| Terrain shadows in Cesium can flicker at low Sun angles | Tune shadow settings early (hour 2). If they stay bad, rely on lighting plus our horizon line drawn in the scene. |

## Needed from you before building

1. **Approval of this plan.** No account or token is needed.

## Data sources

- NASA SVS CGI Moon Kit (LROC colour map, public domain): <https://svs.gsfc.nasa.gov/4720>.
- Optional online mode: Cesium Moon 3D Tiles (Cesium ion asset 2684829),
  <https://cesium.com/platform/cesium-ion/content/cesium-moon/>.
- LOLA GDR DEMs for our horizon calculations: <https://imbrium.mit.edu/DATA/LOLA_GDR/>.
- Landing sites: NASA NSSDC lunar artifact table and published sources (see `src/core/sites.ts`).
- Validation: JPL Horizons API.
