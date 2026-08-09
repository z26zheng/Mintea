import type * as ThreeNamespace from 'three';

const MINT_LEAF_MODEL_URL = '/assets/landing/mint-leaf-v1.glb';

type ThreeModule = typeof ThreeNamespace;

type ClosableTextureSource = { close: () => void };

export type MintLeafModel = {
  dispose: () => void;
  object: ThreeNamespace.Group;
  /**
   * Cross-fades the whole leaf. The hero and the journey each own their own
   * renderer, so a leaf that travels the page has to be two models handing
   * off — one fading out exactly as the other fades in.
   */
  setOpacity: (opacity: number) => void;
  update: (elapsed: number, progress: number) => void;
};

function materialTextures(material: ThreeNamespace.Material) {
  return Object.values(material).filter(
    (value): value is ThreeNamespace.Texture =>
      Boolean(value && typeof value === 'object' && 'isTexture' in value),
  );
}

function closableTextureSource(
  texture: ThreeNamespace.Texture,
): ClosableTextureSource | null {
  const data: unknown = texture.source?.data;
  if (
    data &&
    typeof data === 'object' &&
    'close' in data &&
    typeof data.close === 'function'
  ) {
    return data as ClosableTextureSource;
  }

  return null;
}

function tuneMaterial(
  THREE: ThreeModule,
  material: ThreeNamespace.Material,
) {
  const physical = material as ThreeNamespace.MeshPhysicalMaterial;
  const name = material.name;

  material.side = THREE.FrontSide;

  if (name.includes('Top')) {
    physical.color.set(0x4bc88f);
    physical.emissive.set(0x08714d);
    physical.emissiveIntensity = 0.32;
    physical.metalness = 0;
    physical.roughness = 0.54;
    physical.clearcoat = 0.18;
    physical.clearcoatRoughness = 0.34;
    physical.sheen = 0.24;
    physical.sheenColor.set(0x82e8bb);
    physical.sheenRoughness = 0.56;
    // No transmission: see the note on the Dew material below. At 0.015 it
    // was imperceptible anyway.
    physical.thickness = 0.08;
    physical.ior = 1.38;
    physical.envMapIntensity = 0.46;
    physical.specularIntensity = 0.42;
    physical.normalScale?.set(0.55, 0.55);
  } else if (name.includes('Underside')) {
    physical.color.set(0x31996a);
    physical.emissive.set(0x07553a);
    physical.emissiveIntensity = 0.27;
    physical.metalness = 0;
    physical.roughness = 0.52;
    physical.clearcoat = 0.22;
    physical.clearcoatRoughness = 0.32;
    physical.sheen = 0.2;
    physical.sheenColor.set(0x63c99b);
    physical.sheenRoughness = 0.62;
    physical.thickness = 0.08;
    physical.ior = 1.38;
    physical.envMapIntensity = 0.4;
    physical.specularIntensity = 0.36;
    physical.normalScale?.set(0.42, 0.42);
  } else if (name.includes('Vein')) {
    physical.color.set(0xb0f7d4);
    physical.emissive.set(0x238961);
    physical.emissiveIntensity = 0.3;
    physical.metalness = 0;
    physical.roughness = 0.38;
    physical.clearcoat = 0.34;
    physical.clearcoatRoughness = 0.26;
    physical.envMapIntensity = 0.9;
  } else if (name.includes('Dew')) {
    physical.color.set(0xd8fff0);
    physical.emissive.set(0x0a422f);
    physical.emissiveIntensity = 0.08;
    physical.metalness = 0;
    physical.roughness = 0.055;
    physical.clearcoat = 1;
    physical.clearcoatRoughness = 0.04;
    // Must be assigned, not omitted.
    //
    // The GLB authors KHR_materials_transmission at 0.72 on this material, so
    // GLTFLoader sets it during parse. Leaving it alone does not avoid the
    // cost: three.js renders the whole opaque scene into a separate full-size
    // render target whenever any visible material has transmission > 0, which
    // is a second scene render every frame on a full-viewport canvas. These
    // are dew specks a few pixels across, so plain alpha plus the clearcoat
    // reads the same for none of the cost — but only if we zero it here.
    physical.transmission = 0;
    physical.transparent = true;
    physical.opacity = 0.62;
    physical.thickness = 0.14;
    physical.ior = 1.333;
    physical.envMapIntensity = 1.15;
  } else if (name.includes('Stem')) {
    physical.color.set(0x39b77f);
    physical.emissive.set(0x052d20);
    physical.emissiveIntensity = 0.08;
    physical.metalness = 0;
    physical.roughness = 0.46;
    physical.clearcoat = 0.24;
    physical.clearcoatRoughness = 0.3;
    physical.envMapIntensity = 0.78;
  } else if (name.includes('Edge')) {
    physical.color.set(0x208c62);
    physical.emissive.set(0x063a29);
    physical.emissiveIntensity = 0.12;
    physical.metalness = 0;
    physical.roughness = 0.47;
    physical.clearcoat = 0.3;
    physical.clearcoatRoughness = 0.28;
    physical.envMapIntensity = 0.82;
  }

  material.needsUpdate = true;
}

export async function loadMintLeafModel(
  THREE: ThreeModule,
): Promise<MintLeafModel> {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  // Wait for the decoder before parsing, and put a deadline on it.
  //
  // The asset is meshopt-compressed, so GLTFLoader hands every buffer to this
  // decoder. If its WebAssembly never finishes instantiating, the parse simply
  // never settles: no rejection, no error, just a leaf that never appears —
  // which is exactly how this failed in production, silently. Awaiting it here
  // makes the dependency explicit, and the deadline converts a hang into a
  // real rejection that the callers below can report.
  await Promise.race([
    MeshoptDecoder.ready,
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('MeshoptDecoder.ready did not resolve within 8s')),
        8000,
      );
    }),
  ]);

  const gltf = await loader.loadAsync(MINT_LEAF_MODEL_URL);
  const authoredLeaf = gltf.scene;
  const trackedMaterials = new Set<ThreeNamespace.Material>();
  const trackedTextures = new Set<ThreeNamespace.Texture>();
  const trackedGeometries = new Set<ThreeNamespace.BufferGeometry>();
  const trackedTextureSources = new Set<ClosableTextureSource>();
  const surfaceMeshes: ThreeNamespace.Mesh[] = [];

  authoredLeaf.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    trackedGeometries.add(object.geometry);
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    materials.forEach((material) => {
      if (!trackedMaterials.has(material)) {
        trackedMaterials.add(material);
        tuneMaterial(THREE, material);
      }
      materialTextures(material).forEach((texture) => {
        if (trackedTextures.has(texture)) return;
        trackedTextures.add(texture);
        const source = closableTextureSource(texture);
        if (source) trackedTextureSources.add(source);
      });
    });

    if (
      object.morphTargetDictionary?.Breeze !== undefined &&
      object.morphTargetDictionary?.Curl !== undefined
    ) {
      surfaceMeshes.push(object);
    }
  });

  const bounds = new THREE.Box3().setFromObject(authoredLeaf);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const targetHeight = 3.7;
  const scale = targetHeight / Math.max(size.y, 0.001);
  authoredLeaf.position.copy(center).multiplyScalar(-1);

  const normalizedLeaf = new THREE.Group();
  normalizedLeaf.name = 'MintLeafNormalized';
  normalizedLeaf.scale.setScalar(scale);
  normalizedLeaf.add(authoredLeaf);

  const object = new THREE.Group();
  object.name = 'MintLeafModel';
  object.add(normalizedLeaf);

  return {
    dispose() {
      trackedTextureSources.forEach((source) => source.close());
      trackedTextures.forEach((texture) => texture.dispose());
      trackedGeometries.forEach((geometry) => geometry.dispose());
      trackedMaterials.forEach((material) => material.dispose());
    },
    object,
    setOpacity(opacity) {
      const clamped = Math.min(1, Math.max(0, opacity));
      // Below 1 the leaf has to blend; at 1 it goes back to opaque so the
      // resting hero leaf keeps its depth-sorted, fully lit look.
      object.visible = clamped > 0.001;
      trackedMaterials.forEach((material) => {
        material.transparent = clamped < 0.999;
        material.opacity = clamped;
        material.depthWrite = clamped >= 0.999;
      });
    },
    update(elapsed, progress) {
      const breeze =
        0.28 + Math.sin(elapsed * 0.46 + progress * 2.4) * 0.2;
      const curl =
        0.12 + Math.sin(elapsed * 0.31 + progress * 1.7 + 0.8) * 0.07;

      surfaceMeshes.forEach((surfaceMesh) => {
        const influences = surfaceMesh.morphTargetInfluences;
        if (!influences) return;

        const breezeIndex = surfaceMesh.morphTargetDictionary?.Breeze;
        const curlIndex = surfaceMesh.morphTargetDictionary?.Curl;
        if (breezeIndex !== undefined) influences[breezeIndex] = breeze;
        if (curlIndex !== undefined) influences[curlIndex] = curl;
      });
    },
  };
}
