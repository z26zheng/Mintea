/**
 * Geometry for the landing page's travelling mint leaf.
 *
 * This lives apart from the scene so it can be tested. The scene itself is a
 * WebGL render loop and cannot be asserted on, but everything that decides
 * *where the leaf goes* is arithmetic, and that is where the bugs have been:
 * a path tuned at one aspect ratio that flew off-screen at another, a handoff
 * point above the top edge that made the leaf vanish mid-scroll, a cup offset
 * that pushed it past the right edge on a narrow window.
 *
 * Keep this module free of relative imports so the test runner's type
 * stripping can load it directly. `three` is only imported as a type; callers
 * pass the real module in, which also keeps this file importable from Node.
 */
import type * as ThreeNamespace from 'three';

export type PathKey = 'compact' | 'desktop' | 'mobile';

export type SceneLayout = {
  cameraFov: number;
  cameraY: number;
  cameraZ: number;
  compositionScale: number;
  compositionX: number;
  compositionY: number;
  /** Half the visible frame at the leaf's depth, in world units. */
  halfHeight: number;
  halfWidth: number;
  pathKey: PathKey;
};

export type SpiralShape = {
  bottom: number;
  exit: readonly [number, number, number];
  radiusX: number;
  radiusZ: number;
  top: number;
  turns: number;
};

export type SpiralParams = SpiralShape & { centerX: number };

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

export const smoothstep = (from: number, to: number, value: number) => {
  const progress = clamp01((value - from) / Math.max(to - from, 0.0001));
  return progress * progress * (3 - 2 * progress);
};

/**
 * Journey-progress window the leaf fades in across. Journey progress starts
 * when the feature heading reaches 82% of the viewport, so this window covers
 * roughly the first screen of that section — the leaf arrives with "Powerful
 * enough for the details" rather than appearing abruptly mid-scroll.
 */
export const LEAF_FADE_IN_START = 0.01;
export const LEAF_FADE_IN_END = 0.085;

/**
 * How strong the leaf gets while it is crossing the copy. Its canvas sits
 * above the content, which is what lets the path run down the middle of the
 * page; holding it to a wash is the other half of that trade, so it can pass
 * over a heading without hiding it.
 */
export const JOURNEY_LEAF_OPACITY = 0.35;

/** Finale progress window over which the leaf falls into the cup. */
export const LEAF_TRAVEL_START = 0.08;
export const LEAF_TRAVEL_END = 0.5;

/** Finale progress at which the splash fires; the leaf must land before it. */
export const LEAF_IMPACT_START = 0.53;

/**
 * How far right the cup sits, as a share of the visible half-width.
 *
 * A fixed world offset is only correct at the aspect it was tuned for: the old
 * mobile value pushed the cup 70% of the way to the right edge on a narrow
 * portrait window and clipped its handle. As a share, the cup holds the same
 * position in the frame at every width — it lands at 0.5 + share/2 across.
 */
export const OFFSET_SHARE: Record<'compact' | 'desktop' | 'mobile' | 'tablet', number> = {
  compact: 0.29,
  desktop: 0.31,
  mobile: 0.34,
  tablet: 0.38,
};

export const JOURNEY_SPIRALS: Record<PathKey, SpiralShape> = {
  desktop: {
    bottom: -2.05,
    exit: [2.3, 1.98, 0.55],
    radiusX: 1.5,
    radiusZ: 0.42,
    top: 1.85,
    turns: 3,
  },
  compact: {
    bottom: -2.4,
    exit: [1.6, 2.26, 0.48],
    radiusX: 1.45,
    radiusZ: 0.4,
    top: 2.2,
    turns: 3,
  },
  mobile: {
    bottom: -2.6,
    exit: [1.6, 2.26, 0.48],
    radiusX: 1.15,
    radiusZ: 0.35,
    top: 2.4,
    turns: 3,
  },
};

/**
 * The spiral for a viewport, centred on the frame.
 *
 * `centerX` is derived rather than stored. The composition is offset right by
 * a share of the frame, so the path coordinate that lands dead centre is
 * -offsetX / scale — which moves with the viewport. Three hardcoded values
 * were correct only at the widths they were tuned at, and left the leaf
 * hugging the left edge of a narrow window.
 */
export function journeySpiralParams(layout: SceneLayout): SpiralParams {
  return {
    ...JOURNEY_SPIRALS[layout.pathKey],
    centerX: -layout.compositionX / layout.compositionScale,
  };
}

/**
 * Control points for the drop into the cup. The first point is also where the
 * journey spiral hands over, so the two must match exactly or the leaf jumps.
 */
export const FINALE_PATHS: Record<PathKey, ReadonlyArray<readonly [number, number, number]>> = {
  desktop: [
    [2.3, 1.98, 0.55],
    [2.0, 1.66, 1.0],
    [0.15, 1.44, 0.7],
    [-0.12, 0.64, 0.22],
  ],
  compact: [
    [1.6, 2.26, 0.48],
    [1.2, 1.92, 0.82],
    [-0.08, 1.48, 0.66],
    [-0.1, 0.64, 0.2],
  ],
  mobile: [
    [1.6, 2.26, 0.48],
    [1.2, 1.92, 0.82],
    [-0.08, 1.48, 0.66],
    [-0.1, 0.64, 0.2],
  ],
};

/**
 * Everything the scene derives from the viewport, in one place so a test can
 * ask the same questions the renderer does.
 */
export function sceneLayout(width: number, height: number): SceneLayout {
  const mobile = width <= 560;
  const compact = width <= 820;
  const tablet = width <= 1120;
  const shortViewport = height <= 700;

  const cameraFov = mobile ? 40 : compact ? 37 : tablet ? 35 : 34;
  const cameraZ = mobile ? 9.6 : compact ? 9.2 : tablet ? 8.8 : 8.35;
  const aspect = width / height;

  const halfHeight = Math.tan((cameraFov * Math.PI) / 360) * Math.abs(cameraZ);
  const halfWidth = halfHeight * aspect;

  const share = mobile
    ? OFFSET_SHARE.mobile
    : compact
      ? OFFSET_SHARE.compact
      : tablet
        ? OFFSET_SHARE.tablet
        : OFFSET_SHARE.desktop;

  return {
    cameraFov,
    cameraY: mobile ? 0.62 : 0.98,
    cameraZ,
    compositionScale: mobile ? 0.66 : compact ? 0.68 : tablet ? 0.8 : 1,
    compositionX: halfWidth * share,
    compositionY: mobile ? (shortViewport ? -0.2 : -1.12) : compact ? -0.62 : -0.08,
    halfHeight,
    halfWidth,
    pathKey: mobile ? 'mobile' : tablet ? 'compact' : 'desktop',
  };
}

/**
 * Builds the leaf's scroll journey as a corkscrew down the middle of the frame.
 *
 * The path this replaced swung out to x = -5.5 while the frame is only about
 * ±3.8 wide at this depth, so the leaf spent much of the scroll outside the
 * viewport and only flashed past the edges. Circling a vertical axis keeps it
 * on screen the whole way down, and the z term carries it nearer and further
 * so the descent reads as depth rather than a flat slide.
 *
 * The tail gathers toward `exit` — the finale path's first point — so handing
 * the leaf over to the cup continues the motion instead of snapping to it.
 */
export function buildJourneySpiral(
  THREE: typeof ThreeNamespace,
  { bottom, centerX, exit, radiusX, radiusZ, top, turns }: SpiralParams,
): ThreeNamespace.CatmullRomCurve3 {
  const samples = Math.max(24, Math.round(turns * 16));
  const points: ThreeNamespace.Vector3[] = [];

  for (let index = 0; index <= samples; index += 1) {
    const along = index / samples;
    const angle = along * Math.PI * 2 * turns;
    // Blend into the exit over the tail rather than appending it as one more
    // control point, which would be crossed in a single fast segment.
    const gather = smoothstep(0.78, 1, along);

    points.push(
      new THREE.Vector3(
        mix(centerX + Math.sin(angle) * radiusX, exit[0], gather),
        mix(top + (bottom - top) * along, exit[1], gather),
        mix(Math.cos(angle) * radiusZ, exit[2], gather),
      ),
    );
  }

  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.3);
}

export function buildFinalePath(
  THREE: typeof ThreeNamespace,
  key: PathKey,
): ThreeNamespace.CubicBezierCurve3 {
  const [a, b, c, d] = FINALE_PATHS[key];
  return new THREE.CubicBezierCurve3(
    new THREE.Vector3(a![0], a![1], a![2]),
    new THREE.Vector3(b![0], b![1], b![2]),
    new THREE.Vector3(c![0], c![1], c![2]),
    new THREE.Vector3(d![0], d![1], d![2]),
  );
}

/**
 * The scene's camera for a given viewport. Built through three rather than
 * reimplemented, so anything measured with it matches what actually renders —
 * a hand-rolled projection that drifted from the real one would make every
 * assertion below quietly meaningless.
 */
export function createSceneCamera(
  THREE: typeof ThreeNamespace,
  layout: SceneLayout,
  width: number,
  height: number,
): ThreeNamespace.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    layout.cameraFov,
    width / height,
    0.1,
    60,
  );
  camera.position.set(0, layout.cameraY, layout.cameraZ);
  camera.lookAt(0, -0.12, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

/**
 * Where a point in composition space lands on screen, as fractions of the
 * viewport: 0 is the left/top edge, 1 the right/bottom.
 */
export function projectToScreen(
  THREE: typeof ThreeNamespace,
  point: ThreeNamespace.Vector3,
  layout: SceneLayout,
  camera: ThreeNamespace.PerspectiveCamera,
): { x: number; y: number } {
  const world = point
    .clone()
    .multiplyScalar(layout.compositionScale)
    .add(new THREE.Vector3(layout.compositionX, layout.compositionY, 0));
  const ndc = world.project(camera);
  return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2 };
}

/** Leaf opacity for a given scroll state. */
export function leafOpacity(
  journeyProgress: number,
  sceneProgress: number,
  reducedMotion = false,
): number {
  if (reducedMotion) return 1;
  const journey =
    smoothstep(LEAF_FADE_IN_START, LEAF_FADE_IN_END, journeyProgress) *
    JOURNEY_LEAF_OPACITY;
  return mix(journey, 1, smoothstep(0, 0.14, sceneProgress));
}

/** How far along the drop into the cup the leaf is. */
export function leafTravel(sceneProgress: number): number {
  return smoothstep(LEAF_TRAVEL_START, LEAF_TRAVEL_END, sceneProgress);
}
