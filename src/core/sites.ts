// Curated landing sites. Coordinates are selenographic (Mean Earth/polar axis), east-positive.
export interface CatalogSite {
  id: string;
  name: string;
  group: SiteGroup;
  lat: number;
  lon: number;
  /** Short note shown in the UI. */
  note?: string;
  /** True when the point is an approximate reference inside a larger region. */
  approx?: boolean;
  source: string;
}

export type SiteGroup = 'Apollo' | 'Robotic landers' | 'Commercial (CLPS)' | 'Artemis III regions' | 'Reference points';

const NSSDC = 'NASA NSSDC lunar artifact table (nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html)';

export const SITES: CatalogSite[] = [
  // Apollo (LM descent stage positions)
  { id: 'a11', name: 'Apollo 11 — Tranquility Base', group: 'Apollo', lat: 0.67416, lon: 23.47314, source: NSSDC },
  { id: 'a12', name: 'Apollo 12 — Ocean of Storms', group: 'Apollo', lat: -3.0128, lon: 336.5781, source: NSSDC },
  { id: 'a14', name: 'Apollo 14 — Fra Mauro', group: 'Apollo', lat: -3.64589, lon: 342.52806, source: NSSDC },
  { id: 'a15', name: 'Apollo 15 — Hadley–Apennine', group: 'Apollo', lat: 26.13239, lon: 3.6333, source: NSSDC },
  { id: 'a16', name: 'Apollo 16 — Descartes', group: 'Apollo', lat: -8.9734, lon: 15.5011, source: NSSDC },
  { id: 'a17', name: 'Apollo 17 — Taurus–Littrow', group: 'Apollo', lat: 20.1911, lon: 30.7723, source: NSSDC },

  // Other nations / robotic
  { id: 'surveyor7', name: 'Surveyor 7 — Tycho', group: 'Robotic landers', lat: -40.9812, lon: 348.4873, source: NSSDC },
  { id: 'lunokhod1', name: 'Luna 17 / Lunokhod 1', group: 'Robotic landers', lat: 38.315, lon: 324.9919, source: NSSDC },
  { id: 'luna24', name: 'Luna 24 — Mare Crisium', group: 'Robotic landers', lat: 12.7142, lon: 62.2129, source: NSSDC },
  { id: 'ce3', name: "Chang'e 3 — Mare Imbrium", group: 'Robotic landers', lat: 44.1214, lon: 340.4883, source: NSSDC },
  { id: 'ce4', name: "Chang'e 4 — Von Kármán (far side)", group: 'Robotic landers', lat: -45.4561, lon: 177.5885, note: 'Far side: Earth never rises — relay satellite required.', source: NSSDC },
  { id: 'ce5', name: "Chang'e 5 — Mons Rümker", group: 'Robotic landers', lat: 43.0576, lon: 308.0839, source: NSSDC },
  { id: 'ce6', name: "Chang'e 6 — Apollo basin (far side)", group: 'Robotic landers', lat: -41.6385, lon: 206.0148, note: 'Far side: Earth never rises — relay satellite required.', source: NSSDC },
  { id: 'ch3', name: 'Chandrayaan-3 — Vikram', group: 'Robotic landers', lat: -69.3741, lon: 32.32, source: NSSDC },
  { id: 'slim', name: 'SLIM — Shioli crater', group: 'Robotic landers', lat: -13.316, lon: 25.251, source: NSSDC },

  // Commercial Lunar Payload Services
  { id: 'im1', name: 'IM-1 Odysseus — Malapert A', group: 'Commercial (CLPS)', lat: -80.13, lon: 1.44, source: NSSDC },
  { id: 'bg1', name: 'Blue Ghost M1 — Mare Crisium', group: 'Commercial (CLPS)', lat: 18.562, lon: 61.81, source: NSSDC },
  { id: 'im2', name: 'IM-2 Athena — Mons Mouton', group: 'Commercial (CLPS)', lat: -84.7906, lon: 29.1957, source: 'IM-2 landing position (LROC / Wikipedia "IM-2")' },

  // Artemis III candidate regions (NASA, Oct 2024). NASA publishes regions, not points.
  { id: 'mons-mouton', name: 'Mons Mouton', group: 'Artemis III regions', lat: -84.6, lon: 31.0, approx: true, note: 'Centre of the massif (IAU feature position).', source: 'IAU Gazetteer feature centre' },
  { id: 'nobile-rim-1', name: 'Nobile Rim 1', group: 'Artemis III regions', lat: -85.295, lon: 36.917, approx: true, note: 'Candidate site NR101 from published site study.', source: 'Wueller et al. 2026, JGR Planets (doi:10.1029/2025JE009434)' },
  { id: 'nobile-rim-2', name: 'Nobile Rim 2', group: 'Artemis III regions', lat: -84.20156, lon: 60.69989, approx: true, note: 'Optimal point from multi-criteria study.', source: 'arXiv:2406.19863' },
  { id: 'malapert', name: 'Malapert Massif', group: 'Artemis III regions', lat: -85.99, lon: 2.09, approx: true, note: 'Massif summit (highest LOLA point, 5.17 km).', source: 'Summit located in LOLA LDEM_75S_240M' },
  { id: 'degerlache-rim', name: 'de Gerlache Rim', group: 'Artemis III regions', lat: -88.5, lon: 293.3, approx: true, note: 'Centre of LROC de Gerlache rim mosaic; region "de Gerlache Rim 2" is nearby.', source: 'LROC NAC_ROI_DEGERRIMLOB centre' },

  // Reference points for teaching
  { id: 'south-pole', name: 'Lunar south pole (90°S)', group: 'Reference points', lat: -90, lon: 0, source: 'Definition' },
  { id: 'shackleton-floor', name: 'Shackleton crater floor', group: 'Reference points', lat: -89.67, lon: 129.78, note: 'Permanently shadowed: the Sun never clears the crater wall.', source: 'IAU Gazetteer crater centre' },
];

export const SITE_GROUPS: SiteGroup[] = ['Apollo', 'Robotic landers', 'Commercial (CLPS)', 'Artemis III regions', 'Reference points'];

export const siteById = (id: string) => SITES.find((s) => s.id === id);
