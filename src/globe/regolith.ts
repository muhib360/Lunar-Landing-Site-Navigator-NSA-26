// Close-range ground texture: fine speckle and tiny craters, like lunar regolith in lander photos.
// A handful of 256 px textures are drawn once and reused for every map tile, so it costs almost
// nothing. Map tiles get narrower east–west towards the poles, so each latitude band uses a
// texture pre-stretched sideways by 1/cos(latitude) — features then look round on the ground.
// The layer only appears when you are near the ground (see minimumTerrainLevel where it is added).
import * as Cesium from 'cesium';

const SIZE = 256;
const VARIANTS = 4;

/** Small deterministic random generator so the pattern is the same every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Draws the pattern on a canvas `1/stretch` as wide, then stretches it to SIZE×SIZE. */
function drawRegolith(seed: number, stretch: number): HTMLCanvasElement {
  const base = drawPattern(seed, Math.max(16, Math.round(SIZE / stretch)));
  if (base.width === SIZE) return base;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  c.getContext('2d')!.drawImage(base, 0, 0, SIZE, SIZE);
  return c;
}

function drawPattern(seed: number, width: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = SIZE;
  const g = c.getContext('2d')!;
  const r = rng(seed);
  // Base: transparent, so the darker/lighter marks just modulate the ground below.
  // 1) fine speckle (dust and pebbles)
  const img = g.createImageData(width, SIZE);
  for (let i = 0; i < width * SIZE; i++) {
    const v = r();
    const o = i * 4;
    if (v < 0.22) {
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 20; // dark grain
      img.data[o + 3] = 60 + r() * 60;
    } else if (v > 0.9) {
      img.data[o] = 235;
      img.data[o + 1] = 228;
      img.data[o + 2] = 215; // bright grain
      img.data[o + 3] = 40 + r() * 50;
    }
  }
  g.putImageData(img, 0, 0);
  // 2) soft blotches (albedo variation)
  const area = (width / SIZE); // fewer features on narrower canvases keeps density constant
  for (let k = 0; k < Math.ceil(14 * area); k++) {
    const x = r() * width, y = r() * SIZE, rad = 20 + r() * 50;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.6;
    grad.addColorStop(0, dark ? 'rgba(25,22,20,0.22)' : 'rgba(240,232,220,0.16)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // 3) small craters: bright raised rim, darker floor (no directional shading — the real Sun
  //    lighting of the terrain handles that)
  for (let k = 0; k < Math.ceil(9 * area); k++) {
    const x = r() * width, y = r() * SIZE, rad = 4 + r() ** 2 * 26;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fillStyle = 'rgba(20,18,16,0.20)';
    g.fill();
    g.lineWidth = Math.max(1, rad * 0.22);
    g.strokeStyle = 'rgba(240,232,220,0.28)';
    g.stroke();
  }
  return c;
}

export function regolithProvider(): Cesium.ImageryProvider {
  const tilingScheme = new Cesium.GeographicTilingScheme({ ellipsoid: Cesium.Ellipsoid.MOON });
  // Cache: one set of VARIANTS textures per stretch bucket (1, 2, 4, 8, 16), drawn on first use.
  const cache = new Map<number, HTMLCanvasElement[]>();
  const texturesFor = (stretch: number) => {
    let t = cache.get(stretch);
    if (!t) {
      t = Array.from({ length: VARIANTS }, (_, i) => drawRegolith(1234 + i * 977, stretch));
      cache.set(stretch, t);
    }
    return t;
  };
  const provider = {
    tilingScheme,
    rectangle: tilingScheme.rectangle,
    tileWidth: SIZE,
    tileHeight: SIZE,
    minimumLevel: 0,
    maximumLevel: 22,
    ready: true,
    readyPromise: Promise.resolve(true),
    hasAlphaChannel: true,
    errorEvent: new Cesium.Event(),
    credit: undefined,
    tileDiscardPolicy: undefined,
    proxy: undefined,
    getTileCredits: () => undefined,
    pickFeatures: () => undefined,
    // Same few textures everywhere, picked by tile position so neighbours differ.
    requestImage: (x: number, y: number, level: number) => {
      const rect = tilingScheme.tileXYToRectangle(x, y, level);
      const cosLat = Math.max(1 / 16, Math.cos((rect.north + rect.south) / 2));
      const stretch = Math.min(16, 2 ** Math.round(Math.log2(1 / cosLat)));
      return Promise.resolve(texturesFor(stretch)[(x * 7 + y * 13 + level * 3) % VARIANTS]);
    },
  };
  return provider as unknown as Cesium.ImageryProvider;
}
