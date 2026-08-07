import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from 'react';
import type * as ThreeNamespace from 'three';

import {
  loadMintLeafModel,
  type MintLeafModel,
} from './mintLeafModel.web';
import {
  clamp01,
  JOURNEY_LEAF_OPACITY,
  LEAF_FADE_IN_END,
  LEAF_FADE_IN_START,
  buildFinalePath,
  buildJourneySpiral,
  journeySpiralParams,
  leafOpacity,
  leafTravel as leafTravelAt,
  mix,
  sceneLayout,
  smoothstep,
  type SceneLayout,
} from './leafChoreography';

type FinalTeaSceneProps = {
  className?: string;
  journeyProgressRef?: MutableRefObject<number>;
  progressRef: MutableRefObject<number>;
  reducedMotion?: boolean;
  style?: CSSProperties;
};




const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);


function createRadialTexture(
  THREE: typeof ThreeNamespace,
  colorStops: Array<[number, string]>,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');

  if (!context) return null;

  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  colorStops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Decorative, progress-driven finale for the landing page.
 *
 * The parent owns scroll choreography and exposes normalized final-section
 * progress through a ref. An optional journey ref keeps the leaf moving in
 * viewport-safe edge corridors before it converges on the stationary cup. The
 * transparent canvas lets copy and color transitions remain independent.
 */
export function FinalTeaScene({
  className,
  journeyProgressRef,
  progressRef,
  reducedMotion = false,
  style,
}: FinalTeaSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let cancelled = false;
    let disposeScene = () => {};
    let bootstrapObserver: IntersectionObserver | null = null;
    let clipFrame = 0;
    let started = false;
    setReady(false);
    const shouldReduceMotion =
      reducedMotion ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const landingRoot = container.closest<HTMLElement>('.mintea-landing');
    const finaleElement = landingRoot?.querySelector<HTMLElement>(
      '.landing-final-cta',
    );
    const updateFinaleClip = () => {
      clipFrame = 0;
      const viewportRect = container.getBoundingClientRect();
      const finaleRect = finaleElement?.getBoundingClientRect();
      const viewportHeight = Math.max(viewportRect.height, 1);
      const top = Math.min(
        viewportHeight,
        Math.max(0, finaleRect?.top ?? viewportHeight),
      );
      const bottom = Math.min(
        viewportHeight,
        Math.max(0, viewportHeight - (finaleRect?.bottom ?? 0)),
      );

      container.style.setProperty('--tea-finale-clip-top', `${top}px`);
      container.style.setProperty('--tea-finale-clip-bottom', `${bottom}px`);
      // Raw, unclamped offset of the section from the viewport top. The cup
      // and the poster fallback are drawn on this fixed stage but belong to
      // the section, so they translate by this amount to move with it like
      // ink printed on the page.
      container.style.setProperty(
        '--tea-finale-offset',
        `${finaleRect?.top ?? viewportHeight}px`,
      );
    };
    const scheduleFinaleClip = () => {
      if (clipFrame) return;
      clipFrame = window.requestAnimationFrame(updateFinaleClip);
    };

    updateFinaleClip();
    landingRoot?.addEventListener('scroll', scheduleFinaleClip, {
      passive: true,
    });
    window.addEventListener('resize', scheduleFinaleClip);

    const startScene = () => {
      if (cancelled || started) return;
      started = true;

      const connection = (
        navigator as Navigator & { connection?: { saveData?: boolean } }
      ).connection;
      if (connection?.saveData) return;

      void Promise.all([
        import('three'),
        import('three/addons/environments/RoomEnvironment.js'),
      ])
      .then(([THREE, { RoomEnvironment }]) => {
        if (cancelled) return;

        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          canvas,
          powerPreference: 'high-performance',
          premultipliedAlpha: true,
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.94;
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
        const composition = new THREE.Group();
        composition.name = 'FinalTeaComposition';
        scene.add(composition);

        // Everything that belongs to the finale section itself — the cup and
        // its glow — hangs off this anchor. Each frame the anchor is offset by
        // the section's on-screen position, so the cup rides in with the
        // section exactly like its headline text does, and stops dead the
        // moment the section pins. The traveling leaf stays outside the
        // anchor: it belongs to the page, not the section.
        const finaleAnchor = new THREE.Group();
        finaleAnchor.name = 'FinaleSectionAnchor';
        composition.add(finaleAnchor);

        const geometries = new Set<ThreeNamespace.BufferGeometry>();
        const materials = new Set<ThreeNamespace.Material>();
        const textures = new Set<ThreeNamespace.Texture>();

        const trackGeometry = <T extends ThreeNamespace.BufferGeometry>(
          geometry: T,
        ) => {
          geometries.add(geometry);
          return geometry;
        };
        const trackMaterial = <T extends ThreeNamespace.Material>(material: T) => {
          materials.add(material);
          return material;
        };
        const trackTexture = <T extends ThreeNamespace.Texture>(texture: T) => {
          textures.add(texture);
          return texture;
        };

        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        const roomEnvironment = new RoomEnvironment();
        const environmentTarget = pmremGenerator.fromScene(roomEnvironment, 0.035);
        scene.environment = environmentTarget.texture;
        pmremGenerator.dispose();
        roomEnvironment.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          const roomMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          roomMaterials.forEach((material) => material.dispose());
        });

        const glowTexture = createRadialTexture(THREE, [
          [0, 'rgba(102, 255, 202, 0.82)'],
          [0.32, 'rgba(62, 224, 166, 0.34)'],
          [0.7, 'rgba(25, 151, 108, 0.09)'],
          [1, 'rgba(10, 91, 67, 0)'],
        ]);
        const contactShadowTexture = createRadialTexture(THREE, [
          [0, 'rgba(3, 24, 17, 0.34)'],
          [0.42, 'rgba(5, 38, 27, 0.2)'],
          [0.76, 'rgba(9, 54, 39, 0.07)'],
          [1, 'rgba(9, 54, 39, 0)'],
        ]);
        const teaTexture = createRadialTexture(THREE, [
          [0, '#9a5423'],
          [0.42, '#874316'],
          [0.78, '#68280b'],
          [1, '#351003'],
        ]);
        if (glowTexture) trackTexture(glowTexture);
        if (contactShadowTexture) trackTexture(contactShadowTexture);
        if (teaTexture) trackTexture(teaTexture);

        const backdropGlowMaterial = trackMaterial(
          new THREE.SpriteMaterial({
            blending: THREE.AdditiveBlending,
            color: 0xb7ffe2,
            depthTest: false,
            depthWrite: false,
            map: glowTexture,
            opacity: 0,
            transparent: true,
          }),
        );
        const backdropGlow = new THREE.Sprite(backdropGlowMaterial);
        backdropGlow.name = 'TeaRippleBackdropGlow';
        backdropGlow.position.set(0, -0.15, -2.4);
        backdropGlow.scale.setScalar(0.01);
        finaleAnchor.add(backdropGlow);

        const porcelainMaterial = trackMaterial(
          new THREE.MeshPhysicalMaterial({
            clearcoat: 0.72,
            clearcoatRoughness: 0.1,
            color: 0xf1ebdd,
            depthWrite: true,
            envMapIntensity: 0.95,
            ior: 1.5,
            metalness: 0,
            opacity: 1,
            roughness: 0.2,
            side: THREE.DoubleSide,
            specularColor: 0xfff9eb,
            specularIntensity: 0.72,
          }),
        );
        const goldMaterial = trackMaterial(
          new THREE.MeshPhysicalMaterial({
            clearcoat: 0.34,
            clearcoatRoughness: 0.18,
            color: 0xb79a63,
            depthWrite: true,
            envMapIntensity: 1.25,
            metalness: 0.88,
            opacity: 1,
            roughness: 0.26,
          }),
        );
        const greenBandMaterial = trackMaterial(
          new THREE.MeshPhysicalMaterial({
            clearcoat: 0.86,
            clearcoatRoughness: 0.08,
            color: 0x12382f,
            depthWrite: true,
            envMapIntensity: 0.88,
            metalness: 0.04,
            opacity: 1,
            roughness: 0.25,
          }),
        );
        const teaSurfaceMaterial = trackMaterial(
          new THREE.MeshPhysicalMaterial({
            clearcoat: 0.92,
            clearcoatRoughness: 0.045,
            color: 0xffffff,
            depthWrite: true,
            envMapIntensity: 0.72,
            map: teaTexture,
            metalness: 0,
            opacity: 1,
            roughness: 0.17,
            side: THREE.DoubleSide,
          }),
        );
        const teaMeniscusMaterial = trackMaterial(
          new THREE.MeshPhysicalMaterial({
            clearcoat: 0.8,
            color: 0xc78645,
            depthWrite: false,
            envMapIntensity: 0.78,
            opacity: 0.3,
            roughness: 0.16,
            transparent: true,
          }),
        );
        const teaGlintMaterial = trackMaterial(
          new THREE.MeshBasicMaterial({
            color: 0xf5ddb8,
            depthWrite: false,
            opacity: 0.24,
            transparent: true,
          }),
        );
        const contactShadowMaterial = trackMaterial(
          new THREE.MeshBasicMaterial({
            color: 0x143c31,
            depthWrite: false,
            map: contactShadowTexture,
            opacity: 0.2,
            side: THREE.DoubleSide,
            transparent: true,
          }),
        );

        const cupRig = new THREE.Group();
        cupRig.name = 'HeirloomTeaCup';
        cupRig.position.set(0, -0.12, 0);
        cupRig.rotation.set(-0.025, -0.22, 0.004);
        cupRig.scale.setScalar(1.05);
        finaleAnchor.add(cupRig);

        const cupProfile = [
          new THREE.Vector2(0, -0.66),
          new THREE.Vector2(0.63, -0.66),
          new THREE.Vector2(0.69, -0.61),
          new THREE.Vector2(0.72, -0.51),
          new THREE.Vector2(0.8, -0.22),
          new THREE.Vector2(0.89, 0.12),
          new THREE.Vector2(0.98, 0.5),
          new THREE.Vector2(1.025, 0.7),
          new THREE.Vector2(1.02, 0.74),
          new THREE.Vector2(0.965, 0.74),
          new THREE.Vector2(0.96, 0.69),
          new THREE.Vector2(0.92, 0.51),
          new THREE.Vector2(0.83, 0.13),
          new THREE.Vector2(0.74, -0.22),
          new THREE.Vector2(0.68, -0.48),
          new THREE.Vector2(0.64, -0.53),
          new THREE.Vector2(0, -0.53),
        ];
        const cupWall = new THREE.Mesh(
          trackGeometry(new THREE.LatheGeometry(cupProfile, 96)),
          porcelainMaterial,
        );
        cupRig.add(cupWall);

        const cupRim = new THREE.Mesh(
          trackGeometry(new THREE.TorusGeometry(1.023, 0.012, 8, 128)),
          goldMaterial,
        );
        cupRim.position.y = 0.742;
        cupRim.rotation.x = Math.PI / 2;
        cupRig.add(cupRim);

        const cupBand = new THREE.Mesh(
          trackGeometry(new THREE.TorusGeometry(0.995, 0.024, 10, 128)),
          greenBandMaterial,
        );
        cupBand.position.y = 0.575;
        cupBand.rotation.x = Math.PI / 2;
        cupRig.add(cupBand);

        const footRing = new THREE.Mesh(
          trackGeometry(new THREE.TorusGeometry(0.635, 0.034, 10, 96)),
          porcelainMaterial,
        );
        footRing.position.y = -0.665;
        footRing.rotation.x = Math.PI / 2;
        cupRig.add(footRing);

        const footGoldLine = new THREE.Mesh(
          trackGeometry(new THREE.TorusGeometry(0.642, 0.007, 6, 96)),
          goldMaterial,
        );
        footGoldLine.position.y = -0.692;
        footGoldLine.rotation.x = Math.PI / 2;
        cupRig.add(footGoldLine);

        const handleCurve = new THREE.CubicBezierCurve3(
          new THREE.Vector3(0.99, 0.49, -0.02),
          new THREE.Vector3(1.67, 0.48, -0.06),
          new THREE.Vector3(1.67, -0.38, -0.08),
          new THREE.Vector3(0.76, -0.36, -0.03),
        );
        const cupHandle = new THREE.Mesh(
          trackGeometry(new THREE.TubeGeometry(handleCurve, 64, 0.052, 10, false)),
          porcelainMaterial,
        );
        cupRig.add(cupHandle);

        const saucerProfile = [
          new THREE.Vector2(0, -0.8),
          new THREE.Vector2(0.62, -0.8),
          new THREE.Vector2(0.88, -0.79),
          new THREE.Vector2(1.18, -0.75),
          new THREE.Vector2(1.48, -0.67),
          new THREE.Vector2(1.62, -0.59),
          new THREE.Vector2(1.66, -0.61),
          new THREE.Vector2(1.61, -0.68),
          new THREE.Vector2(1.46, -0.76),
          new THREE.Vector2(1.12, -0.85),
          new THREE.Vector2(0.64, -0.89),
          new THREE.Vector2(0, -0.89),
        ];
        const saucer = new THREE.Mesh(
          trackGeometry(new THREE.LatheGeometry(saucerProfile, 96)),
          porcelainMaterial,
        );
        cupRig.add(saucer);

        const saucerBand = new THREE.Mesh(
          trackGeometry(new THREE.TorusGeometry(1.33, 0.018, 8, 128)),
          greenBandMaterial,
        );
        saucerBand.position.y = -0.715;
        saucerBand.rotation.x = Math.PI / 2;
        cupRig.add(saucerBand);

        const saucerGoldEdge = new THREE.Mesh(
          trackGeometry(new THREE.TorusGeometry(1.64, 0.009, 8, 128)),
          goldMaterial,
        );
        saucerGoldEdge.position.y = -0.61;
        saucerGoldEdge.rotation.x = Math.PI / 2;
        cupRig.add(saucerGoldEdge);

        const saucerFoot = new THREE.Mesh(
          trackGeometry(new THREE.TorusGeometry(0.55, 0.035, 10, 96)),
          porcelainMaterial,
        );
        saucerFoot.position.y = -0.885;
        saucerFoot.rotation.x = Math.PI / 2;
        cupRig.add(saucerFoot);

        const teaSurface = new THREE.Mesh(
          trackGeometry(new THREE.CircleGeometry(0.925, 128)),
          teaSurfaceMaterial,
        );
        teaSurface.position.y = 0.56;
        teaSurface.rotation.x = -Math.PI / 2;
        cupRig.add(teaSurface);

        const teaMeniscus = new THREE.Mesh(
          trackGeometry(new THREE.TorusGeometry(0.916, 0.009, 8, 128)),
          teaMeniscusMaterial,
        );
        teaMeniscus.position.y = 0.566;
        teaMeniscus.rotation.x = Math.PI / 2;
        cupRig.add(teaMeniscus);

        const teaGlint = new THREE.Mesh(
          trackGeometry(
            new THREE.TorusGeometry(0.57, 0.006, 6, 64, Math.PI * 0.72),
          ),
          teaGlintMaterial,
        );
        teaGlint.position.set(-0.12, 0.574, 0.07);
        teaGlint.rotation.set(Math.PI / 2, 0, -0.36);
        cupRig.add(teaGlint);

        const contactShadow = new THREE.Mesh(
          trackGeometry(new THREE.PlaneGeometry(4.4, 2.6)),
          contactShadowMaterial,
        );
        contactShadow.position.set(0, -0.91, -0.08);
        contactShadow.rotation.x = -Math.PI / 2;
        cupRig.add(contactShadow);

        const rippleMaterials: ThreeNamespace.MeshBasicMaterial[] = [];
        const ripples = Array.from({ length: 3 }, (_, index) => {
          const rippleMaterial = trackMaterial(
            new THREE.MeshBasicMaterial({
              blending: THREE.AdditiveBlending,
              color: index === 0 ? 0xffd399 : 0xc4ffe6,
              depthTest: false,
              depthWrite: false,
              opacity: 0,
              transparent: true,
            }),
          );
          rippleMaterials.push(rippleMaterial);
          const ripple = new THREE.Mesh(
            trackGeometry(
              new THREE.TorusGeometry(0.18 + index * 0.025, 0.009, 7, 80),
            ),
            rippleMaterial,
          );
          ripple.position.set(-0.1, 0.59 + index * 0.003, 0.1);
          ripple.rotation.x = Math.PI / 2;
          ripple.renderOrder = 6;
          cupRig.add(ripple);
          return ripple;
        });

        const steamGroup = new THREE.Group();
        steamGroup.name = 'TeaSteam';
        steamGroup.position.y = 0.69;
        cupRig.add(steamGroup);

        const steamMaterials: ThreeNamespace.MeshBasicMaterial[] = [];
        const steamPaths = [
          [
            new THREE.Vector3(-0.45, 0, 0.06),
            new THREE.Vector3(-0.72, 0.54, 0.05),
            new THREE.Vector3(-0.19, 1.03, 0),
            new THREE.Vector3(-0.52, 1.66, -0.08),
          ],
          [
            new THREE.Vector3(0.04, 0.03, 0),
            new THREE.Vector3(0.34, 0.52, 0.04),
            new THREE.Vector3(-0.11, 1.12, -0.02),
            new THREE.Vector3(0.26, 1.82, -0.12),
          ],
          [
            new THREE.Vector3(0.48, 0.01, -0.08),
            new THREE.Vector3(0.71, 0.48, -0.07),
            new THREE.Vector3(0.31, 0.96, -0.12),
            new THREE.Vector3(0.62, 1.52, -0.2),
          ],
        ];
        steamPaths.forEach((points, index) => {
          const steamMaterial = trackMaterial(
            new THREE.MeshBasicMaterial({
              blending: THREE.AdditiveBlending,
              color: index === 1 ? 0xf3e1c8 : 0xdcebe4,
              depthWrite: false,
              opacity: 0,
              transparent: true,
            }),
          );
          steamMaterials.push(steamMaterial);
          const steam = new THREE.Mesh(
            trackGeometry(
              new THREE.TubeGeometry(
                new THREE.CatmullRomCurve3(points),
                48,
                index === 1 ? 0.017 : 0.013,
                6,
                false,
              ),
            ),
            steamMaterial,
          );
          steam.userData.baseX = steam.position.x;
          steamGroup.add(steam);
        });

        const leafRig = new THREE.Group();
        leafRig.name = 'FinalTeaMintLeaf';
        composition.add(leafRig);
        let mintLeaf: MintLeafModel | null = null;

        const ambientLight = new THREE.HemisphereLight(0xfff8e8, 0x0a2e24, 0.62);
        scene.add(ambientLight);
        const keyLight = new THREE.DirectionalLight(0xfff1d5, 2.2);
        keyLight.position.set(4, 5, 6);
        scene.add(keyLight);
        const rimLight = new THREE.PointLight(0x6adbad, 1.7, 12, 2);
        rimLight.position.set(-3, 2, -2.5);
        scene.add(rimLight);
        const warmAccent = new THREE.PointLight(0xd6ab66, 2.2, 10, 2);
        warmAccent.position.set(3, 2.4, -3);
        scene.add(warmAccent);

        // These first points are also where the journey spiral hands over, so
        // they have to stay inside the frame. At y = 3.18 the leaf climbed
        // above the top edge at the end of its journey and only reappeared
        // once the finale dropped it back in — a visible gap. Starting the
        // descent lower keeps it on screen and shortens the fall.
        // Both curves depend on the viewport: the spiral centres on the frame,
        // which moves with the composition offset. Rebuilt in resize().
        let layout: SceneLayout = sceneLayout(
          Math.max(container.clientWidth, 1),
          Math.max(container.clientHeight, 1),
        );
        let journeyPath = buildJourneySpiral(THREE, journeySpiralParams(layout));
        let finalePath = buildFinalePath(THREE, layout.pathKey);

        const leafPosition = new THREE.Vector3();
        const journeyLeafPosition = new THREE.Vector3();
        const finalLeafPosition = new THREE.Vector3();

        let width = 1;
        let height = 1;
        let visible = false;
        let frame = 0;
        const journeyElement = container.closest<HTMLElement>(
          '.landing-leaf-journey',
        );
        const finaleElement = journeyElement
          ?.querySelector<HTMLElement>('.landing-final-cta');

        const renderScene = () => {
          const mobile = width <= 560;
          const tablet = width <= 1120;
          const finaleRect = finaleElement?.getBoundingClientRect();
          const journeyRect = journeyElement?.getBoundingClientRect();
          const journeyVisible = Boolean(
            journeyRect && journeyRect.top < height && journeyRect.bottom > 0,
          );
          const reducedFinaleVisible = Boolean(
            shouldReduceMotion &&
            finaleRect &&
            finaleRect.top <= height * 0.96 &&
            finaleRect.bottom > 0,
          );
          const sceneProgress = shouldReduceMotion
            ? Number(reducedFinaleVisible)
            : clamp01(progressRef.current);
          const journeyProgress = shouldReduceMotion
            ? Number(reducedFinaleVisible)
            : clamp01(journeyProgressRef?.current ?? 1);
          const leafTravel = leafTravelAt(sceneProgress);
          const impact = smoothstep(0.53, 0.66, sceneProgress);
          const impactPulse = Math.sin(impact * Math.PI);
          const steamReveal = smoothstep(0.62, 0.86, sceneProgress);
          const settle = smoothstep(0.66, 1, sceneProgress);

          composition.visible = journeyVisible;

          // The cup belongs to the finale section, so it translates with the
          // section's rect: it rides up during the approach exactly like the
          // headline text beside it, then holds perfectly still once the
          // section pins at the top. No visibility gate and no clipping —
          // an object that moves rigidly with its background can never be
          // sliced by that background's edge.
          const finaleTop = finaleRect ? finaleRect.top : height * 4;
          const worldPerPixel =
            (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z) /
            Math.max(height, 1);
          finaleAnchor.position.y =
            (-finaleTop * worldPerPixel) /
            Math.max(composition.scale.y, 0.0001);

          finalePath.getPoint(leafTravel, finalLeafPosition);
          if (journeyProgressRef) {
            journeyPath.getPoint(journeyProgress, journeyLeafPosition);
            leafPosition.lerpVectors(
              journeyLeafPosition,
              finalLeafPosition,
              smoothstep(0, 0.12, sceneProgress),
            );
          } else {
            leafPosition.copy(finalLeafPosition);
          }
          const contactRebound = Math.sin(smoothstep(0.57, 0.7, sceneProgress) * Math.PI);
          leafRig.position.copy(leafPosition);
          leafRig.position.y += contactRebound * 0.08 - settle * 0.025;
          // Once the leaf is resting in the tea it belongs to the cup, so it
          // has to take the cup's section offset too. Without this the cup
          // rides up with the section as it unpins and leaves the leaf behind,
          // stranded below the saucer. Both are children of `composition`, so
          // the offset applies directly.
          leafRig.position.y += finaleAnchor.position.y * settle;
          const finalConvergence = smoothstep(0, 0.18, sceneProgress);
          leafRig.rotation.set(
            mix(
              0.18 + Math.sin(journeyProgress * Math.PI * 4) * 0.12,
              mix(0.12, 0.6, leafTravel),
              finalConvergence,
            ),
            mix(
              -0.38 + Math.sin(journeyProgress * Math.PI * 3) * 0.16,
              mix(-0.48, -0.12, leafTravel),
              finalConvergence,
            ),
            mix(
              -0.18 + Math.sin(journeyProgress * Math.PI * 5) * 0.2,
              mix(-0.15, -0.94, leafTravel),
              finalConvergence,
            ),
          );
          const journeyLeafScale = mobile ? 0.2 : tablet ? 0.24 : 0.27;
          const finalLeafScale = mobile ? 0.26 : tablet ? 0.32 : 0.28;
          leafRig.scale.setScalar(
            mix(journeyLeafScale, finalLeafScale, finalConvergence),
          );
          leafRig.visible =
            Boolean(mintLeaf) &&
            (!shouldReduceMotion || reducedFinaleVisible) &&
            (Boolean(journeyProgressRef) || sceneProgress > 0.025);

          // Fade the leaf in over the start of its journey instead of letting
          // it appear at full strength the moment this scene starts drawing.
          // The window lands on the "Powerful enough for the details" heading,
          // so the leaf arrives with that section rather than out of nowhere.
          mintLeaf?.setOpacity(
            leafOpacity(journeyProgress, sceneProgress, shouldReduceMotion),
          );
          mintLeaf?.update(
            journeyProgress * 3.1 + sceneProgress * 4.2,
            Math.max(journeyProgress * 0.35, sceneProgress),
          );

          teaSurface.position.y = 0.56 - impactPulse * 0.018;
          teaSurface.scale.set(
            1 + impactPulse * 0.01,
            1 + impactPulse * 0.01,
            1,
          );
          teaMeniscus.position.y = teaSurface.position.y + 0.005;
          teaGlint.position.y = teaSurface.position.y + 0.014;

          ripples.forEach((ripple, index) => {
            const rippleProgress = smoothstep(
              0.545 + index * 0.035,
              0.79 + index * 0.035,
              sceneProgress,
            );
            const scale = mix(
              0.4,
              4.1 - index * 0.35,
              easeOutCubic(rippleProgress),
            );
            ripple.scale.set(scale, scale, 1);
            rippleMaterials[index].opacity =
              Math.sin(rippleProgress * Math.PI) *
              (0.3 - index * 0.055);
            ripple.visible = rippleProgress > 0 && rippleProgress < 1;
          });

          steamGroup.scale.y = Math.max(0.001, easeOutCubic(steamReveal));
          steamGroup.rotation.z = mix(-0.06, 0.035, settle);
          steamMaterials.forEach((material, index) => {
            material.opacity = steamReveal * (index === 1 ? 0.18 : 0.12);
          });
          steamGroup.children.forEach((steam, index) => {
            steam.visible = !mobile || index === 1;
            steam.position.x =
              (steam.userData.baseX as number) +
              Math.sin(sceneProgress * Math.PI * 2 + index * 1.3) *
                (mobile ? 0.025 : 0.055) *
                steamReveal;
          });

          contactShadowMaterial.opacity = 0.16 + settle * 0.04;
          backdropGlowMaterial.opacity = smoothstep(0.6, 1, sceneProgress) * 0.16;
          const glowScale = mix(
            1.4,
            mobile ? 7 : 9,
            smoothstep(0.6, 1, sceneProgress),
          );
          backdropGlow.scale.set(glowScale, glowScale, 1);

          // One pass for everything. The cup needs no scissor wipe any more:
          // being position-anchored to the section, it can never cross the
          // section's edge in the first place.
          renderer.render(scene, camera);
        };
        const resize = () => {
          const rect = container.getBoundingClientRect();
          width = Math.max(rect.width, 1);
          height = Math.max(rect.height, 1);

          // Single source of truth for every viewport-derived number, shared
          // with the choreography tests so they measure what actually renders.
          layout = sceneLayout(width, height);

          renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, layout.pathKey === 'mobile' ? 1.3 : 1.75),
          );
          renderer.setSize(width, height, false);

          camera.fov = layout.cameraFov;
          camera.aspect = width / height;
          camera.position.set(0, layout.cameraY, layout.cameraZ);
          camera.lookAt(0, -0.12, 0);
          camera.updateProjectionMatrix();

          composition.position.set(layout.compositionX, layout.compositionY, 0);
          composition.scale.setScalar(layout.compositionScale);

          // The spiral centres on the frame, so it has to follow the frame.
          journeyPath = buildJourneySpiral(THREE, journeySpiralParams(layout));
          finalePath = buildFinalePath(THREE, layout.pathKey);

          renderScene();
        };
        resize();

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);

        const scheduleRender = () => {
          if (!visible || frame) return;
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            renderScene();
          });
        };

        const visibilityObserver = new IntersectionObserver(
          ([entry]) => {
            visible = entry?.isIntersecting ?? false;
            if (visible) {
              scheduleRender();
            } else {
              if (frame) {
                window.cancelAnimationFrame(frame);
                frame = 0;
              }
              composition.visible = false;
              renderer.clear();
            }
          },
          { rootMargin: '180px' },
        );
        visibilityObserver.observe(journeyElement ?? canvas);

        const progressSource = container.closest('.mintea-landing');
        const progressObserver = new MutationObserver(scheduleRender);
        if (progressSource) {
          progressObserver.observe(progressSource, {
            attributeFilter: ['style'],
            attributes: true,
          });
          progressSource.addEventListener('scroll', scheduleRender, {
            passive: true,
          });
        }

        disposeScene = () => {
          window.cancelAnimationFrame(frame);
          resizeObserver.disconnect();
          visibilityObserver.disconnect();
          progressObserver.disconnect();
          progressSource?.removeEventListener('scroll', scheduleRender);
          scene.environment = null;
          environmentTarget.dispose();
          mintLeaf?.dispose();
          mintLeaf = null;
          textures.forEach((texture) => texture.dispose());
          geometries.forEach((geometry) => geometry.dispose());
          materials.forEach((material) => material.dispose());
          renderer.dispose();
        };

        void loadMintLeafModel(THREE)
          .then((model) => {
            if (cancelled) {
              model.dispose();
              return;
            }
            mintLeaf = model;
            leafRig.add(model.object);
            setReady(true);
            renderScene();
          })
          .catch((error: unknown) => {
            if (!cancelled) {
              console.warn('The finale mint leaf could not be loaded.', error);
            }
          });

        renderScene();
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn('The final tea scene could not be initialized.', error);
        }
      });
    };

    if ('IntersectionObserver' in window) {
      bootstrapObserver = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          bootstrapObserver?.disconnect();
          bootstrapObserver = null;
          startScene();
        },
        { rootMargin: '480px' },
      );
      bootstrapObserver.observe(
        container.closest('.landing-leaf-journey') ?? container,
      );
    } else {
      startScene();
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(clipFrame);
      landingRoot?.removeEventListener('scroll', scheduleFinaleClip);
      window.removeEventListener('resize', scheduleFinaleClip);
      bootstrapObserver?.disconnect();
      disposeScene();
    };
  }, [journeyProgressRef, progressRef, reducedMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={className}
      data-ready={ready ? 'true' : 'false'}
      style={{
        minHeight: 420,
        overflow: 'hidden',
        pointerEvents: 'none',
        position: 'relative',
        width: '100%',
        ...style,
      }}
    >
      <div className="landing-final-tea-poster-clip">
        <div className="landing-final-tea-poster">
          <div className="landing-final-poster-glow" />
          <div className="landing-final-poster-saucer" />
          <div className="landing-final-poster-cup">
            <div className="landing-final-poster-handle" />
            <div className="landing-final-poster-tea" />
          </div>
          <img
            alt=""
            className="landing-final-poster-leaf"
            decoding="async"
            src="/assets/landing/mint-leaf-poster-v1.webp"
          />
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          height: '100%',
          opacity: ready ? 1 : 0,
          transition: 'opacity 500ms ease',
          width: '100%',
        }}
      />
    </div>
  );
}

export default FinalTeaScene;

export type { FinalTeaSceneProps };
