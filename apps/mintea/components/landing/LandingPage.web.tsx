import { useEffect, useRef, type MutableRefObject } from 'react';

// Web-only, and imported here rather than from global.css so the native
// bundler never sees it — see the note at the top of landing.css.
import '../../landing.css';

import {
  loadMintLeafModel,
  type MintLeafModel,
} from './mintLeafModel.web';
import { FinalTeaScene } from './FinalTeaScene.web';

const SIGN_IN_PATH = '/sign-in';
const SIGN_UP_PATH = '/sign-in?mode=sign-up';
const DASHBOARD_PATH = '/dashboard';
const TRANSACTIONS_PATH = '/transactions';

function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      className="landing-brand-mark"
      viewBox="0 0 64 64"
    >
      <defs>
        <linearGradient id="landing-brand-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#72f0bd" />
          <stop offset="0.55" stopColor="#20b47e" />
          <stop offset="1" stopColor="#0b6a4e" />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="62"
        height="62"
        rx="18"
        fill="url(#landing-brand-gradient)"
      />
      <path
        d="M14.5 43.5 22.5 18 32 37.5 41.5 18l8 25.5"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="6.5"
      />
      <path
        d="M41.5 13.5c4-4.6 8.2-4.8 11.7-3.2-1 5.6-4.3 8.8-10.4 9.2"
        fill="none"
        stroke="#c6ffe8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 2c.7 5.2 4.2 8.7 9.4 9.4-5.2.7-8.7 4.2-9.4 9.4-.7-5.2-4.2-8.7-9.4-9.4C7.8 10.7 11.3 7.2 12 2Z" />
    </svg>
  );
}

function FinancialUniverse({
  progressRef,
}: {
  progressRef: MutableRefObject<number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) return;

    let cancelled = false;
    let disposeScene = () => {};

    container.classList.remove('is-leaf-ready');

    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) {
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([
      import('three'),
      import('three/addons/environments/RoomEnvironment.js'),
    ]).then(([THREE, { RoomEnvironment }]) => {
      if (cancelled) return;

      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.94;
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x071712, 0.052);

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const roomEnvironment = new RoomEnvironment();
      const environmentTarget = pmremGenerator.fromScene(roomEnvironment, 0.04);
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

      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(0, 0.15, 8.2);

      const universe = new THREE.Group();
      universe.rotation.set(-0.08, 0, 0.05);
      scene.add(universe);

      const orbitRig = new THREE.Group();
      orbitRig.name = 'FinancialOrbitRig';
      universe.add(orbitRig);

      const leafRig = new THREE.Group();
      leafRig.name = 'MintLeafRig';
      universe.add(leafRig);

      const cardTextures = new Set<import('three').Texture>();
      const geometries = new Set<import('three').BufferGeometry>();
      const materials = new Set<import('three').Material>();

      const trackGeometry = <T extends import('three').BufferGeometry>(
        geometry: T,
      ) => {
        geometries.add(geometry);
        return geometry;
      };
      const trackMaterial = <T extends import('three').Material>(material: T) => {
        materials.add(material);
        return material;
      };

      let mintLeaf: MintLeafModel | null = null;
      let leafReveal = 0;

      const steamMaterials: Array<import('three').MeshBasicMaterial> = [];
      const steamGroup = new THREE.Group();
      [
        [
          new THREE.Vector3(-0.52, 1.02, 0.2),
          new THREE.Vector3(-0.76, 1.54, 0.32),
          new THREE.Vector3(-0.28, 2.02, 0.18),
          new THREE.Vector3(-0.54, 2.62, -0.08),
        ],
        [
          new THREE.Vector3(0, 1.12, 0.08),
          new THREE.Vector3(0.35, 1.62, 0.24),
          new THREE.Vector3(-0.06, 2.18, 0.1),
          new THREE.Vector3(0.2, 2.76, -0.16),
        ],
        [
          new THREE.Vector3(0.48, 1.05, -0.02),
          new THREE.Vector3(0.7, 1.48, 0.12),
          new THREE.Vector3(0.34, 1.94, 0.06),
          new THREE.Vector3(0.64, 2.46, -0.22),
        ],
      ].forEach((points, index) => {
        const steamMaterial = trackMaterial(
          new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            color: index === 1 ? 0xffe1b5 : 0xd7fff0,
            depthWrite: false,
            opacity: index === 1 ? 0.18 : 0.25,
            transparent: true,
          }),
        );
        steamMaterials.push(steamMaterial);
        steamGroup.add(
          new THREE.Mesh(
            trackGeometry(
              new THREE.TubeGeometry(
                new THREE.CatmullRomCurve3(points),
                44,
                index === 1 ? 0.012 : 0.016,
                6,
                false,
              ),
            ),
            steamMaterial,
          ),
        );
      });
      orbitRig.add(steamGroup);

      const amberRing = new THREE.Mesh(
        trackGeometry(new THREE.TorusGeometry(1.52, 0.012, 8, 120)),
        trackMaterial(
          new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            color: 0xffc77b,
            depthWrite: false,
            opacity: 0.34,
            transparent: true,
          }),
        ),
      );
      amberRing.rotation.set(1.14, 0.22, -0.18);
      orbitRig.add(amberRing);

      const ringMaterial = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 1,
          color: 0xbdf8dc,
          emissive: 0x0b4f39,
          emissiveIntensity: 0.45,
          metalness: 0.62,
          opacity: 0.8,
          roughness: 0.16,
          transparent: true,
        }),
      );
      const rings = [
        [2.05, 0.025, 0.04, 0.28, 0.12],
        [2.62, 0.018, 1.22, 0.1, 0.72],
        [3.16, 0.013, 0.8, 1.18, -0.18],
      ].map(([radius, tube, x, y, z]) => {
        const ring = new THREE.Mesh(
          trackGeometry(
            new THREE.TorusGeometry(radius, tube, 12, radius > 3 ? 150 : 110),
          ),
          ringMaterial,
        );
        ring.rotation.set(x, y, z);
        ring.userData.radius = radius;
        orbitRig.add(ring);
        return ring;
      });

      const cardMaterial = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 0.55,
          color: 0x9bcfba,
          emissive: 0x0b3929,
          emissiveIntensity: 0.14,
          metalness: 0.06,
          opacity: 0.46,
          roughness: 0.34,
          // Not transmissive: at 0.14 under an already 0.46-opacity surface it
          // changed almost nothing, but it forced three.js to render the whole
          // scene a second time into a transmission target every frame.
          transparent: true,
        }),
      );
      const mintCardMaterial = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 0.6,
          color: 0x1ca878,
          emissive: 0x0b5b42,
          emissiveIntensity: 0.34,
          metalness: 0.12,
          opacity: 0.6,
          roughness: 0.27,
          transparent: true,
        }),
      );

      /**
       * The orbiting slabs carry their content as a drawn texture.
       *
       * They are real meshes tumbling in 3D, so the only way to put readable
       * words on them is to paint the words into a canvas and map it onto a
       * face. Drawn at 3x the mesh's on-screen size so the type survives the
       * angles the orbit puts them through.
       */
      const cardFaceTexture = (
        label: string,
        value: string,
        sub: string,
      ) => {
        const width = 640;
        const height = 412;
        const faceCanvas = document.createElement('canvas');
        faceCanvas.width = width;
        faceCanvas.height = height;
        const ctx = faceCanvas.getContext('2d');

        if (ctx) {
          const pad = 54;
          ctx.textBaseline = 'top';

          ctx.fillStyle = '#7dffc4';
          ctx.font = '800 34px Inter, system-ui, sans-serif';
          // Tracking has to be drawn by hand; canvas has no letter-spacing.
          let x = pad;
          for (const character of label.toUpperCase()) {
            ctx.fillText(character, x, pad);
            x += ctx.measureText(character).width + 5;
          }

          ctx.fillStyle = '#ffffff';
          ctx.font = '800 84px Inter, system-ui, sans-serif';
          ctx.fillText(value, pad, pad + 74);

          ctx.fillStyle = '#c8ffe8';
          ctx.font = '600 34px Inter, system-ui, sans-serif';
          ctx.fillText(sub, pad, pad + 188);
        }

        const texture = new THREE.CanvasTexture(faceCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        cardTextures.add(texture);
        return texture;
      };

      // Only features that ship. Net worth and cash flow are deliberately
      // absent: the two DOM readouts already own those numbers.
      const cardFaces: Array<[string, string, string]> = [
        ['Accounts', '12 linked', 'Banks, cards, loans'],
        ['Monthly budget', '68% used', '11 days left'],
        ['Shared household', '2 members', 'One set of books'],
        ['Smart rules', '94% sorted', 'No manual tagging'],
        ['Reports', '12 months', 'Income vs spending'],
        ['Transactions', 'All clean', 'Merchants tidied'],
        ['Property', 'Tracked', 'Homes and value'],
      ];

      /**
       * A point on one of the visible orbit rings.
       *
       * The torus is built in the XY plane, so a point on its circle is
       * (cos, sin, 0) * radius before the ring's own tilt is applied. Running
       * that through the same euler the ring uses puts a card exactly on the
       * line you can see, instead of merely near it.
       */
      const pointOnRing = (
        ring: import('three').Mesh,
        turn: number,
        target: import('three').Vector3,
      ) => {
        const radius = ring.userData.radius as number;
        return target
          .set(Math.cos(turn) * radius, Math.sin(turn) * radius, 0)
          .applyEuler(ring.rotation);
      };
      const ringPoint = new THREE.Vector3();

      /**
       * Turn a card to follow its orbit.
       *
       * Its face points radially outward from the orbit's centre, so as the
       * rig turns the card turns with it — it presents its face on the near
       * side and its back on the far side, rather than swivelling to track the
       * viewer. Up is world up rather than the ring's own normal: a near
       * vertical ring's normal points at the camera, which would lay the card
       * flat and edge-on. Building the basis off world up keeps every card
       * upright, so the copy can never end up on its head.
       */
      const orientAlongOrbit = (
        group: import('three').Object3D,
        position: import('three').Vector3,
      ) => {
        const forward = orbitForward.copy(position).normalize();
        const right = orbitRight.crossVectors(worldUp, forward);
        if (right.lengthSq() < 1e-6) return;
        right.normalize();
        const up = orbitUp.crossVectors(forward, right).normalize();
        group.quaternion.setFromRotationMatrix(
          orbitBasis.makeBasis(right, up, forward),
        );
      };
      const worldUp = new THREE.Vector3(0, 1, 0);
      const orbitForward = new THREE.Vector3();
      const orbitRight = new THREE.Vector3();
      const orbitUp = new THREE.Vector3();
      const orbitBasis = new THREE.Matrix4();

      const cardGeometry = trackGeometry(
        new THREE.BoxGeometry(1.18, 0.76, 0.085, 3, 3, 1),
      );
      const cardFaceGeometry = trackGeometry(
        new THREE.PlaneGeometry(1.06, 0.683),
      );
      const cardEdgesGeometry = trackGeometry(
        new THREE.EdgesGeometry(cardGeometry, 22),
      );
      const edgeMaterial = trackMaterial(
        new THREE.LineBasicMaterial({
          color: 0xb7ffe0,
          opacity: 0.26,
          transparent: true,
        }),
      );
      const cards = Array.from({ length: 7 }, (_, index) => {
        const cardGroup = new THREE.Group();
        const angle = (index / 7) * Math.PI * 2;
        // Spread across the three rings so each visibly belongs to one.
        cardGroup.position.copy(
          pointOnRing(rings[index % rings.length]!, angle, ringPoint),
        );
        cardGroup.userData.baseY = cardGroup.position.y;
        orientAlongOrbit(cardGroup, cardGroup.position);
        cardGroup.scale.setScalar(0.78);

        const card = new THREE.Mesh(
          cardGeometry,
          index === 1 || index === 5 ? mintCardMaterial : cardMaterial,
        );
        cardGroup.add(card);
        cardGroup.add(new THREE.LineSegments(cardEdgesGeometry, edgeMaterial));

        // The content sits on its own plane just proud of the slab's front
        // face, rather than as a map on the box: a box map would repeat the
        // texture onto all six sides. Unlit, so the copy stays legible
        // wherever the orbit carries the card.
        const [label, value, sub] = cardFaces[index % cardFaces.length]!;
        const faceMaterial = trackMaterial(
          new THREE.MeshBasicMaterial({
            depthWrite: false,
            map: cardFaceTexture(label, value, sub),
            opacity: 1,
            // The renderer runs ACES tone mapping at 0.94 exposure, and every
            // material inherits it. ACES rolls highlights off, so #ffffff came
            // out a mid grey no matter how bright the texture was — the copy
            // looked washed out because it was being tone mapped, not because
            // anything behind it was see-through. Opting this material out is
            // what actually makes the text read at full strength; the cards
            // themselves keep the graded look.
            toneMapped: false,
            transparent: true,
          }),
        );

        const face = new THREE.Mesh(cardFaceGeometry, faceMaterial);
        face.position.z = 0.046;
        cardGroup.add(face);

        // The same face on the back, turned about Y rather than mirrored.
        // Scaling by -1 would also point it outward, but it would flip the
        // texture and the copy would read right to left. A rotation carries
        // the texture's left edge to the far viewer's left, so the words read
        // normally from either side. Both planes stay FrontSide, so each is
        // only drawn when it is the one facing you.
        const backFace = new THREE.Mesh(cardFaceGeometry, faceMaterial);
        backFace.position.z = -0.046;
        backFace.rotation.y = Math.PI;
        cardGroup.add(backFace);
        orbitRig.add(cardGroup);
        return cardGroup;
      });

      /**
       * The two headline numbers, on their own inner ring.
       *
       * They sit on a horizontal circle through the middle of the scene rather
       * than the tilted ellipse the feature cards use, so they sweep steadily
       * left to right across the front of the leaf. No per-frame code is
       * needed: orbitRig already turns about Y, and being parented to it
       * carries them round. Each is rotated to face radially outward, so it is
       * square to the viewer exactly when it passes the front.
       */
      const innerMetricRadius = 2.3;
      const innerMetricCards: Array<import('three').Group> = [];
      ([
        ['Net worth', '$284,620', 'Up 12.4% this year'],
        ['Cash flow', '+$3,840', 'July'],
      ] as Array<[string, string, string]>).forEach(([label, value, sub], index, list) => {
        const angle = (index / list.length) * Math.PI * 2;
        const cardGroup = new THREE.Group();
        // Ring 1 is the most horizontal of the three, so these two sweep left
        // to right across the front rather than arcing over the top.
        cardGroup.position.copy(pointOnRing(rings[1]!, angle, ringPoint));
        cardGroup.userData.baseY = cardGroup.position.y;
        orientAlongOrbit(cardGroup, cardGroup.position);
        cardGroup.scale.setScalar(0.86);

        cardGroup.add(new THREE.Mesh(cardGeometry, mintCardMaterial));
        cardGroup.add(new THREE.LineSegments(cardEdgesGeometry, edgeMaterial));

        const faceMaterial = trackMaterial(
          new THREE.MeshBasicMaterial({
            depthWrite: false,
            map: cardFaceTexture(label, value, sub),
            opacity: 1,
            toneMapped: false,
            transparent: true,
          }),
        );
        const front = new THREE.Mesh(cardFaceGeometry, faceMaterial);
        front.position.z = 0.046;
        cardGroup.add(front);
        const back = new THREE.Mesh(cardFaceGeometry, faceMaterial);
        back.position.z = -0.046;
        back.rotation.y = Math.PI;
        cardGroup.add(back);

        orbitRig.add(cardGroup);
        innerMetricCards.push(cardGroup);
      });

      const particleCount = 240;
      const particlePositions = new Float32Array(particleCount * 3);
      for (let index = 0; index < particleCount; index += 1) {
        const radius = 3.2 + Math.random() * 5.8;
        const angle = Math.random() * Math.PI * 2;
        particlePositions[index * 3] = Math.cos(angle) * radius;
        particlePositions[index * 3 + 1] =
          (Math.random() - 0.5) * 6.8 + Math.sin(angle * 2) * 0.6;
        particlePositions[index * 3 + 2] =
          Math.sin(angle) * radius * 0.44 + (Math.random() - 0.5) * 4;
      }
      const particleGeometry = trackGeometry(new THREE.BufferGeometry());
      particleGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(particlePositions, 3),
      );
      const particles = new THREE.Points(
        particleGeometry,
        trackMaterial(
          new THREE.PointsMaterial({
            color: 0xb6ffe1,
            opacity: 0.44,
            size: 0.026,
            sizeAttenuation: true,
            transparent: true,
          }),
        ),
      );
      scene.add(particles);

      scene.add(new THREE.HemisphereLight(0xeafff6, 0x031711, 0.9));
      const keyLight = new THREE.DirectionalLight(0xfff6e9, 1.75);
      keyLight.position.set(4.2, 5.5, 6.5);
      scene.add(keyLight);
      const mintLight = new THREE.PointLight(0x2fe3a6, 18, 16, 1.7);
      mintLight.position.set(-3.5, -1.5, 3.4);
      scene.add(mintLight);
      const lavenderLight = new THREE.PointLight(0x9b91ff, 9, 14, 1.8);
      lavenderLight.position.set(3.8, -2.8, -0.5);
      scene.add(lavenderLight);
      const amberLight = new THREE.PointLight(0xffb76e, 12, 13, 1.9);
      amberLight.position.set(3.2, 3.4, -2.8);
      scene.add(amberLight);

      let frame = 0;
      let pointerX = 0;
      let pointerY = 0;
      let visible = true;
      let width = 1;
      let height = 1;
      let renderScene = () => {};

      const resize = () => {
        const rect = container.getBoundingClientRect();
        width = Math.max(rect.width, 1);
        height = Math.max(rect.height, 1);
        // See the note in FinalTeaScene: this canvas is fill-bound too, and
        // both are on screen together through the middle of the page.
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, width < 560 ? 1.25 : 1.5),
        );
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (reducedMotion) renderScene();
      };
      resize();

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);

      const visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          visible = entry?.isIntersecting ?? true;
        },
        { rootMargin: '120px' },
      );
      visibilityObserver.observe(canvas);

      const onPointerMove = (event: PointerEvent) => {
        pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
        pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener('pointermove', onPointerMove, { passive: true });

      const startedAt = Date.now();
      renderScene = () => {
        const elapsed = reducedMotion ? 0.8 : (Date.now() - startedAt) / 1000;
        const progress = reducedMotion ? 0.08 : progressRef.current;
        const mobile = width < 560;
        const compact = width <= 820;
        const targetX = compact
          ? mobile
            ? 1.05
            : 0.72
          : progress < 0.24
            ? 1.7
            : progress < 0.5
              ? -1.55
              : progress < 0.75
                ? 1.35
                : 0;
        const targetY = compact
          ? mobile
            ? -0.72
            : -0.46
          : progress < 0.25
            ? 0.05
            : progress < 0.75
              ? 0.12
              : -0.05;

        const desiredX = targetX + pointerX * (compact ? 0.06 : 0.16);
        const desiredY = targetY - pointerY * (compact ? 0.04 : 0.11);
        if (reducedMotion) {
          universe.position.set(desiredX, desiredY, 0);
        } else {
          universe.position.x += (desiredX - universe.position.x) * 0.045;
          universe.position.y += (desiredY - universe.position.y) * 0.045;
        }
        orbitRig.rotation.y =
          -0.2 + progress * Math.PI * 2.8 + elapsed * 0.055;
        universe.rotation.x =
          -0.08 + Math.sin(progress * Math.PI * 3.2) * 0.11;
        universe.rotation.z =
          0.05 + Math.sin(elapsed * 0.24 + progress * 5) * 0.055;

        leafRig.rotation.y =
          -0.34 +
          Math.sin(progress * Math.PI * 1.75) * 0.2 +
          Math.sin(elapsed * 0.24) * 0.065 +
          pointerX * (compact ? 0.025 : 0.075);
        leafRig.rotation.x =
          -0.075 +
          Math.sin(progress * Math.PI * 2.2) * 0.045 -
          pointerY * (compact ? 0.018 : 0.045);
        leafRig.rotation.z =
          -0.2 + Math.sin(elapsed * 0.2 + progress * 4.2) * 0.045;
        if (mintLeaf) {
          mintLeaf.update(elapsed, progress);
          leafReveal = reducedMotion ? 1 : Math.min(1, leafReveal + 0.025);
          leafRig.scale.setScalar(0.9 + leafReveal * 0.1);
        }

        steamGroup.rotation.z =
          Math.sin(elapsed * 0.18 + progress * 2.8) * 0.1;
        steamGroup.children.forEach((steam, index) => {
          steam.visible = !mobile || index === 1;
        });
        steamMaterials.forEach((material, index) => {
          material.opacity =
            (index === 1 ? 0.16 : 0.22) +
            Math.sin(elapsed * 0.52 + index * 1.8) * 0.045;
        });
        amberRing.rotation.z = -0.18 + elapsed * 0.025 - progress * 0.4;

        rings.forEach((ring, index) => {
          ring.visible = !mobile || index < 2;
          ring.rotation.z += 0.0008 * (index + 1);
          ring.rotation.y +=
            (index % 2 === 0 ? 1 : -1) * (0.00065 + progress * 0.00045);
          const pulse =
            1 + Math.sin(elapsed * 0.42 + progress * 8 + index) * 0.018;
          ring.scale.setScalar(pulse);
        });

        cards.forEach((card, index) => {
          card.visible = mobile ? index < 2 : !compact || index < 4;
          // No bob or roll any more: a card that drifts off its ring stops
          // reading as being carried by it, and lookAt owns the rotation now.
        });

        particles.rotation.y = elapsed * 0.012 - progress * 0.35;
        particles.rotation.z = progress * 0.08;
        particleGeometry.setDrawRange(
          0,
          mobile ? 120 : compact ? 180 : particleCount,
        );
        camera.position.z =
          (mobile ? 9.35 : compact ? 8.8 : 8.2) -
          Math.sin(progress * Math.PI) * 0.65;
        camera.position.y = Math.sin(progress * Math.PI * 2) * 0.18;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      };

      const render = () => {
        if (reducedMotion) {
          renderScene();
          return;
        }

        frame = window.requestAnimationFrame(render);
        if (visible) renderScene();
      };
      disposeScene = () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', onPointerMove);
        resizeObserver.disconnect();
        visibilityObserver.disconnect();
        container.classList.remove('is-leaf-ready');
        scene.environment = null;
        environmentTarget.dispose();
        mintLeaf?.dispose();
        mintLeaf = null;
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        cardTextures.forEach((texture) => texture.dispose());
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
          container.classList.add('is-leaf-ready');
          if (reducedMotion) render();
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            console.error('The 3D mint leaf could not be loaded.', error);
          }
        });

      render();
    }).catch((error: unknown) => {
      if (!cancelled) {
        console.warn('The landing-page 3D scene could not be initialized.', error);
      }
    });

    return () => {
      cancelled = true;
      disposeScene();
    };
  }, [progressRef]);

  return (
    <div ref={containerRef} className="landing-universe" aria-hidden="true">
      <img
        alt=""
        className="landing-universe-poster"
        decoding="async"
        fetchPriority="high"
        src="/static/landing/mint-leaf-poster-v1.webp"
      />
      <canvas ref={canvasRef} className="landing-universe-canvas" />
      <div className="landing-universe-glow" />
    </div>
  );
}

function NetWorthPreview() {
  return (
    <div className="landing-chart" aria-hidden="true">
      <div className="landing-chart-head">
        <div>
          <span>Net worth</span>
          <strong>$284,620</strong>
        </div>
        <span className="landing-positive-pill">+12.4%</span>
      </div>
      <svg viewBox="0 0 600 230" preserveAspectRatio="none">
        <defs>
          <linearGradient id="landing-chart-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#26c88e" stopOpacity=".42" />
            <stop offset="1" stopColor="#26c88e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="landing-chart-grid"
          d="M0 48h600M0 108h600M0 168h600"
        />
        <path
          className="landing-chart-area"
          d="M0 184C48 171 70 184 112 150s69-32 108-17 71-58 111-45 48 44 87 20 62-82 98-66 45 10 84-25v213H0Z"
          pathLength="1"
        />
        <path
          className="landing-chart-line"
          d="M0 184C48 171 70 184 112 150s69-32 108-17 71-58 111-45 48 44 87 20 62-82 98-66 45 10 84-25"
          pathLength="1"
        />
        <circle cx="516" cy="42" r="7" />
      </svg>
      <div className="landing-chart-axis">
        <span>Jan</span>
        <span>Mar</span>
        <span>May</span>
        <span>Jul</span>
        <span>Now</span>
      </div>
    </div>
  );
}

function TransactionPreview() {
  const transactions = [
    ['Whole Foods', 'Groceries', '−$84.28', 'WF'],
    ['Acme Payroll', 'Income', '+$4,820.00', 'AP'],
    ['United Airlines', 'Travel', '−$326.40', 'UA'],
  ];

  return (
    <div className="landing-transaction-preview" aria-hidden="true">
      <div className="landing-preview-toolbar">
        <span>Recent activity</span>
        <span>•••</span>
      </div>
      {transactions.map(([name, category, amount, initials]) => (
        <div className="landing-preview-row" key={name}>
          <span className="landing-preview-avatar">{initials}</span>
          <span>
            <strong>{name}</strong>
            <small>{category}</small>
          </span>
          <strong className={amount.startsWith('+') ? 'is-positive' : ''}>
            {amount}
          </strong>
        </div>
      ))}
    </div>
  );
}

function AccountOrbitPreview() {
  return (
    <div className="landing-account-orbit" aria-hidden="true">
      <div className="landing-orbit-ring landing-orbit-ring-one" />
      <div className="landing-orbit-ring landing-orbit-ring-two" />
      <div className="landing-orbit-total">
        <span>All accounts</span>
        <strong>$284.6k</strong>
      </div>
      <div className="landing-orbit-node landing-orbit-node-one">
        <span>C</span>
        <small>Checking</small>
      </div>
      <div className="landing-orbit-node landing-orbit-node-two">
        <span>I</span>
        <small>Investments</small>
      </div>
      <div className="landing-orbit-node landing-orbit-node-three">
        <span>H</span>
        <small>Home</small>
      </div>
    </div>
  );
}

function RulePreview() {
  return (
    <div className="landing-rule-preview" aria-hidden="true">
      <div className="landing-rule-kicker">AUTOMATION 04</div>
      <div className="landing-rule-line">
        <span>When merchant contains</span>
        <strong>Trader Joe&apos;s</strong>
      </div>
      <div className="landing-rule-connector" />
      <div className="landing-rule-line">
        <span>Set category to</span>
        <strong>Groceries</strong>
      </div>
      <div className="landing-rule-status">
        <span />
        Active
      </div>
    </div>
  );
}

function ClarityRitual() {
  const steps = [
    [
      'Connect',
      'Bring accounts, assets, and debts into one private view.',
    ],
    [
      'Organize',
      'Let Mintea clean the details and surface what changed.',
    ],
    [
      'Understand',
      'See the whole picture and make your next move with context.',
    ],
  ];

  return (
    <section id="landing-ritual" className="landing-ritual-section">
      <div className="landing-section-shell">
        <div className="landing-ritual-grid">
          <div className="landing-ritual-copy landing-reveal">
            <span className="landing-dark-eyebrow">
              <SparkIcon />
              A calmer money ritual
            </span>
            <h2>Let the noise settle. See what matters.</h2>
            <p>
              Mintea turns scattered balances, transactions, assets, and debts
              into a check-in you can understand at a glance.
            </p>
          </div>

          <div className="landing-ritual-visual landing-reveal" aria-hidden="true">
            <div className="landing-tea-steam landing-tea-steam-one" />
            <div className="landing-tea-steam landing-tea-steam-two" />
            <div className="landing-tea-steam landing-tea-steam-three" />
            <div className="landing-tea-orbit" />
            <div className="landing-tea-glass">
              <div className="landing-tea-liquid" />
              <svg
                className="landing-tea-leaf"
                viewBox="0 0 180 240"
                fill="none"
              >
                <path
                  d="M90 216C24 164 18 73 92 22c69 59 63 151-2 194Z"
                  fill="currentColor"
                />
                <path d="M91 204V48M91 93 54 125M91 132l38 31" />
              </svg>
              <div className="landing-tea-data-curve" />
            </div>
            <span className="landing-ritual-chip landing-ritual-chip-one">
              6 accounts
            </span>
            <span className="landing-ritual-chip landing-ritual-chip-two">
              1 clear view
            </span>
            <span className="landing-ritual-chip landing-ritual-chip-three">
              Always current
            </span>
          </div>
        </div>

        <ol className="landing-ritual-steps landing-reveal">
          {steps.map(([title, description], index) => (
            <li key={title}>
              <span>0{index + 1}</span>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function LandingPage({
  isAuthenticated = false,
}: {
  isAuthenticated?: boolean;
}) {
  const cinemaRef = useRef<HTMLElement>(null);
  const journeyRef = useRef<HTMLDivElement>(null);
  const finaleRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const journeyProgressRef = useRef(0);
  const finaleProgressRef = useRef(0);
  const finaleTrackRef = useRef<HTMLDivElement | null>(null);
  const primaryPath = isAuthenticated ? DASHBOARD_PATH : SIGN_UP_PATH;
  const accountPath = isAuthenticated ? DASHBOARD_PATH : SIGN_IN_PATH;
  const secondaryAccountPath = isAuthenticated
    ? TRANSACTIONS_PATH
    : SIGN_IN_PATH;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Mintea — Your financial life, steeped in clarity';

    const description =
      'Connect every account and let Mintea turn cash flow, net worth, assets, and debt into one calm, private picture.';
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const createdMeta = !meta;
    const previousDescription = meta?.content;

    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;

    return () => {
      document.title = previousTitle;
      if (createdMeta) {
        meta?.remove();
      } else if (meta && previousDescription !== undefined) {
        meta.content = previousDescription;
      }
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const cinema = cinemaRef.current;
    if (!root || !cinema) return;

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reducedMotion) {
      // Nothing to drive: the scene renders its own static composition under
      // reduced motion, and the custom property this used to publish was read
      // by no CSS rule. Writing it meant a style invalidation of the whole
      // landing subtree on every scroll event, for nothing.
      return;
    }

    let cleanup = () => {};
    let cancelled = false;

    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (cancelled) return;

        const gsap = gsapModule.gsap;
        const ScrollTrigger = scrollTriggerModule.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);

        const isCompact = window.matchMedia('(max-width: 820px)').matches;
        const context = gsap.context(() => {
          const scenes = Array.from(
            root.querySelectorAll<HTMLElement>('.landing-scene-copy'),
          );
          const dots = Array.from(
            root.querySelectorAll<HTMLElement>('.landing-progress-dot'),
          );
          gsap.set(scenes.slice(1), { autoAlpha: 0, y: 70 });
          gsap.set(scenes[0], { autoAlpha: 1, y: 0 });

          const timeline = gsap.timeline({
            defaults: { ease: 'power2.inOut' },
            scrollTrigger: {
              scroller: root,
              trigger: cinema,
              start: 'top top',
              end: 'bottom bottom',
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                progressRef.current = self.progress;
                root.style.setProperty(
                  '--landing-progress',
                  self.progress.toFixed(4),
                );
                const activeIndex = Math.min(
                  scenes.length - 1,
                  Math.floor(self.progress * scenes.length),
                );
                dots.forEach((dot, index) => {
                  dot.dataset.active = String(index === activeIndex);
                });
              },
              scrub: 0.8,
            },
          });

          timeline
            .to(scenes[0], { autoAlpha: 0, duration: 0.28, y: -70 }, 0.58)
            .to(scenes[1], { autoAlpha: 1, duration: 0.3, y: 0 }, 0.72)
            .to(scenes[1], { autoAlpha: 0, duration: 0.28, y: -70 }, 1.6)
            .to(scenes[2], { autoAlpha: 1, duration: 0.3, y: 0 }, 1.74)
            .to(scenes[2], { autoAlpha: 0, duration: 0.28, y: -70 }, 2.62)
            .to(scenes[3], { autoAlpha: 1, duration: 0.3, y: 0 }, 2.76)
            .to({}, { duration: 0.7 });

          const reveal = (
            target: Element | Element[],
            from: Record<string, number>,
            trigger: Element,
            stagger = 0,
          ) => {
            gsap.fromTo(target, { autoAlpha: 0, ...from }, {
              autoAlpha: 1,
              duration: 0.86,
              ease: 'power3.out',
              scrollTrigger: {
                scroller: root,
                trigger,
                start: 'top 86%',
                once: true,
              },
              stagger,
              x: 0,
              y: 0,
              scale: 1,
            });
          };

          const heading = root.querySelector<HTMLElement>('.landing-section-heading');
          if (heading) reveal(heading, { y: 32 }, heading);

          const bentoGrid = root.querySelector<HTMLElement>('.landing-bento-grid');
          const bentoCards = Array.from(
            root.querySelectorAll<HTMLElement>('.landing-bento-grid > article'),
          );
          if (bentoGrid && bentoCards.length) {
            reveal(bentoCards, { y: 54, scale: 0.985 }, bentoGrid, 0.1);
          }

          const chartCard = root.querySelector<HTMLElement>('.landing-bento-chart');
          const chartLine = root.querySelector<SVGPathElement>('.landing-chart-line');
          const chartArea = root.querySelector<SVGPathElement>('.landing-chart-area');
          if (chartCard && chartLine && chartArea) {
            gsap.set(chartLine, { strokeDasharray: 1, strokeDashoffset: 1 });
            gsap.set(chartArea, { opacity: 0 });
            gsap.timeline({
              scrollTrigger: {
                scroller: root,
                trigger: chartCard,
                start: 'top 72%',
                once: true,
              },
            })
              .to(chartLine, { duration: 1.15, ease: 'power2.out', strokeDashoffset: 0 })
              .to(chartArea, { duration: 0.7, opacity: 1 }, 0.18);
          }

          const previewAnimations: Array<{
            card: string;
            targets: string;
            from: Record<string, number>;
            stagger: number;
          }> = [
            {
              card: '.landing-bento-transactions',
              targets: '.landing-preview-row',
              from: { y: 14 },
              stagger: 0.06,
            },
            {
              card: '.landing-bento-accounts',
              targets: '.landing-orbit-total, .landing-orbit-node',
              from: { scale: 0.94 },
              stagger: 0.07,
            },
            {
              card: '.landing-bento-rules',
              targets: '.landing-rule-line, .landing-rule-connector, .landing-rule-status',
              from: { y: 12 },
              stagger: 0.08,
            },
          ];
          previewAnimations.forEach(({ card, targets, from, stagger }) => {
            const cardElement = root.querySelector<HTMLElement>(card);
            const items = Array.from(cardElement?.querySelectorAll<HTMLElement>(targets) ?? []);
            if (cardElement && items.length) reveal(items, from, cardElement, stagger);
          });

          const ritualCopy = root.querySelector<HTMLElement>('.landing-ritual-copy');
          const ritualVisual = root.querySelector<HTMLElement>('.landing-ritual-visual');
          if (ritualCopy) {
            reveal(ritualCopy, isCompact ? { y: 32 } : { x: -32 }, ritualCopy);
          }
          if (ritualVisual) {
            reveal(ritualVisual, isCompact ? { y: 36 } : { x: 32 }, ritualVisual);
            const chips = Array.from(
              ritualVisual.querySelectorAll<HTMLElement>('.landing-ritual-chip'),
            );
            if (chips.length) reveal(chips, { y: 14 }, ritualVisual, 0.08);
          }

          const ritualSteps = root.querySelector<HTMLElement>('.landing-ritual-steps');
          const ritualStepItems = Array.from(
            ritualSteps?.querySelectorAll<HTMLElement>('li') ?? [],
          );
          if (ritualSteps && ritualStepItems.length) {
            reveal(ritualStepItems, { y: 22 }, ritualSteps, 0.1);
          }

          const security = root.querySelector<HTMLElement>('.landing-security-section');
          const securityCopy = root.querySelector<HTMLElement>('.landing-security-copy');
          const securityVisual = root.querySelector<HTMLElement>('.landing-security-visual');
          if (securityCopy) {
            reveal(securityCopy, isCompact ? { y: 32 } : { x: -32 }, securityCopy);
          }
          if (securityVisual) {
            reveal(securityVisual, isCompact ? { y: 36 } : { x: 32 }, securityVisual);
          }
          if (security && securityVisual) {
            gsap.to(securityVisual, {
              ease: 'none',
              opacity: 0.76,
              scale: 0.96,
              scrollTrigger: {
                scroller: root,
                trigger: security,
                start: 'bottom 88%',
                end: 'bottom top',
                scrub: 0.7,
              },
            });
          }

          const finale = finaleRef.current;
          const journey = journeyRef.current;
          const finalCopy = root.querySelector<HTMLElement>('.landing-final-copy');
          const finalWash = root.querySelector<HTMLElement>('.landing-final-wash');
          const finalScrollNote = root.querySelector<HTMLElement>(
            '.landing-final-scroll-note',
          );
          const featureHeading = root.querySelector<HTMLElement>(
            '.landing-section-heading',
          );
          if (journey && featureHeading && finale) {
            ScrollTrigger.create({
              scroller: root,
              trigger: featureHeading,
              start: 'top 82%',
              endTrigger: finale,
              end: 'top top',
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                // Ref only. Publishing this as a custom property on the
                // landing root invalidated style for the entire subtree every
                // frame, and no CSS rule ever read it.
                journeyProgressRef.current = self.progress;
              },
              scrub: 0.62,
            });
          }

          if (finale && finalCopy && finalWash && finalScrollNote) {
            const finalCopyParts = Array.from(finalCopy.children);
            gsap.set(finale, { backgroundColor: '#081511' });
            gsap.set(finalCopy, {
              opacity: 0,
              pointerEvents: 'none',
              y: 30,
            });
            gsap.set(finalCopyParts, { opacity: 0, y: 14 });
            gsap.set(finalWash, { opacity: 0, scale: 0.18 });

            const finaleEntryTimeline = gsap.timeline({
              scrollTrigger: {
                scroller: root,
                trigger: finale,
                start: 'top 98%',
                end: 'top 52%',
                invalidateOnRefresh: true,
                scrub: 0.56,
              },
            });

            finaleEntryTimeline
              .to(finale, {
                backgroundColor: '#4be0a7',
                duration: 0.62,
                ease: 'power2.inOut',
              }, 0)
              .to(finalWash, {
                duration: 0.66,
                ease: 'power2.inOut',
                opacity: 1,
                scale: 2.45,
              }, 0)
              .to(finalScrollNote, {
                color: 'rgba(8, 49, 35, 0.64)',
                duration: 0.48,
              }, 0.08)
              .to(finalCopy, {
                duration: 0.42,
                ease: 'power3.out',
                opacity: 1,
                y: 0,
              }, 0.18)
              .to(finalCopyParts, {
                duration: 0.38,
                ease: 'power3.out',
                opacity: 1,
                stagger: 0.025,
                y: 0,
              }, 0.22)
              .set(finalCopy, { pointerEvents: 'auto' }, 0.24);

            ScrollTrigger.create({
              scroller: root,
              // Drive the finale off the pinned track, not the section. The
              // section is stuck at top:0 for the whole range, which keeps the
              // cup's reveal edge — and so the cup — completely still.
              trigger: finaleTrackRef.current ?? finale,
              start: 'top top',
              end: 'bottom bottom',
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                finaleProgressRef.current = self.progress;
                root.style.setProperty(
                  '--tea-finale-progress',
                  self.progress.toFixed(4),
                );
              },
              scrub: 0.72,
            });
          }
        }, root);

        cleanup = () => context.revert();
      },
    );

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <div ref={rootRef} className="mintea-landing">
      <a className="landing-skip-link" href="#landing-main">
        Skip to content
      </a>

      <section ref={cinemaRef} className="landing-cinema">
        <div className="landing-sticky-frame">
          <div className="landing-aurora landing-aurora-one" />
          <div className="landing-aurora landing-aurora-two" />
          <FinancialUniverse progressRef={progressRef} />

          <header className="landing-nav" aria-label="Main navigation">
            <a className="landing-brand" href="#landing-top" aria-label="Mintea home">
              <BrandMark />
              <span>Mintea</span>
            </a>
            <nav>
              <a className="landing-nav-link" href="#landing-features">
                Features
              </a>
              <a className="landing-nav-link" href="#landing-ritual">
                How it works
              </a>
              <a className="landing-nav-link" href="#landing-security">
                Security
              </a>
              <a className="landing-nav-link" href={accountPath}>
                {isAuthenticated ? 'Dashboard' : 'Sign in'}
              </a>
              <a className="landing-nav-cta" href={primaryPath}>
                {isAuthenticated ? 'Open app' : 'Start free'}
                <ArrowIcon />
              </a>
            </nav>
          </header>

          <main id="landing-main">
            <div id="landing-top" className="landing-scenes">
              <article
                className="landing-scene-copy landing-scene-copy-hero"
                data-scene="0"
              >
                <div className="landing-eyebrow">
                  <span />
                  Your financial life, steeped in clarity
                </div>
                <h1>
                  One calm view of
                  <em>everything you own.</em>
                </h1>
                <p>
                  Bring every account, transaction, asset, and debt together.
                  Mintea turns the noise into a clear picture of what is yours
                  and where it is going.
                </p>
                <div className="landing-hero-actions">
                  <a className="landing-primary-button" href={primaryPath}>
                    {isAuthenticated
                      ? 'Open your dashboard'
                      : 'See your full picture'}
                    <ArrowIcon />
                  </a>
                  <a className="landing-text-button" href="#landing-features">
                    Explore Mintea
                  </a>
                </div>
                <div className="landing-trust-line">
                  <span>Private by design</span>
                  <span>Plaid-connected</span>
                  <span>Free to start</span>
                </div>
              </article>

              <article
                className="landing-scene-copy landing-scene-copy-right"
                data-scene="1"
              >
                <div className="landing-scene-number">01</div>
                <div className="landing-eyebrow">Every account, one orbit</div>
                <h2>Stop checking five apps to understand one life.</h2>
                <p>
                  Connect cash, investments, property, loans, and credit cards.
                  Mintea keeps the full picture current without counting the
                  same shared account twice.
                </p>
                <div className="landing-inline-stat">
                  <strong>1 view</strong>
                  <span>across every institution</span>
                </div>
              </article>

              <article className="landing-scene-copy" data-scene="2">
                <div className="landing-scene-number">02</div>
                <div className="landing-eyebrow">Patterns, not spreadsheets</div>
                <h2>Watch your financial story explain itself.</h2>
                <p>
                  See net worth, cash, assets, debt, and cash flow move over
                  time. Drill into any change without losing the big picture.
                </p>
                <div className="landing-inline-stat">
                  <strong>5 signals</strong>
                  <span>from one timeline</span>
                </div>
              </article>

              <article
                className="landing-scene-copy landing-scene-copy-center"
                data-scene="3"
              >
                <div className="landing-scene-number">03</div>
                <div className="landing-eyebrow">Clarity that compounds</div>
                <h2>Turn every glance into a better next move.</h2>
                <p>
                  Clean transactions, smart rules, useful categories, and
                  monthly reports keep your money organized as your life grows.
                </p>
                <a className="landing-primary-button" href={primaryPath}>
                  {isAuthenticated ? 'Open your dashboard' : 'Start with Mintea'}
                  <ArrowIcon />
                </a>
              </article>
            </div>
          </main>

          <div className="landing-progress" aria-hidden="true">
            <span className="landing-progress-line" />
            {[0, 1, 2, 3].map((index) => (
              <span
                className="landing-progress-dot"
                data-active={String(index === 0)}
                key={index}
              />
            ))}
          </div>

          <div className="landing-scroll-cue" aria-hidden="true">
            <span>Scroll to explore</span>
            <i />
          </div>

        </div>
      </section>

      <div ref={journeyRef} className="landing-leaf-journey">
        <div className="landing-leaf-journey-stage" aria-hidden="true">
          <div className="landing-leaf-journey-sticky">
            <FinalTeaScene
              className="landing-final-tea-scene"
              journeyProgressRef={journeyProgressRef}
              progressRef={finaleProgressRef}
            />
          </div>
        </div>

      <section id="landing-features" className="landing-feature-section">
        <div className="landing-marquee" aria-hidden="true">
          <div>
            TAKE A SIP <span>✦</span> SEE THE WHOLE PICTURE <span>✦</span> MOVE
            WITH CLARITY <span>✦</span> TAKE A SIP <span>✦</span> SEE THE WHOLE
            PICTURE <span>✦</span>
          </div>
        </div>

        <div className="landing-section-shell">
          <div className="landing-section-heading landing-reveal">
            <div>
              <span className="landing-dark-eyebrow">
                <SparkIcon />
                Built for real financial life
              </span>
              <h2>Powerful enough for the details. Calm enough for every day.</h2>
            </div>
            <p>
              Mintea keeps the mechanics out of your way. The information you
              need rises to the surface; everything else stays one tap away.
            </p>
          </div>

          <div className="landing-bento-grid">
            <article className="landing-bento-card landing-bento-chart landing-reveal">
              <div className="landing-card-copy">
                <span>See change</span>
                <h3>Your whole net worth, moving through time.</h3>
                <p>
                  Switch between net worth, cash, assets, debt, and cash flow
                  across the period that matters.
                </p>
              </div>
              <NetWorthPreview />
            </article>

            <article className="landing-bento-card landing-bento-transactions landing-reveal">
              <div className="landing-card-copy">
                <span>Know every dollar</span>
                <h3>Transactions that stay clean.</h3>
                <p>
                  Search, filter, edit, tag, and review without turning money
                  management into a second job.
                </p>
              </div>
              <TransactionPreview />
            </article>

            <article className="landing-bento-card landing-bento-accounts landing-reveal">
              <div className="landing-card-copy">
                <span>Connect the dots</span>
                <h3>Accounts belong together.</h3>
                <p>
                  See where each account came from and keep shared accounts from
                  inflating your totals.
                </p>
              </div>
              <AccountOrbitPreview />
            </article>

            <article className="landing-bento-card landing-bento-rules landing-reveal">
              <div className="landing-card-copy">
                <span>Teach it once</span>
                <h3>Let smart rules do the tidying.</h3>
                <p>
                  Automate the repetitive cleanup while keeping every decision
                  transparent and editable.
                </p>
              </div>
              <RulePreview />
            </article>
          </div>
        </div>
      </section>

      <ClarityRitual />

      <section id="landing-security" className="landing-security-section">
        <div className="landing-section-shell landing-security-grid">
          <div className="landing-security-copy landing-reveal">
            <span className="landing-light-eyebrow">Connection without chaos</span>
            <h2>Your data should make you informed, not exposed.</h2>
            <p>
              Mintea uses secure, read-only financial connections and keeps
              account controls visible. Disconnect an institution, hide empty
              accounts, or edit your data whenever you choose.
            </p>
            <a className="landing-outline-button" href={primaryPath}>
              {isAuthenticated ? 'Review your accounts' : 'Build your private view'}
              <ArrowIcon />
            </a>
          </div>

          <div className="landing-security-visual landing-reveal" aria-hidden="true">
            <div className="landing-shield-orbit landing-shield-orbit-one" />
            <div className="landing-shield-orbit landing-shield-orbit-two" />
            <div className="landing-shield-core">
              <BrandMark />
              <span>READ ONLY</span>
            </div>
            <span className="landing-security-chip landing-security-chip-one">
              Encrypted
            </span>
            <span className="landing-security-chip landing-security-chip-two">
              You control access
            </span>
            <span className="landing-security-chip landing-security-chip-three">
              No credential storage
            </span>
          </div>
        </div>
      </section>

      <div className="landing-finale-shell">
        {/* The track gives the sticky finale a pinned scroll runway. The cup is
            revealed by this section's own edge, so that edge has to stop moving
            before the leaf animates — otherwise the cup reads as sliding. */}
        <div ref={finaleTrackRef} className="landing-final-track">
          <section
            ref={finaleRef}
            className="landing-final-cta"
            aria-labelledby="landing-final-title"
          >
          <div className="landing-final-sticky">
            <div className="landing-final-wash" aria-hidden="true" />
            <div className="landing-final-grain" aria-hidden="true" />
          </div>
          <div className="landing-final-foreground">
            <div className="landing-final-sticky landing-final-foreground-sticky">
              <div className="landing-final-copy">
                <BrandMark />
                <span>Your financial life, steeped in clarity.</span>
                <h2 id="landing-final-title">
                  Take a sip. <em>See the whole picture.</em>
                </h2>
                <p>
                  Know what you have, understand what changed, and make your next
                  move with everything in view.
                </p>
                <div>
                  <a className="landing-primary-button" href={primaryPath}>
                    {isAuthenticated ? 'Open dashboard' : 'Start free'}
                    <ArrowIcon />
                  </a>
                  <a
                    className="landing-text-button landing-text-button-light"
                    href={secondaryAccountPath}
                  >
                    {isAuthenticated ? 'View transactions' : 'I already use Mintea'}
                  </a>
                </div>
              </div>
              <div className="landing-final-scroll-note" aria-hidden="true">
                <span />
                Steep into clarity
              </div>
            </div>
          </div>
          </section>
        </div>

        <footer className="landing-footer">
          <a className="landing-brand landing-brand-dark" href="#landing-top">
            <BrandMark />
            <span>Mintea</span>
          </a>
          <p>Your financial life, steeped in clarity.</p>
          <div>
            <a href={accountPath}>
              {isAuthenticated ? 'Dashboard' : 'Sign in'}
            </a>
            <a href="#landing-security">Security</a>
            <span>© {new Date().getFullYear()} Mintea</span>
          </div>
        </footer>
      </div>
      </div>
    </div>
  );
}
