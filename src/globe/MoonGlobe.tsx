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
import { createLolaTerrain } from './lolaTerrain.ts';
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
  /** Site to stand at in surface mode, and the initial look direction (deg from north). */
  surface: { lat: number; lon: number; lookAz: number; key: string } | null;
  eyeHeightM?: number;
  onPickPin: (id: string) => void;
  onPickPoint: (lat: number, lon: number) => void;
  onReady?: () => void;
}

const base = import.meta.env.BASE_URL;
Cesium.Ellipsoid.default = Cesium.Ellipsoid.MOON;
Cesium.Ion.defaultAccessToken = ''; // offline: never call Cesium ion

export function MoonGlobe(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const skyRef = useRef<SkySprites | null>(null);
  const look = useRef({ heading: 0, pitch: Cesium.Math.toRadians(4) });
  const surfaceGround = useRef<{ key: string; h: number } | null>(null);
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
      if (props.current.mode === 'orbit' && f) flyTo(viewer, f.lat, f.lon);
    };
    globe.tileLoadProgressEvent.addEventListener((queued: number) => {
      if (queued > 0) sawLoading = true;
      else if (sawLoading) fireReady();
    });
    const readyTimer = setTimeout(fireReady, 12_000);

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
      look.current.pitch = Cesium.Math.clamp(look.current.pitch + (e.endPosition.y - drag.y) * k, -1.2, 1.2);
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
      // Ask the terrain worker for the ground height, then place the camera.
      surfaceGround.current = { key, h: NaN };
      terrain()
        .heights([[s.lat, s.lon]])
        .then((h) => {
          if (surfaceGround.current?.key !== key) return;
          surfaceGround.current.h = h[0];
          applySurfaceView();
        });
      return;
    }
    const ground = surfaceGround.current.h;
    if (Number.isNaN(ground) || viewerRef.current !== viewer) return;
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
    if (surface) {
      look.current = { heading: Cesium.Math.toRadians(p.surface!.lookAz), pitch: Cesium.Math.toRadians(4) };
      applySurfaceView();
    } else if (p.focus && document.documentElement.dataset.globe === 'ready') {
      flyTo(viewer, p.focus.lat, p.focus.lon);
    }
    viewer.scene.requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.mode, p.surface?.key]);

  // ---- fly to focus ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !p.focus || p.mode !== 'orbit') return;
    if (document.documentElement.dataset.globe !== 'ready') return; // the ready handler flies there
    flyTo(viewer, p.focus.lat, p.focus.lon);
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

function flyTo(viewer: Cesium.Viewer, lat: number, lon: number) {
  const target = Cesium.Cartesian3.fromDegrees(lon, lat, 0, Cesium.Ellipsoid.MOON);
  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 20_000), {
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), 160_000),
    duration: 2.2,
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
  grad.addColorStop(0, 'rgba(128,126,122,0)');
  grad.addColorStop(1, 'rgba(128,126,122,0.92)');
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
