// Cesium terrain built from NASA LOLA height maps that ship with the app, so the globe works
// offline. Tiles are generated in a Web Worker (tileMesh.ts) as quantized meshes WITH vertex
// normals, which is what lets Cesium light the mountains from the real Sun direction.
import * as Cesium from 'cesium';
import { POLAR_EDGE_LAT } from '../app/demLoader.ts';
import { TILE_N } from './tileMesh.ts';
import { terrain } from './terrainClient.ts';

// Deepest tile level per region. The LOLA data is ~240 m (pole) / ~3.8 km (elsewhere); a few
// levels beyond that are smooth interpolation, which lets the close-range regolith texture
// (regolith.ts) and fine shading appear near the camera in "Stand here". Only tiles right around
// the camera ever reach these levels.
const POLAR_MAX_LEVEL = 13;
const GLOBAL_MAX_LEVEL = 12;

/**
 * @param onTile called after each tile arrives from the worker — the viewer uses it to redraw
 *               (Cesium's render-on-demand mode doesn't know about our worker otherwise).
 */
export function createLolaTerrain(onTile: () => void): Cesium.TerrainProvider {
  const N = TILE_N;
  const ellipsoid = Cesium.Ellipsoid.MOON;
  const tilingScheme = new Cesium.GeographicTilingScheme({ ellipsoid });
  const levelZeroError = Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(ellipsoid, N, 2);
  const credit = new Cesium.Credit('Terrain: NASA LRO LOLA');

  // Triangle indices and edge lists are identical for every tile.
  const indices = new Uint16Array((N - 1) * (N - 1) * 6);
  let t = 0;
  for (let i = 0; i < N - 1; i++)
    for (let j = 0; j < N - 1; j++) {
      const k = i * N + j;
      indices.set([k, k + 1, k + N, k + 1, k + N + 1, k + N], t);
      t += 6;
    }
  const west: number[] = [], south: number[] = [], east: number[] = [], north: number[] = [];
  for (let i = 0; i < N; i++) {
    west.push(i * N);
    east.push(i * N + N - 1);
    south.push(i);
    north.push((N - 1) * N + i);
  }

  const maxLevelFor = (rect: Cesium.Rectangle) =>
    Cesium.Math.toDegrees(rect.north) <= POLAR_EDGE_LAT ? POLAR_MAX_LEVEL : GLOBAL_MAX_LEVEL;
  const getLevelMaximumGeometricError = (level: number) => levelZeroError / (1 << level);

  async function requestTileGeometry(x: number, y: number, level: number) {
    const rect = tilingScheme.tileXYToRectangle(x, y, level);
    const d = Cesium.Math.toDegrees;
    const m = await terrain().tile(d(rect.west), d(rect.south), d(rect.east), d(rect.north), level);
    const skirt = getLevelMaximumGeometricError(level) * 5;
    const center = new Cesium.Cartesian3(...m.center);
    const data = new Cesium.QuantizedMeshTerrainData({
      quantizedVertices: m.quantizedVertices,
      indices,
      encodedNormals: m.encodedNormals,
      minimumHeight: m.minimumHeight,
      maximumHeight: m.maximumHeight,
      boundingSphere: new Cesium.BoundingSphere(center, m.radius),
      orientedBoundingBox: Cesium.OrientedBoundingBox.fromRectangle(rect, m.minimumHeight, m.maximumHeight, ellipsoid),
      // Placeholder when no culling point exists (very large tiles); cleared below.
      horizonOcclusionPoint: m.horizonPoint ? new Cesium.Cartesian3(...m.horizonPoint) : center,
      westIndices: west,
      southIndices: south,
      eastIndices: east,
      northIndices: north,
      westSkirtHeight: skirt,
      southSkirtHeight: skirt,
      eastSkirtHeight: skirt,
      northSkirtHeight: skirt,
      childTileMask: level + 1 <= maxLevelFor(rect) ? 15 : 0,
      credits: [credit],
    });
    // Without a valid occlusion point the tile must simply never be horizon-culled.
    if (!m.horizonPoint) (data as unknown as { _horizonOcclusionPoint?: unknown })._horizonOcclusionPoint = undefined;
    onTile();
    return data;
  }

  const provider = {
    tilingScheme,
    errorEvent: new Cesium.Event(),
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
