import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  FINALE_PATHS,
  JOURNEY_LEAF_OPACITY,
  JOURNEY_SPIRALS,
  LEAF_IMPACT_START,
  LEAF_TRAVEL_END,
  buildFinalePath,
  buildJourneySpiral,
  journeySpiralParams,
  createSceneCamera,
  leafOpacity,
  leafTravel,
  projectToScreen,
  sceneLayout,
} from '../apps/mintea/components/landing/leafChoreography.ts';

/**
 * Guardrails for the landing page's travelling leaf.
 *
 * Every one of these encodes a bug that actually shipped: a path tuned at one
 * aspect ratio that spent 78% of the scroll off-screen, a handoff point above
 * the top edge that made the leaf vanish and reappear, a cup offset that
 * pushed it past the right edge on a narrow window. The scene is a WebGL
 * render loop and can't be asserted on directly, but all of those were
 * arithmetic, and arithmetic can be.
 */

/** The viewports worth defending: wide desktop, tablet, phone, narrow window. */
const VIEWPORTS = [
  { height: 800, label: 'desktop 1280x800', width: 1280 },
  { height: 900, label: 'tablet 1024x900', width: 1024 },
  { height: 844, label: 'phone 390x844', width: 390 },
  { height: 900, label: 'narrow window 520x900', width: 520 },
  { height: 1200, label: 'tall narrow 700x1200', width: 700 },
];

function sampleJourney(width, height, samples = 240) {
  const layout = sceneLayout(width, height);
  const camera = createSceneCamera(THREE, layout, width, height);
  const curve = buildJourneySpiral(THREE, journeySpiralParams(layout));
  const points = [];
  for (let index = 0; index <= samples; index += 1) {
    const along = index / samples;
    points.push({
      along,
      screen: projectToScreen(THREE, curve.getPoint(along), layout, camera),
    });
  }
  return { camera, curve, layout, points };
}

function sampleFinale(width, height, samples = 120) {
  const layout = sceneLayout(width, height);
  const camera = createSceneCamera(THREE, layout, width, height);
  const curve = buildFinalePath(THREE, layout.pathKey);
  const points = [];
  for (let index = 0; index <= samples; index += 1) {
    const along = index / samples;
    points.push({
      along,
      screen: projectToScreen(THREE, curve.getPoint(along), layout, camera),
    });
  }
  return { camera, curve, layout, points };
}

for (const { height, label, width } of VIEWPORTS) {
  test(`${label}: the leaf stays in frame for most of its journey`, () => {
    const { points } = sampleJourney(width, height);
    // The tail deliberately gathers toward the finale entry, which sits just
    // outside the frame edge, so this is a majority rather than a floor of 1.
    const inFrame = points.filter(
      ({ screen }) =>
        screen.x > 0.02 && screen.x < 1.02 && screen.y > -0.05 && screen.y < 1.05,
    );
    const share = inFrame.length / points.length;
    assert.ok(
      share > 0.85,
      `only ${(share * 100).toFixed(0)}% of the journey is on screen — the ` +
        'path has drifted outside the frame again',
    );
  });

  test(`${label}: the leaf's journey runs down the middle, not the edges`, () => {
    const { points } = sampleJourney(width, height);
    // Ignore the tail, which is aiming at the off-frame handoff point.
    const body = points.filter(({ along }) => along < 0.7).map((p) => p.screen.x);
    const min = Math.min(...body);
    const max = Math.max(...body);
    const centre = (min + max) / 2;

    assert.ok(
      min > 0.12 && max < 0.88,
      `journey spans x ${(min * 100).toFixed(0)}%..${(max * 100).toFixed(0)}% ` +
        '— it should stay clear of both edges',
    );
    assert.ok(
      Math.abs(centre - 0.5) < 0.22,
      `journey is centred on ${(centre * 100).toFixed(0)}% of the frame, ` +
        'which is too far off middle',
    );
  });

  test(`${label}: the handoff into the cup is continuous`, () => {
    const journey = sampleJourney(width, height);
    const finale = sampleFinale(width, height);

    const journeyEnd = journey.points.at(-1).screen;
    const finaleStart = finale.points[0].screen;

    // The spiral's exit and the finale's first control point are separate
    // constants; if they drift apart the leaf teleports at the handoff.
    assert.ok(
      Math.abs(journeyEnd.x - finaleStart.x) < 0.005 &&
        Math.abs(journeyEnd.y - finaleStart.y) < 0.005,
      `journey ends at (${journeyEnd.x.toFixed(3)}, ${journeyEnd.y.toFixed(3)}) ` +
        `but the drop starts at (${finaleStart.x.toFixed(3)}, ${finaleStart.y.toFixed(3)})`,
    );
  });

  test(`${label}: the leaf never leaves the top of the frame at the handoff`, () => {
    // The gap users saw: the leaf climbed above the top edge at the end of the
    // journey and only reappeared once the drop brought it back down.
    const journey = sampleJourney(width, height);
    const finale = sampleFinale(width, height);

    const tail = journey.points.filter(({ along }) => along >= 0.78);
    const worstTail = Math.min(...tail.map((p) => p.screen.y));
    const worstDrop = Math.min(...finale.points.map((p) => p.screen.y));

    assert.ok(
      worstTail > 0,
      `journey tail reaches y ${(worstTail * 100).toFixed(0)}% — above the frame`,
    );
    assert.ok(
      worstDrop > 0,
      `the drop starts at y ${(worstDrop * 100).toFixed(0)}% — above the frame`,
    );
  });

  test(`${label}: the leaf lands in the cup, and the cup is in frame`, () => {
    const { layout, points } = sampleFinale(width, height);
    const landing = points.at(-1).screen;

    assert.ok(
      landing.x > 0.35 && landing.x < 0.95,
      `leaf lands at x ${(landing.x * 100).toFixed(0)}%, outside the cup`,
    );
    assert.ok(
      landing.y > 0.1 && landing.y < 0.95,
      `leaf lands at y ${(landing.y * 100).toFixed(0)}%, off the frame`,
    );

    // The cup sits at the composition origin, which is placed as a share of
    // the frame; a fixed offset used to push it off the right edge.
    const cupCentre = 0.5 + layout.compositionX / (2 * layout.halfWidth);
    assert.ok(
      cupCentre > 0.55 && cupCentre < 0.75,
      `cup centred at ${(cupCentre * 100).toFixed(0)}% of the frame`,
    );
  });
}

test('the cup holds the same place in the frame at every width', () => {
  // This is the property that replaced four hand-tuned offsets. If someone
  // reintroduces a fixed world offset, these stop agreeing.
  const centres = VIEWPORTS.map(({ height, width }) => {
    const layout = sceneLayout(width, height);
    return 0.5 + layout.compositionX / (2 * layout.halfWidth);
  });

  for (const centre of centres) {
    assert.ok(
      Math.abs(centre - centres[0]) < 0.06,
      `cup framing varies across viewports: ${centres
        .map((c) => `${(c * 100).toFixed(0)}%`)
        .join(', ')}`,
    );
  }
});

test('the leaf fades in rather than appearing at full strength', () => {
  assert.equal(leafOpacity(0, 0), 0);
  const early = leafOpacity(0.04, 0);
  assert.ok(
    early > 0 && early < JOURNEY_LEAF_OPACITY,
    `mid-fade opacity should be partial, got ${early}`,
  );
  assert.ok(Math.abs(leafOpacity(0.2, 0) - JOURNEY_LEAF_OPACITY) < 1e-6);
});

test('the fade only ever increases as you scroll in', () => {
  let previous = -1;
  for (let step = 0; step <= 100; step += 1) {
    const value = leafOpacity(step / 100, 0);
    assert.ok(value >= previous, `opacity dipped at journey progress ${step / 100}`);
    previous = value;
  }
});

test('the leaf is a wash over the copy but full strength in the cup', () => {
  // It is painted above the content, so at full strength it would cover text.
  assert.ok(leafOpacity(1, 0) <= JOURNEY_LEAF_OPACITY + 1e-6);
  assert.ok(leafOpacity(1, 1) > 0.99);
});

test('reduced motion shows the leaf outright', () => {
  assert.equal(leafOpacity(0, 0, true), 1);
  assert.equal(leafOpacity(1, 1, true), 1);
});

test('the leaf is in the tea before the splash fires', () => {
  // leafTravel must finish ahead of the impact ramp, or the ripple plays while
  // the leaf is still falling.
  assert.ok(LEAF_TRAVEL_END < LEAF_IMPACT_START);
  assert.ok(leafTravel(LEAF_IMPACT_START) > 0.999);
  assert.equal(leafTravel(0), 0);
});

test('every spiral hands over to its own finale path', () => {
  for (const key of Object.keys(JOURNEY_SPIRALS)) {
    assert.deepEqual(
      [...JOURNEY_SPIRALS[key].exit],
      [...FINALE_PATHS[key][0]],
      `${key}: the spiral's exit and the drop's first point must be identical`,
    );
  }
});
