// Sun and Earth as sprites in the 3D sky, drawn at their true angular size (Sun with a glow so
// it is easy to spot) and positioned from our validated ephemeris. Terrain hides them naturally
// because the sprites sit far behind any mountain on the line of sight.
import * as Cesium from 'cesium';
import type { MoonFrame } from '../core/ephemeris.ts';
import { EARTH_RADIUS_KM, SUN_RADIUS_KM } from '../core/ephemeris.ts';

const SPRITE_DIST_M = 2_000_000;
const PHASE_STEPS = 24;
const SUN_CORE_FRACTION = 0.18; // the solar disk's share of the sprite image width

function sunImage(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = 128;
  const glow = g.createRadialGradient(r, r, 0, r, r, r);
  glow.addColorStop(0, 'rgba(255,255,245,1)');
  glow.addColorStop(SUN_CORE_FRACTION / 2, 'rgba(255,250,225,1)');
  glow.addColorStop(SUN_CORE_FRACTION / 2 + 0.02, 'rgba(255,214,120,0.55)');
  glow.addColorStop(0.45, 'rgba(255,190,90,0.12)');
  glow.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 256, 256);
  return c;
}

/** Earth disk with the lit side towards +x; k = illuminated fraction (0..1). */
function earthImage(k: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = 60;
  g.translate(64, 64);
  // Night side: faint so the disk is still readable against black sky.
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(30,50,85,0.9)';
  g.fill();
  // Lit side: right half-disk plus/minus an elliptical terminator.
  const rx = Math.abs(1 - 2 * k) * r;
  g.beginPath();
  g.moveTo(0, -r);
  g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  g.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, k > 0.5);
  g.closePath();
  const ocean = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  ocean.addColorStop(0, '#9fdcff');
  ocean.addColorStop(0.6, '#3a8fd6');
  ocean.addColorStop(1, '#1b4f8a');
  g.fillStyle = ocean;
  g.fill();
  // A few soft "clouds" for a recognisable Earth.
  g.save();
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (const [x, y, w, h] of [[-20, -30, 34, 9], [10, -8, 40, 8], [-35, 18, 30, 7], [12, 32, 26, 6]]) {
    g.beginPath();
    g.ellipse(x, y, w / 2, h / 2, 0.2, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(140,200,255,0.6)';
  g.lineWidth = 2;
  g.stroke();
  return c;
}

export class SkySprites {
  private sun: Cesium.Billboard;
  private earth: Cesium.Billboard;
  private lastPhase = -1;
  private frame: MoonFrame | null = null;
  show = false;

  private scene: Cesium.Scene;

  constructor(scene: Cesium.Scene) {
    this.scene = scene;
    const coll = scene.primitives.add(new Cesium.BillboardCollection({ scene })) as Cesium.BillboardCollection;
    // Cesium hides objects it thinks are behind the Moon using a sphere at the lowest terrain height.
    // When you stand at a site below the Moon's reference radius (e.g. Apollo 11, 1.9 km below), that
    // test wrongly hides the whole sky. Turn it off for these two sprites only: real mountains still
    // hide them through the normal depth test. (_colorCommands is internal to Cesium 1.147.)
    const internal = coll as unknown as {
      update(frameState: unknown): void;
      _colorCommands?: { occlude: boolean }[];
    };
    const update = internal.update.bind(coll);
    internal.update = (frameState) => {
      update(frameState);
      for (const c of internal._colorCommands ?? []) c.occlude = false;
    };
    this.sun = coll.add({ image: sunImage(), show: false, position: Cesium.Cartesian3.ZERO });
    this.earth = coll.add({ image: earthImage(0.5), show: false, position: Cesium.Cartesian3.ZERO });
  }

  setFrame(f: MoonFrame) {
    this.frame = f;
    // Earth's phase is drawn in 24 steps and each step's image is cached by id, so playback
    // reuses textures instead of uploading a new one every frame.
    const step = Math.round(f.earthPhase * PHASE_STEPS);
    if (step !== this.lastPhase) {
      this.lastPhase = step;
      this.earth.setImage(`earth-phase-${step}`, earthImage(step / PHASE_STEPS));
    }
  }

  /** Call before every render: keeps sprites pinned to the sky as the camera moves. */
  update() {
    const f = this.frame;
    const cam = this.scene.camera;
    this.sun.show = this.earth.show = this.show && !!f;
    if (!this.show || !f) return;
    const camPos = cam.positionWC;
    const canvasH = this.scene.canvas.clientHeight || 600;
    const fovy = (cam.frustum as Cesium.PerspectiveFrustum).fovy ?? 1;
    const place = (bodyKm: [number, number, number], radiusKm: number, bb: Cesium.Billboard, scale: number, minPx: number) => {
      const body = new Cesium.Cartesian3(bodyKm[0] * 1000, bodyKm[1] * 1000, bodyKm[2] * 1000);
      const d = Cesium.Cartesian3.subtract(body, camPos, new Cesium.Cartesian3());
      const dist = Cesium.Cartesian3.magnitude(d);
      Cesium.Cartesian3.multiplyByScalar(d, SPRITE_DIST_M / dist, d);
      bb.position = Cesium.Cartesian3.add(camPos, d, new Cesium.Cartesian3());
      const angDiam = (2 * radiusKm * 1000) / dist;
      const px = Math.max(minPx, (angDiam / fovy) * canvasH * scale);
      bb.width = px;
      bb.height = px;
      return bb.position;
    };
    const sunPos = place(f.sun, SUN_RADIUS_KM, this.sun, 1 / SUN_CORE_FRACTION, 72);
    // Earth is drawn at least ~26 px so it is easy to find (true size is ~2° across).
    const earthPos = place(f.earth, EARTH_RADIUS_KM, this.earth, 128 / 120, 26);
    // Turn Earth's lit side towards the Sun on screen.
    const a = Cesium.SceneTransforms.worldToWindowCoordinates(this.scene, sunPos);
    const b = Cesium.SceneTransforms.worldToWindowCoordinates(this.scene, earthPos);
    if (a && b) this.earth.rotation = Math.atan2(-(a.y - b.y), a.x - b.x);
  }
}
