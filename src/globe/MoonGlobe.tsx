// The 3D Moon. CesiumJS running fully offline: NASA LROC colour tiles + LOLA terrain shipped with
// the app, lit by a Sun whose direction comes from our validated ephemeris.
//
// Two camera modes:
//   orbit   — spin/zoom the globe, click pins or anywhere to pick a site
//   surface — stand at the site at eye level and drag to look around
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useEffect, useRef, useState } from 'react';
import { moonFrame } from '../core/ephemeris.ts';
import { createBoulderField } from './boulders.ts';
import { createLolaTerrain } from './lolaTerrain.ts';
import { regolithProvider } from './regolith.ts';
import { SkySprites } from './sky.ts';
import { terrain } from './terrainClient.ts';

export interface GlobePin {
  id: string;
  lat: number;
  lon: number;
  label: string;
  color: string;
  /** 'site' = catalog pin, 'scenario' = A/B/C/D marker, 'candidate' = nearby-search result. */
  kind: 'site' | 'scenario' | 'candidate';
  size?: number;
}

export type CameraMode = 'orbit' | 'surface';

interface Props {
  timeMs: number;
  pins: GlobePin[];
  /** Change `key` to fly the camera to this point. */
  focus: { lat: number; lon: number; key: string } | null;
  mode: CameraMode;
  /** Site to stand at in surface mode, and where to look: azimuth (deg from north) and elevation (deg). */
  surface: { lat: number; lon: number; lookAz: number; lookEl: number; key: string } | null;
  eyeHeightM?: number;
  onPickPin: (id: string) => void;
  onPickPoint: (lat: number, lon: number) => void;
  onReady?: () => void;
}

const base = import.meta.env.BASE_URL;
// Look-around limits in surface mode: a little below the horizon up to almost straight overhead.
const MIN_PITCH = Cesium.Math.toRadians(-60);
const MAX_PITCH = Cesium.Math.toRadians(89);
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON;
Cesium.Ion.defaultAccessToken = ''; // offline: never call Cesium ion

export function MoonGlobe(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const skyRef = useRef<SkySprites | null>(null);
  const look = useRef({ heading: 0, pitch: Cesium.Math.toRadians(4) });
  const surfaceGround = useRef<{ key: string; h: number; exact: boolean } | null>(null);
  const flying = useRef(false);
  const boulders = useRef<{ key: string; prim: Cesium.Primitive | null } | null>(null);
  const [pinHeights, setPinHeights] = useState<Float64Array | null>(null);
  const props = useRef(p);
  useEffect(() => {
    props.current = p;
  });

  // ---- create the viewer once ----
  useEffect(() => {
    const ellipsoid = Cesium.Ellipsoid.MOON;
    const imagery = new Cesium.UrlTemplateImageryProvider({
      url: `${base}moon/{z}/{x}/{y}.jpg`,
      tilingScheme: new Cesium.GeographicTilingScheme({ ellipsoid }),
      maximumLevel: 4,
      credit: new Cesium.Credit('Imagery: NASA SVS CGI Moon Kit (LRO LROC)'),
    });
    const viewer = new Cesium.Viewer(el.current!, {
      globe: new Cesium.Globe(ellipsoid),
      baseLayer: new Cesium.ImageryLayer(imagery),
      // One terrain source for the whole session: tiles are built in a worker and refine as the
      // detailed south-pole data finishes downloading (no reload of the whole globe).
      terrainProvider: createLolaTerrain(() => viewerRef.current?.scene.requestRender()),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      skyAtmosphere: false,
      // Cesium only adds stars automatically for Earth; use its Tycho star catalogue here too.
      skyBox: Cesium.SkyBox.createEarthSkyBox(),
      scene3DOnly: true,
      // Shadow maps are expensive: they are switched on only in "stand here" (see camera effect).
      shadows: false,
      terrainShadows: Cesium.ShadowMode.ENABLED,
      requestRenderMode: true,
      msaaSamples: 1, // cheap FXAA (below) instead of 4× multisampling
      maximumRenderTimeChange: Infinity,
    });
    viewerRef.current = viewer;
    (window as unknown as { __viewer: Cesium.Viewer }).__viewer = viewer; // handy for debugging in the console
    const scene = viewer.scene;
    scene.backgroundColor = Cesium.Color.BLACK;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    scene.fog.enabled = false;
    scene.postProcessStages.fxaa.enabled = true;
    const globe = scene.globe;
    globe.enableLighting = true;
    globe.dynamicAtmosphereLighting = false;
    globe.showGroundAtmosphere = false;
    globe.baseColor = Cesium.Color.fromCssColorString('#3a3a3a');
    globe.maximumScreenSpaceError = 2;
    globe.preloadSiblings = false;
    globe.tileCacheSize = 300;
    globe.vertexShadowDarkness = 0.45;
    globe.lambertDiffuseMultiplier = 1.25;
    globe.depthTestAgainstTerrain = true;
    const sm = scene.shadowMap;
    sm.maximumDistance = 60_000;
    sm.size = 2048;
    sm.softShadows = false;
    // Real lunar shadows are black; a little fill light keeps the terrain readable for beginners.
    sm.darkness = 0.32;
    (viewer.cesiumWidget.creditContainer as HTMLElement).style.display = 'none';

    // The 8k photo map smears near the pole (1.3 km pixels stretched around it). Fade it into a
    // neutral grey there so the sharp LOLA terrain shading carries the detail instead.
    viewer.imageryLayers.add(new Cesium.ImageryLayer(polarFadeProvider()));
    // Fine regolith grain, shown only close to the ground (terrain tiles of level 11+, ≲3 km across).
    viewer.imageryLayers.add(new Cesium.ImageryLayer(regolithProvider(), { minimumTerrainLevel: 11, alpha: 0.9 }));

    skyRef.current = new SkySprites(scene);
    scene.preRender.addEventListener(() => skyRef.current?.update());
    // Signal "ready" once the first view of the Moon has loaded (or after 12 s at the latest), then
    // fly to the selected site. Showing the whole Moon first makes the app feel instant.
    let readyFired = false;
    let sawLoading = false;
    const fireReady = () => {
      if (readyFired) return;
      readyFired = true;
      document.documentElement.dataset.globe = 'ready';
      props.current.onReady?.();
      const f = props.current.focus;
      if (props.current.mode === 'orbit' && f) flyTo(viewer, f.lat, f.lon, flying);
    };
    globe.tileLoadProgressEvent.addEventListener((queued: number) => {
      if (queued > 0) sawLoading = true;
      else if (sawLoading) fireReady();
    });
    const readyTimer = setTimeout(fireReady, 12_000);

    // Keep the Moon centred when zooming out: close up the camera may look at the ground at an
    // angle, but above ~600 km it is turned progressively to look straight at the Moon's centre
    // (fully by ~2,500 km). Without this, zooming out from a tilted view slides the Moon off-screen.
    const ctl = scene.screenSpaceCameraController;
    ctl.maximumZoomDistance = 9_000_000; // don't let the Moon shrink to a dot
    viewer.camera.percentageChanged = 0.02;
    viewer.camera.changed.addEventListener(() => {
      if (props.current.mode !== 'orbit' || flying.current) return;
      const cam = viewer.camera;
      const h = cam.positionCartographic.height;
      const t = Cesium.Math.clamp((h - 600_000) / 1_900_000, 0, 1);
      if (t === 0) return;
      const flattest = Cesium.Math.lerp(Cesium.Math.toRadians(-50), -Cesium.Math.PI_OVER_TWO, t);
      if (cam.pitch <= flattest + 1e-3) return; // already looking down steeply enough
      cam.setView({ orientation: { heading: cam.heading, pitch: flattest, roll: 0 } });
      scene.requestRender();
    });

    // Start with the whole Moon, tilted to show the south pole.
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(20, -35, 4_200_000, ellipsoid),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });

    // Picking (orbit) and look-around dragging (surface).
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    let drag: { x: number; y: number; moved: boolean } | null = null;
    handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (props.current.mode !== 'orbit') return;
      const picked = scene.pick(e.position);
      const id = picked?.id instanceof Cesium.Entity ? picked.id.id : null;
      if (id?.startsWith('pin:')) {
        props.current.onPickPin(id.slice(4));
        return;
      }
      const ray = viewer.camera.getPickRay(e.position);
      const hit = ray && globe.pick(ray, scene);
      if (hit) {
        const c = Cesium.Cartographic.fromCartesian(hit, ellipsoid);
        props.current.onPickPoint(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude));
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      drag = { x: e.position.x, y: e.position.y, moved: false };
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(() => {
      drag = null;
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      if (!drag || props.current.mode !== 'surface') return;
      const k = ((viewer.camera.frustum as Cesium.PerspectiveFrustum).fov ?? 1) / scene.canvas.clientWidth;
      look.current.heading -= (e.endPosition.x - drag.x) * k;
      look.current.pitch = Cesium.Math.clamp(look.current.pitch + (e.endPosition.y - drag.y) * k, MIN_PITCH, MAX_PITCH);
      drag = { x: e.endPosition.x, y: e.endPosition.y, moved: true };
      applySurfaceView();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      clearTimeout(readyTimer);
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applySurfaceView() {
    const viewer = viewerRef.current;
    const s = props.current.surface;
    if (!viewer || !s) return;
    const key = `${s.lat},${s.lon}`;
    if (surfaceGround.current?.key !== key) {
      // Ask the terrain worker for the ground height: a quick coarse value to place the camera at
      // once, then the exact LOLA value (near the pole it needs the detailed file to finish loading).
      surfaceGround.current = { key, h: NaN, exact: false };
      const set = (exact: boolean) => (h: Float64Array) => {
        const g = surfaceGround.current;
        if (g?.key !== key || (g.exact && !exact)) return;
        g.h = h[0];
        g.exact = exact;
        applySurfaceView();
      };
      terrain().heights([[s.lat, s.lon]], false).then(set(false));
      terrain().heights([[s.lat, s.lon]], true).then(set(true));
      return;
    }
    const ground = surfaceGround.current.h; // exact LOLA height from the terrain worker
    if (Number.isNaN(ground) || viewerRef.current !== viewer || props.current.mode !== 'surface') return;
    // A fly-in still running (e.g. the opening one) would otherwise override this view.
    viewer.camera.cancelFlight();
    flying.current = false;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, ground + (props.current.eyeHeightM ?? 12), Cesium.Ellipsoid.MOON),
      orientation: { heading: look.current.heading, pitch: look.current.pitch, roll: 0 },
    });
    viewer.scene.requestRender();
  }

  // ---- camera mode ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const ctl = viewer.scene.screenSpaceCameraController;
    const surface = p.mode === 'surface' && p.surface;
    ctl.enableInputs = !surface;
    skyRef.current!.show = !!surface;
    viewer.shadows = !!surface;
    const frustum = viewer.camera.frustum as Cesium.PerspectiveFrustum;
    frustum.fov = Cesium.Math.toRadians(surface ? 75 : 60);
    updateBoulders(viewer, surface ? `${p.surface!.lat},${p.surface!.lon}` : null);
    if (surface) {
      // Aim straight at the target: turn to its azimuth AND tilt to its elevation (it can be high in
      // the sky away from the poles).
      look.current = {
        heading: Cesium.Math.toRadians(p.surface!.lookAz),
        pitch: Cesium.Math.clamp(Cesium.Math.toRadians(p.surface!.lookEl), MIN_PITCH, MAX_PITCH),
      };
      applySurfaceView();
    } else if (p.focus && document.documentElement.dataset.globe === 'ready') {
      flyTo(viewer, p.focus.lat, p.focus.lon, flying);
    }
    viewer.scene.requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.mode, p.surface?.key]);

  /** Rocks around the observer exist only while standing on the surface. */
  function updateBoulders(viewer: Cesium.Viewer, key: string | null) {
    if (boulders.current?.key === key) return;
    if (boulders.current?.prim) viewer.scene.primitives.remove(boulders.current.prim);
    boulders.current = key ? { key, prim: null } : null;
    if (!key) return;
    const [lat, lon] = key.split(',').map(Number);
    createBoulderField(lat, lon).then((prim) => {
      if (boulders.current?.key !== key || viewerRef.current !== viewer) return;
      boulders.current.prim = viewer.scene.primitives.add(prim);
      viewer.scene.requestRender();
    });
  }

  // ---- fly to focus ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !p.focus || p.mode !== 'orbit') return;
    if (document.documentElement.dataset.globe !== 'ready') return; // the ready handler flies there
    flyTo(viewer, p.focus.lat, p.focus.lon, flying);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focus?.key]);

  // ---- time → sunlight direction + sky sprites ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const f = moonFrame(p.timeMs);
    const sun = new Cesium.Cartesian3(f.sun[0], f.sun[1], f.sun[2]);
    Cesium.Cartesian3.normalize(sun, sun);
    viewer.scene.light = new Cesium.DirectionalLight({
      direction: Cesium.Cartesian3.negate(sun, new Cesium.Cartesian3()),
      intensity: 2.2,
    });
    skyRef.current?.setFrame(f);
    viewer.scene.requestRender();
  }, [p.timeMs]);

  // ---- pin heights (from the terrain worker) ----
  useEffect(() => {
    let stale = false;
    terrain()
      .heights(p.pins.map((x) => [x.lat, x.lon]))
      .then((h) => !stale && setPinHeights(h));
    return () => {
      stale = true;
    };
  }, [p.pins]);

  // ---- pins ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !pinHeights || pinHeights.length !== p.pins.length) return;
    const ents = viewer.entities;
    ents.suspendEvents();
    ents.removeAll();
    const show = p.mode === 'orbit';
    for (const [i, pin] of p.pins.entries()) {
      const h = pinHeights[i];
      const isScn = pin.kind === 'scenario';
      ents.add({
        id: `pin:${pin.id}`,
        show,
        position: Cesium.Cartesian3.fromDegrees(pin.lon, pin.lat, h + 400, Cesium.Ellipsoid.MOON),
        point: {
          pixelSize: pin.size ?? (isScn ? 16 : pin.kind === 'candidate' ? 7 : 9),
          color: Cesium.Color.fromCssColorString(pin.color),
          outlineColor: isScn ? Cesium.Color.WHITE : Cesium.Color.BLACK.withAlpha(0.7),
          outlineWidth: isScn ? 2 : 1,
          // Depth-tested so pins on the far side are hidden; nearby ones stay on top of terrain.
          disableDepthTestDistance: 30_000,
        },
        label:
          pin.kind === 'candidate'
            ? undefined
            : {
                text: pin.label,
                font: isScn ? '700 14px "Space Grotesk", system-ui' : '500 12px Inter, system-ui',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(isScn ? 0 : 10, isScn ? 0 : 0),
                horizontalOrigin: isScn ? Cesium.HorizontalOrigin.CENTER : Cesium.HorizontalOrigin.LEFT,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                disableDepthTestDistance: 30_000,
                distanceDisplayCondition: isScn ? undefined : new Cesium.DistanceDisplayCondition(0, 2_500_000),
                scale: isScn ? 0.8 : 1,
              },
      } as Cesium.Entity.ConstructorOptions);
    }
    ents.resumeEvents();
    viewer.scene.requestRender();
  }, [p.pins, p.mode, pinHeights]);

  return <div ref={el} className="globe" />;
}

function flyTo(viewer: Cesium.Viewer, lat: number, lon: number, flying: { current: boolean }) {
  const target = Cesium.Cartesian3.fromDegrees(lon, lat, 0, Cesium.Ellipsoid.MOON);
  flying.current = true;
  const done = () => (flying.current = false);
  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 20_000), {
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), 160_000),
    duration: 2.2,
    complete: done,
    cancel: done,
  });
}

/** Transparent at −76° latitude, neutral grey from −81° to the pole. */
function polarFadeProvider() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const top = -74, bottom = -90; // canvas covers this latitude range
  const y = (lat: number) => ((top - lat) / (top - bottom)) * 256;
  const grad = g.createLinearGradient(0, y(-76), 0, y(-81));
  // A slightly warm grey, like regolith in lander photos, rather than a neutral one.
  grad.addColorStop(0, 'rgba(138,130,120,0)');
  grad.addColorStop(1, 'rgba(138,130,120,0.92)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return new Cesium.SingleTileImageryProvider({
    url: c.toDataURL(),
    tileWidth: 4,
    tileHeight: 256,
    rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, -74),
    tilingScheme: new Cesium.GeographicTilingScheme({ ellipsoid: Cesium.Ellipsoid.MOON }),
  } as Cesium.SingleTileImageryProvider.ConstructorOptions);
}
