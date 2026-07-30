import { useEffect, useRef, type MutableRefObject } from 'react';

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

    void import('three').then((THREE) => {
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
      renderer.toneMappingExposure = 1.12;
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x071712, 0.052);

      const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
      camera.position.set(0, 0.15, 8);

      const universe = new THREE.Group();
      universe.rotation.set(-0.12, -0.25, 0.06);
      scene.add(universe);

      const geometries: Array<import('three').BufferGeometry> = [];
      const materials: Array<import('three').Material> = [];

      const trackGeometry = <T extends import('three').BufferGeometry>(
        geometry: T,
      ) => {
        geometries.push(geometry);
        return geometry;
      };
      const trackMaterial = <T extends import('three').Material>(material: T) => {
        materials.push(material);
        return material;
      };

      const coreMaterial = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          color: 0x38d99b,
          emissive: 0x063f2e,
          emissiveIntensity: 0.7,
          metalness: 0.05,
          opacity: 0.86,
          roughness: 0.12,
          thickness: 1.8,
          transparent: true,
          transmission: 0.34,
        }),
      );
      const core = new THREE.Mesh(
        trackGeometry(new THREE.IcosahedronGeometry(1.36, 5)),
        coreMaterial,
      );
      universe.add(core);

      const innerCore = new THREE.Mesh(
        trackGeometry(new THREE.IcosahedronGeometry(0.82, 2)),
        trackMaterial(
          new THREE.MeshStandardMaterial({
            color: 0x06291f,
            emissive: 0x0b7653,
            emissiveIntensity: 0.9,
            metalness: 0.72,
            roughness: 0.2,
          }),
        ),
      );
      innerCore.rotation.set(0.4, 0.2, -0.3);
      universe.add(innerCore);

      const teaLeaf = new THREE.Group();
      const leafShape = new THREE.Shape();
      leafShape.moveTo(0, -0.9);
      leafShape.bezierCurveTo(-0.72, -0.52, -0.8, 0.42, 0, 0.98);
      leafShape.bezierCurveTo(0.8, 0.42, 0.72, -0.52, 0, -0.9);

      const leaf = new THREE.Mesh(
        trackGeometry(
          new THREE.ExtrudeGeometry(leafShape, {
            bevelEnabled: true,
            bevelSegments: 4,
            bevelSize: 0.035,
            bevelThickness: 0.025,
            curveSegments: 24,
            depth: 0.035,
          }),
        ),
        trackMaterial(
          new THREE.MeshPhysicalMaterial({
            clearcoat: 1,
            color: 0xbaffd5,
            emissive: 0x0e6f4b,
            emissiveIntensity: 0.65,
            opacity: 0.5,
            roughness: 0.18,
            side: THREE.DoubleSide,
            transparent: true,
            transmission: 0.36,
          }),
        ),
      );
      leaf.geometry.center();
      leaf.rotation.z = -0.36;
      leaf.scale.setScalar(0.72);
      teaLeaf.add(leaf);

      const leafVeinMaterial = trackMaterial(
        new THREE.MeshBasicMaterial({
          blending: THREE.AdditiveBlending,
          color: 0xe4fff0,
          depthWrite: false,
          opacity: 0.68,
          transparent: true,
        }),
      );
      const leafVeinPaths = [
        [
          new THREE.Vector3(0, -0.66, 0.055),
          new THREE.Vector3(0.02, -0.18, 0.065),
          new THREE.Vector3(-0.02, 0.34, 0.065),
          new THREE.Vector3(0, 0.7, 0.055),
        ],
        [
          new THREE.Vector3(0, -0.12, 0.06),
          new THREE.Vector3(-0.22, 0.02, 0.065),
          new THREE.Vector3(-0.4, 0.19, 0.055),
        ],
        [
          new THREE.Vector3(0, 0.12, 0.06),
          new THREE.Vector3(0.23, 0.25, 0.065),
          new THREE.Vector3(0.39, 0.42, 0.055),
        ],
      ];
      leafVeinPaths.forEach((points, index) => {
        const vein = new THREE.Mesh(
          trackGeometry(
            new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3(points),
              index === 0 ? 32 : 20,
              0.009,
              5,
              false,
            ),
          ),
          leafVeinMaterial,
        );
        vein.rotation.z = -0.36;
        vein.scale.setScalar(0.72);
        teaLeaf.add(vein);
      });
      teaLeaf.position.set(0.12, 0.02, 0.86);
      teaLeaf.rotation.x = -0.08;
      universe.add(teaLeaf);

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
      universe.add(steamGroup);

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
      universe.add(amberRing);

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
        universe.add(ring);
        return ring;
      });

      const cardMaterial = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 1,
          color: 0xf0fff9,
          emissive: 0x154c3b,
          emissiveIntensity: 0.18,
          metalness: 0.06,
          opacity: 0.86,
          roughness: 0.2,
          transparent: true,
          transmission: 0.08,
        }),
      );
      const mintCardMaterial = trackMaterial(
        new THREE.MeshPhysicalMaterial({
          clearcoat: 1,
          color: 0x26c88e,
          emissive: 0x0b5b42,
          emissiveIntensity: 0.42,
          metalness: 0.12,
          opacity: 0.9,
          roughness: 0.16,
          transparent: true,
        }),
      );

      const cardGeometry = trackGeometry(
        new THREE.BoxGeometry(1.18, 0.76, 0.085, 3, 3, 1),
      );
      const cardEdgesGeometry = trackGeometry(
        new THREE.EdgesGeometry(cardGeometry, 22),
      );
      const edgeMaterial = trackMaterial(
        new THREE.LineBasicMaterial({
          color: 0xb7ffe0,
          opacity: 0.45,
          transparent: true,
        }),
      );
      const cards = Array.from({ length: 7 }, (_, index) => {
        const cardGroup = new THREE.Group();
        const angle = (index / 7) * Math.PI * 2;
        const radius = index % 2 === 0 ? 3.1 : 2.65;
        cardGroup.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius * 0.62,
          Math.sin(angle * 1.7) * 1.2,
        );
        cardGroup.userData.baseY = cardGroup.position.y;
        cardGroup.rotation.set(
          Math.sin(angle) * 0.45,
          angle + Math.PI / 2,
          Math.cos(angle) * 0.28,
        );

        const card = new THREE.Mesh(
          cardGeometry,
          index === 1 || index === 5 ? mintCardMaterial : cardMaterial,
        );
        cardGroup.add(card);
        cardGroup.add(new THREE.LineSegments(cardEdgesGeometry, edgeMaterial));
        universe.add(cardGroup);
        return cardGroup;
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

      scene.add(new THREE.HemisphereLight(0xeafff6, 0x031711, 2.6));
      const keyLight = new THREE.DirectionalLight(0xffffff, 4.6);
      keyLight.position.set(4.5, 6, 7);
      scene.add(keyLight);
      const mintLight = new THREE.PointLight(0x2fe3a6, 52, 16, 1.7);
      mintLight.position.set(-3.5, -1.3, 3.6);
      scene.add(mintLight);
      const lavenderLight = new THREE.PointLight(0x9b91ff, 25, 14, 1.8);
      lavenderLight.position.set(3.8, -2.8, -0.5);
      scene.add(lavenderLight);
      const amberLight = new THREE.PointLight(0xffa45d, 34, 13, 1.9);
      amberLight.position.set(3.4, 3.2, 2.2);
      scene.add(amberLight);

      let frame = 0;
      let pointerX = 0;
      let pointerY = 0;
      let visible = true;
      let width = 1;
      let height = 1;

      const resize = () => {
        const rect = container.getBoundingClientRect();
        width = Math.max(rect.width, 1);
        height = Math.max(rect.height, 1);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
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
      const render = () => {
        frame = window.requestAnimationFrame(render);
        if (!visible && !reducedMotion) return;

        const elapsed = reducedMotion ? 0.8 : (Date.now() - startedAt) / 1000;
        const progress = reducedMotion ? 0.08 : progressRef.current;
        const mobile = width < 720;
        const targetX = mobile
          ? 0
          : progress < 0.24
            ? 1.7
            : progress < 0.5
              ? -1.55
              : progress < 0.75
                ? 1.35
                : 0;
        const targetY =
          progress < 0.25 ? 0.05 : progress < 0.75 ? 0.12 : -0.05;

        universe.position.x +=
          (targetX + pointerX * (mobile ? 0.06 : 0.16) - universe.position.x) *
          0.045;
        universe.position.y +=
          (targetY - pointerY * (mobile ? 0.04 : 0.11) - universe.position.y) *
          0.045;
        universe.rotation.y =
          -0.2 + progress * Math.PI * 2.8 + elapsed * 0.055;
        universe.rotation.x =
          -0.12 + Math.sin(progress * Math.PI * 3.2) * 0.2;
        universe.rotation.z =
          0.05 + Math.sin(elapsed * 0.24 + progress * 5) * 0.08;

        core.rotation.y = elapsed * 0.16 + progress * 2.2;
        core.rotation.x = elapsed * 0.1 - progress * 1.4;
        innerCore.rotation.y = -elapsed * 0.21 - progress;
        innerCore.rotation.x = elapsed * 0.13;
        teaLeaf.rotation.y =
          Math.sin(elapsed * 0.32 + progress * 3.4) * 0.18 - progress * 0.2;
        teaLeaf.rotation.z =
          Math.sin(elapsed * 0.22 + progress * 4) * 0.07;
        steamGroup.rotation.z =
          Math.sin(elapsed * 0.18 + progress * 2.8) * 0.1;
        steamMaterials.forEach((material, index) => {
          material.opacity =
            (index === 1 ? 0.16 : 0.22) +
            Math.sin(elapsed * 0.52 + index * 1.8) * 0.045;
        });
        amberRing.rotation.z = -0.18 + elapsed * 0.025 - progress * 0.4;

        rings.forEach((ring, index) => {
          ring.rotation.z += 0.0008 * (index + 1);
          ring.rotation.y +=
            (index % 2 === 0 ? 1 : -1) * (0.00065 + progress * 0.00045);
          const pulse =
            1 + Math.sin(elapsed * 0.42 + progress * 8 + index) * 0.018;
          ring.scale.setScalar(pulse);
        });

        cards.forEach((card, index) => {
          const phase = elapsed * 0.18 + progress * 4.4 + index * 0.85;
          const baseY = card.userData.baseY as number;
          card.position.y +=
            (baseY + Math.sin(phase) * 0.08 - card.position.y) * 0.04;
          card.rotation.z +=
            Math.sin(elapsed * 0.22 + index) * 0.00022 +
            (index % 2 === 0 ? 1 : -1) * 0.00035;
        });

        particles.rotation.y = elapsed * 0.012 - progress * 0.35;
        particles.rotation.z = progress * 0.08;
        camera.position.z =
          (mobile ? 9.4 : 8) - Math.sin(progress * Math.PI) * 0.75;
        camera.position.y = Math.sin(progress * Math.PI * 2) * 0.18;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);

        if (reducedMotion) window.cancelAnimationFrame(frame);
      };
      render();

      disposeScene = () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', onPointerMove);
        resizeObserver.disconnect();
        visibilityObserver.disconnect();
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        renderer.dispose();
      };
    });

    return () => {
      cancelled = true;
      disposeScene();
    };
  }, [progressRef]);

  return (
    <div ref={containerRef} className="landing-universe" aria-hidden="true">
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
        />
        <path
          className="landing-chart-line"
          d="M0 184C48 171 70 184 112 150s69-32 108-17 71-58 111-45 48 44 87 20 62-82 98-66 45 10 84-25"
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
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
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
    if (reducedMotion) return;

    let cleanup = () => {};
    let cancelled = false;

    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (cancelled) return;

        const gsap = gsapModule.gsap;
        const ScrollTrigger = scrollTriggerModule.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);

        const scenes = Array.from(
          root.querySelectorAll<HTMLElement>('.landing-scene-copy'),
        );
        const dots = Array.from(
          root.querySelectorAll<HTMLElement>('.landing-progress-dot'),
        );
        const heroDecor = Array.from(
          root.querySelectorAll<HTMLElement>('.landing-floating-metric'),
        );
        const contexts: Array<{ revert: () => void }> = [];

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
          .to(heroDecor, { autoAlpha: 0, duration: 0.24, y: -18 }, 0.42)
          .to(scenes[0], { autoAlpha: 0, duration: 0.28, y: -70 }, 0.58)
          .to(scenes[1], { autoAlpha: 1, duration: 0.3, y: 0 }, 0.72)
          .to(scenes[1], { autoAlpha: 0, duration: 0.28, y: -70 }, 1.6)
          .to(scenes[2], { autoAlpha: 1, duration: 0.3, y: 0 }, 1.74)
          .to(scenes[2], { autoAlpha: 0, duration: 0.28, y: -70 }, 2.62)
          .to(scenes[3], { autoAlpha: 1, duration: 0.3, y: 0 }, 2.76)
          .to({}, { duration: 0.7 });

        root
          .querySelectorAll<HTMLElement>('.landing-reveal')
          .forEach((element) => {
            const animation = gsap.fromTo(
              element,
              { autoAlpha: 0, y: 48 },
              {
                autoAlpha: 1,
                duration: 0.9,
                ease: 'power3.out',
                scrollTrigger: {
                  scroller: root,
                  trigger: element,
                  start: 'top 86%',
                  once: true,
                },
                y: 0,
              },
            );
            contexts.push(animation);
          });

        cleanup = () => {
          timeline.scrollTrigger?.kill();
          timeline.kill();
          contexts.forEach((context) => context.revert());
          ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
        };
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

          <div className="landing-floating-metric landing-floating-metric-one">
            <span>Net worth</span>
            <strong>$284,620</strong>
            <small>↗ 12.4% this year</small>
          </div>
          <div className="landing-floating-metric landing-floating-metric-two">
            <span>Cash flow</span>
            <strong>+$3,840</strong>
            <small>July</small>
          </div>
        </div>
      </section>

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

      <section className="landing-final-cta">
        <div className="landing-final-orb" aria-hidden="true" />
        <div className="landing-final-copy landing-reveal">
          <BrandMark />
          <span>Take a sip. See the whole picture.</span>
          <h2>Know what you have. Understand what changed.</h2>
          <p>
            Connect your first account and let a clearer financial picture come
            together.
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
      </section>

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
  );
}
