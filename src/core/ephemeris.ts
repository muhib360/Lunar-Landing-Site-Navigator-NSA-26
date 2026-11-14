// Sun and Earth directions as seen from a point on the lunar surface.
//
// Geocentric Sun/Moon vectors come from astronomy-engine (VSOP87 / ELP-based models), and the
// Moon's orientation from the IAU WGCCRE 2015 rotation model, which approximates the
// Mean-Earth/polar-axis frame that LOLA maps use. Results are validated against JPL Horizons
// in scripts/validate-ephemeris.ts.
import { Body, GeoMoon, GeoVector, MakeTime, RotationAxis } from 'astronomy-engine';
import { type Vec3, DEG, RAD, cross, dot, enuBasis, norm, scale, sub, unit } from './vec.ts';

export const AU_KM = 149_597_870.7;
export const MOON_RADIUS_KM = 1737.4;
export const SUN_RADIUS_KM = 695_700;
export const EARTH_RADIUS_KM = 6371.0;
export const SOLAR_CONSTANT = 1361; // W/m² at 1 AU

/** Site-independent geometry at one instant, in the Moon body-fixed frame (km). */
export interface MoonFrame {
  t: number; // ms since epoch (UTC)
  sun: Vec3; // Moon centre → Sun
  earth: Vec3; // Moon centre → Earth
  /** Fraction of Earth's disk that is sunlit, as seen from the Moon (0..1). */
  earthPhase: number;
}

export function moonFrame(date: Date | number): MoonFrame {
  const time = MakeTime(new Date(date));
  const m = GeoMoon(time);
  const s = GeoVector(Body.Sun, time, true);
  const moon: Vec3 = [m.x * AU_KM, m.y * AU_KM, m.z * AU_KM];
  const sunGeo: Vec3 = [s.x * AU_KM, s.y * AU_KM, s.z * AU_KM];

  // Build the body-fixed axes from the IAU pole and prime-meridian angle W.
  const axis = RotationAxis(Body.Moon, time);
  const pole = unit([axis.north.x, axis.north.y, axis.north.z]);
  const node = unit(cross([0, 0, 1], pole)); // ascending node of lunar equator on ICRF equator
  const q = cross(pole, node);
  const w = axis.spin * DEG;
  const xb: Vec3 = [
    Math.cos(w) * node[0] + Math.sin(w) * q[0],
    Math.cos(w) * node[1] + Math.sin(w) * q[1],
    Math.cos(w) * node[2] + Math.sin(w) * q[2],
  ];
  const yb = cross(pole, xb);
  const toBF = (v: Vec3): Vec3 => [dot(v, xb), dot(v, yb), dot(v, pole)];

  const cosPhase = dot(sunGeo, moon) / (norm(sunGeo) * norm(moon));
  return {
    t: +date,
    sun: toBF(sub(sunGeo, moon)),
    earth: toBF(scale(moon, -1)),
    earthPhase: (1 + cosPhase) / 2,
  };
}

export interface Site {
  lat: number; // deg, selenographic, north-positive
  lon: number; // deg, east-positive
  /** Height of the observer above the reference sphere (km). Terrain height + mast. */
  heightKm: number;
}

export interface TopoPosition {
  az: number; // deg from north, clockwise (east = 90)
  el: number; // deg above the local horizontal plane (geometric, no terrain)
  distKm: number;
  radiusDeg: number; // apparent angular radius
}

export function topocentric(site: Site, target: Vec3, bodyRadiusKm: number): TopoPosition {
  const { e, n, u } = enuBasis(site.lat, site.lon);
  const obs = scale(u, MOON_RADIUS_KM + site.heightKm);
  const d = sub(target, obs);
  const dist = norm(d);
  const el = Math.asin(dot(d, u) / dist) * RAD;
  let az = Math.atan2(dot(d, e), dot(d, n)) * RAD;
  if (az < 0) az += 360;
  return { az, el, distKm: dist, radiusDeg: Math.asin(bodyRadiusKm / dist) * RAD };
}

export function sunAndEarth(site: Site, frame: MoonFrame) {
  return {
    sun: topocentric(site, frame.sun, SUN_RADIUS_KM),
    earth: topocentric(site, frame.earth, EARTH_RADIUS_KM),
  };
}
