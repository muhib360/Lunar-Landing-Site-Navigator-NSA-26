// Cesium terrain built from NASA LOLA height maps that ship with the app, so the globe works
// offline. Tiles are generated on the fly as quantized meshes WITH vertex normals, which is what
// lets Cesium light the mountains and crater walls from the real Sun direction.
import * as Cesium from 'cesium';
import type { Dem } from '../core/dem.ts';

const N = 33; // vertices per tile edge
const POLAR_EDGE_LAT = -75.3; // polar DEM covers lat ≤ −75°
const POLAR_MAX_LEVEL = 10; // ~240 m cells
const GLOBAL_MAX_LEVEL = 6; // ~3.8 km cells

// Not in Cesium's public type definitions, but exported at runtime.
const { AttributeCompression, EllipsoidalOccluder } = Cesium as unknown as {
  AttributeCompression: { octEncode(v: Cesium.Cartesian3, r: Cesium.Cartesian2): Cesium.Cartesian2 };
  EllipsoidalOccluder: new (e: Cesium.Ellipsoid) => {
    computeHorizonCullingPointPossiblyUnderEllipsoid(
      dir: Cesium.Cartesian3,
      pts: Cesium.Cartesian3[],
      minimumHeight: number,
      r?: Cesium.Cartesian3,
    ): Cesium.Cartesian3 | undefined;
  };
};

export interface LolaDems {
  global: Dem;
  polar?: Dem;
}

/** Terrain height in metres above the 1737.4 km sphere. */
export function heightM(dems: LolaDems, latDeg: number, lonDeg: number): number {
  if (dems.polar && latDeg <= POLAR_EDGE_LAT) {
    const h = dems.polar.height(latDeg, lonDeg);
    if (!Number.isNaN(h)) return h * 1000;
  }
  const h = dems.global.height(Math.max(-89.99, Math.min(89.99, latDeg)), lonDeg);
  return Number.isNaN(h) ? 0 : h * 1000;
}

export function createLolaTerrain(dems: LolaDems): Cesium.TerrainProvider {
  const ellipsoid = Cesium.Ellipsoid.MOON;
  const tilingScheme = new Cesium.GeographicTilingScheme({ ellipsoid });
  const levelZeroError = Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(ellipsoid, N, 2);
  const occluder = new EllipsoidalOccluder(ellipsoid);
  const errorEvent = new Cesium.Event();
  const credit = new Cesium.Credit('Terrain: NASA LRO LOLA');

  const maxLevelFor = (rect: Cesium.Rectangle) =>
    dems.polar && Cesium.Math.toDegrees(rect.north) <= POLAR_EDGE_LAT ? POLAR_MAX_LEVEL : GLOBAL_MAX_LEVEL;

  const getLevelMaximumGeometricError = (level: number) => levelZeroError / (1 << level);

  function requestTileGeometry(x: number, y: number, level: number) {
    const rect = tilingScheme.tileXYToRectangle(x, y, level);
    const west = Cesium.Math.toDegrees(rect.west);
    const south = Cesium.Math.toDegrees(rect.south);
    const dLon = Cesium.Math.toDegrees(rect.width) / (N - 1);
    const dLat = Cesium.Math.toDegrees(rect.height) / (N - 1);

    // Heights on an (N+2)² grid: one extra ring so normals are seamless across tiles.
    const M = N + 2;
    const hgrid = new Float64Array(M * M);
    for (let i = 0; i < M; i++) {
      const lat = Math.max(-90, Math.min(90, south + (i - 1) * dLat));
      for (let j = 0; j < M; j++) hgrid[i * M + j] = heightM(dems, lat, west + (j - 1) * dLon);
    }
    const pos = (i: number, j: number, out: Cesium.Cartesian3) => {
      const lat = Math.max(-90, Math.min(90, south + (i - 1) * dLat));
      return Cesium.Cartesian3.fromDegrees(west + (j - 1) * dLon, lat, hgrid[i * M + j], ellipsoid, out);
    };

    const n = N * N;
    let minH = Infinity, maxH = -Infinity;
    for (let i = 1; i <= N; i++)
      for (let j = 1; j <= N; j++) {
        const h = hgrid[i * M + j];
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    if (maxH - minH < 1) maxH = minH + 1;

    const qv = new Uint16Array(3 * n);
    const normals = new Uint8Array(2 * n);
    const positions: Cesium.Cartesian3[] = [];
    const a = new Cesium.Cartesian3(), b = new Cesium.Cartesian3(), c = new Cesium.Cartesian3(), d = new Cesium.Cartesian3();
    const e = new Cesium.Cartesian3(), nn = new Cesium.Cartesian3(), up = new Cesium.Cartesian3();
    const oct = new Cesium.Cartesian2();
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const k = i * N + j;
        const gi = i + 1, gj = j + 1;
        qv[k] = Math.round((j / (N - 1)) * 32767);
        qv[n + k] = Math.round((i / (N - 1)) * 32767);
        qv[2 * n + k] = Math.round(((hgrid[gi * M + gj] - minH) / (maxH - minH)) * 32767);
        positions.push(pos(gi, gj, new Cesium.Cartesian3()));
        // normal = (east difference) × (north difference)
        Cesium.Cartesian3.subtract(pos(gi, gj + 1, a), pos(gi, gj - 1, b), e);
        Cesium.Cartesian3.subtract(pos(gi + 1, gj, c), pos(gi - 1, gj, d), nn);
        Cesium.Cartesian3.cross(e, nn, up);
        if (Cesium.Cartesian3.magnitudeSquared(up) < 1e-12) ellipsoid.geodeticSurfaceNormal(positions[k], up);
        Cesium.Cartesian3.normalize(up, up);
        AttributeCompression.octEncode(up, oct);
        normals[2 * k] = oct.x;
        normals[2 * k + 1] = oct.y;
      }

    const indices = new Uint16Array((N - 1) * (N - 1) * 6);
    let t = 0;
    for (let i = 0; i < N - 1; i++)
      for (let j = 0; j < N - 1; j++) {
        const k = i * N + j;
        indices[t++] = k;
        indices[t++] = k + 1;
        indices[t++] = k + N;
        indices[t++] = k + 1;
        indices[t++] = k + N + 1;
        indices[t++] = k + N;
      }
    const west_ = [], south_ = [], east_ = [], north_ = [];
    for (let i = 0; i < N; i++) {
      west_.push(i * N);
      east_.push(i * N + N - 1);
      south_.push(i);
      north_.push((N - 1) * N + i);
    }

    const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
    const orientedBoundingBox = Cesium.OrientedBoundingBox.fromRectangle(rect, minH, maxH, ellipsoid);
    const horizonOcclusionPoint = occluder.computeHorizonCullingPointPossiblyUnderEllipsoid(boundingSphere.center, positions, minH);
    const skirt = getLevelMaximumGeometricError(level) * 5;
    const childLevelOk = level + 1 <= maxLevelFor(rect);

    const data = new Cesium.QuantizedMeshTerrainData({
      quantizedVertices: qv,
      indices,
      encodedNormals: normals,
      minimumHeight: minH,
      maximumHeight: maxH,
      boundingSphere,
      orientedBoundingBox,
      // Placeholder when Cesium can't compute one (very large tiles); cleared below.
      horizonOcclusionPoint: horizonOcclusionPoint ?? boundingSphere.center,
      westIndices: west_,
      southIndices: south_,
      eastIndices: east_,
      northIndices: north_,
      westSkirtHeight: skirt,
      southSkirtHeight: skirt,
      eastSkirtHeight: skirt,
      northSkirtHeight: skirt,
      childTileMask: childLevelOk ? 15 : 0,
      credits: [credit],
    });
    // Without a valid occlusion point the tile must simply never be horizon-culled.
    if (!horizonOcclusionPoint) (data as unknown as { _horizonOcclusionPoint?: unknown })._horizonOcclusionPoint = undefined;
    return Promise.resolve(data);
  }

  const provider = {
    tilingScheme,
    errorEvent,
    credit,
    hasWaterMask: false,
    hasVertexNormals: true,
    availability: undefined,
    ready: true,
    readyPromise: Promise.resolve(true),
    requestTileGeometry,
    getLevelMaximumGeometricError,
    getTileDataAvailable: (x: number, y: number, level: number) =>
      level <= maxLevelFor(tilingScheme.tileXYToRectangle(x, y, level)),
    loadTileDataAvailability: () => undefined,
  };
  return provider as unknown as Cesium.TerrainProvider;
}
