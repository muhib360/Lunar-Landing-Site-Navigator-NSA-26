// A field of boulders around the observer in "Stand here". They sell the scale of the scene and,
// with the low polar Sun, cast long shadows. All rocks are one Cesium primitive (one draw call).
import * as Cesium from 'cesium';
import { terrain } from './terrainClient.ts';

const COUNT = 140;
const RADIUS_M = 450;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Places rocks around (lat, lon). Returns the primitive (caller adds/removes it from the scene). */
export async function createBoulderField(lat: number, lon: number): Promise<Cesium.Primitive> {
  const r = rng(Math.round((lat + 90) * 1e4) * 31 + Math.round((lon + 360) * 1e4));
  const ellipsoid = Cesium.Ellipsoid.MOON;
  const mPerDegLat = (Math.PI / 180) * ellipsoid.maximumRadius;
  const mPerDegLon = mPerDegLat * Math.max(0.02, Math.cos(Cesium.Math.toRadians(lat)));

  // Positions: denser near the observer, never right on top of the camera.
  const rocks: { lat: number; lon: number; size: number; heading: number; squash: [number, number, number] }[] = [];
  for (let i = 0; i < COUNT; i++) {
    const d = 6 + RADIUS_M * r() ** 1.6;
    const a = r() * Math.PI * 2;
    const north = Math.cos(a) * d, east = Math.sin(a) * d;
    // Mostly pebbles and small rocks, a few big boulders (power-law sizes, 0.15–3 m).
    const size = 0.15 + 2.85 * r() ** 4;
    rocks.push({
      lat: lat + north / mPerDegLat,
      lon: lon + east / mPerDegLon,
      size,
      heading: r() * Math.PI * 2,
      squash: [0.7 + r() * 0.6, 0.6 + r() * 0.6, 0.35 + r() * 0.35],
    });
  }

  // Ground height under each rock from the terrain worker (exact LOLA data).
  const h = await terrain().heights(rocks.map((k) => [k.lat, k.lon]));

  const instances = rocks.map((k, i) => {
    const base = Cesium.Cartesian3.fromDegrees(k.lon, k.lat, h[i] - k.size * k.squash[2] * 0.35, ellipsoid);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(base, ellipsoid);
    const rot = Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromRotationZ(k.heading));
    const model = Cesium.Matrix4.multiply(enu, rot, new Cesium.Matrix4());
    const shade = 0.42 + r() * 0.2;
    return new Cesium.GeometryInstance({
      geometry: new Cesium.EllipsoidGeometry({
        radii: new Cesium.Cartesian3(k.size * k.squash[0], k.size * k.squash[1], k.size * k.squash[2]),
        stackPartitions: 7,
        slicePartitions: 9,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      modelMatrix: model,
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(new Cesium.Color(shade, shade * 0.97, shade * 0.92, 1)),
      },
    });
  });

  return new Cesium.Primitive({
    geometryInstances: instances,
    appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false, closed: true }),
    shadows: Cesium.ShadowMode.ENABLED,
    asynchronous: true, // geometry is built in Cesium's own workers
  });
}
