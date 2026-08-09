#!/usr/bin/env python3
"""Build Mintea's original hero leaf as an optimized GLB and render QA stills.

Run with:

    blender --background --factory-startup --python scripts/build-mint-leaf-asset.py

The geometry, textures, morph targets, and preview renders are generated from
scratch so Mintea owns the complete asset and can reproduce it at any time.
"""

from __future__ import annotations

import math
import shutil
import subprocess
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
# /static/, not /assets/: Metro reserves the /assets/ route in dev, which
# shadows anything published under public/assets and 404s it.
ASSET_DIR = ROOT / "apps" / "mintea" / "public" / "static" / "landing"
QA_DIR = ROOT / ".artifacts" / "mint-leaf"
TEXTURE_DIR = QA_DIR / "textures"
# Vercel serves these files with immutable caching. Bump this value and update
# the matching URLs in LandingPage.web.tsx and mintLeafModel.web.ts for edits.
ASSET_VERSION = "v1"
GLB_PATH = ASSET_DIR / f"mint-leaf-{ASSET_VERSION}.glb"
RAW_GLB_PATH = QA_DIR / "mint-leaf-raw.glb"
GLB_CANDIDATE_PATH = QA_DIR / f"mint-leaf-{ASSET_VERSION}.candidate.glb"
POSTER_PATH = ASSET_DIR / f"mint-leaf-poster-{ASSET_VERSION}.webp"
POSTER_CANDIDATE_PATH = QA_DIR / f"mint-leaf-poster-{ASSET_VERSION}.candidate.webp"

TEXTURE_SIZE = 1024
ROWS = 81
COLS = 33
LEAF_LENGTH = 3.35
LEAF_WIDTH = 2.18
THICKNESS = 0.034


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 0.0
    x = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return x * x * (3.0 - 2.0 * x)


def leaf_point(t: float, s: float, layer: float = 0.0) -> tuple[float, float, float]:
    """Return a point on an asymmetrical, serrated, cupped mint-leaf surface.

    Blender uses Z-up. The leaf lives in the X/Z plane and faces -Y so glTF's
    coordinate conversion produces a conventional X/Y leaf facing +Z.
    """

    profile = math.sin(math.pi * (t**0.91))
    profile = max(profile, 0.0) ** 0.63
    base_taper = 0.80 + 0.20 * smoothstep(0.0, 0.18, t)
    tip_taper = 1.0 - 0.08 * smoothstep(0.76, 1.0, t)

    tooth_phase = 2.0 * math.pi * 18.0 * t
    tooth = (
        0.66 * math.sin(tooth_phase)
        + 0.22 * math.sin(tooth_phase * 2.0 + 0.58)
        + 0.08 * math.sin(tooth_phase * 3.0 + 1.2)
    )
    tooth_strength = 0.026 * (0.28 + 0.72 * math.sin(math.pi * t) ** 0.6)
    width = (LEAF_WIDTH * 0.5) * profile * base_taper * tip_taper
    width *= 1.0 + tooth * tooth_strength

    asymmetry = 1.0 + math.copysign(
        0.026 * math.sin(t * math.pi * 3.1 + 0.4) + 0.018,
        s if s != 0 else 1,
    )
    x = s * width * asymmetry
    x += 0.095 * (t**3) - 0.022 * math.sin(math.pi * t)

    body = math.sin(math.pi * t) ** 0.72
    center_rib = -0.046 * math.exp(-((s / 0.125) ** 2)) * body
    cup = 0.060 * (abs(s) ** 1.75) * body
    longitudinal_bend = -0.026 * math.sin(math.pi * (t - 0.08))
    tip_curl = -0.115 * smoothstep(0.72, 1.0, t) ** 1.8
    twist = 0.048 * s * (t - 0.42) * body
    quilting = (
        -0.006
        * math.sin(t * math.pi * 11.0 + abs(s) * 2.8)
        * math.cos(s * math.pi * 2.4)
        * (1.0 - abs(s))
        * body
    )
    depth = center_rib + cup + longitudinal_bend + tip_curl + twist + quilting
    depth -= layer * THICKNESS

    z = -LEAF_LENGTH * 0.5 + LEAF_LENGTH * t
    z += 0.045 * math.sin(math.pi * t * 1.4) * s
    return x, depth, z


def rgba(rgb: np.ndarray) -> np.ndarray:
    alpha = np.ones((*rgb.shape[:2], 1), dtype=np.float32)
    return np.concatenate((np.clip(rgb, 0.0, 1.0), alpha), axis=2)


def save_image(name: str, pixels: np.ndarray, path: Path, non_color: bool = False):
    height, width = pixels.shape[:2]
    image = bpy.data.images.new(name, width=width, height=height, alpha=True)
    image.pixels.foreach_set(np.flipud(pixels).astype(np.float32).ravel())
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    if non_color:
        try:
            image.colorspace_settings.name = "Non-Color"
        except TypeError:
            pass
    image.save()
    return image


def create_textures():
    size = TEXTURE_SIZE
    u = np.linspace(0.0, 1.0, size, dtype=np.float32)[:, None]
    v = np.linspace(-1.0, 1.0, size, dtype=np.float32)[None, :]
    uu = np.broadcast_to(u, (size, size))
    vv = np.broadcast_to(v, (size, size))

    body = np.power(np.clip(np.sin(np.pi * uu), 0.0, 1.0), 0.65)
    edge = np.power(np.abs(vv), 1.45)
    center_vein = np.exp(-np.square(vv / 0.026)) * body

    secondary = np.zeros((size, size), dtype=np.float32)
    vein_bases = (0.18, 0.285, 0.39, 0.50, 0.61, 0.72, 0.81)
    lateral = np.abs(vv)
    for index, base in enumerate(vein_bases):
        expected_u = base + (0.115 + index * 0.003) * np.power(lateral, 1.12)
        width = 0.0055 + lateral * 0.0025
        vein = np.exp(-np.square((uu - expected_u) / width))
        vein *= smoothstep_array(0.02, 0.16, lateral)
        vein *= 1.0 - smoothstep_array(0.84, 1.0, lateral)
        secondary = np.maximum(secondary, vein)

    rng = np.random.default_rng(260801)
    coarse = rng.normal(0.0, 1.0, (64, 64)).astype(np.float32)
    coarse_image = bpy.data.images.new("MintLeafNoise", width=64, height=64, alpha=False)
    coarse_rgba = rgba(np.repeat(((coarse - coarse.min()) / np.ptp(coarse))[..., None], 3, axis=2))
    coarse_image.pixels.foreach_set(coarse_rgba.ravel())
    bpy.data.images.remove(coarse_image)
    noise = (
        np.sin(uu * 97.0 + vv * 14.0)
        + np.sin(uu * 181.0 - vv * 23.0 + 1.4)
        + np.sin((uu + vv) * 257.0 + 0.6)
    ) / 3.0
    cell = np.sin(uu * 38.0 + np.sin(vv * 18.0)) * np.sin(vv * 33.0 - uu * 8.0)
    micro = noise * 0.55 + cell * 0.45

    deep = np.array([0.032, 0.325, 0.205], dtype=np.float32)
    bright = np.array([0.24, 0.76, 0.51], dtype=np.float32)
    highlight = np.array([0.56, 0.91, 0.72], dtype=np.float32)
    gradient = (0.38 + 0.48 * body - 0.16 * edge + 0.026 * micro)[..., None]
    base = deep + (bright - deep) * np.clip(gradient, 0.0, 1.0)
    vein_mask = np.clip(center_vein * 0.82 + secondary * 0.48, 0.0, 1.0)[..., None]
    base = base * (1.0 - vein_mask * 0.28) + highlight * vein_mask * 0.28
    base *= (0.94 + 0.06 * np.sin(uu * math.pi))[..., None]

    height = (
        center_vein * 0.55
        + secondary * 0.26
        + micro * 0.030
        - edge * 0.055
        + np.sin(uu * 44.0 + vv * 4.0) * 0.008
    )
    grad_u, grad_v = np.gradient(height)
    normal_strength = 7.5
    nx = -grad_v * normal_strength
    ny = -grad_u * normal_strength
    nz = np.ones_like(nx)
    normal_length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack(
        (
            nx / normal_length * 0.5 + 0.5,
            ny / normal_length * 0.5 + 0.5,
            nz / normal_length * 0.5 + 0.5,
        ),
        axis=2,
    )

    roughness = np.clip(
        0.50 + 0.055 * micro + 0.050 * edge - 0.12 * center_vein - 0.06 * secondary,
        0.31,
        0.67,
    )
    rough_rgb = np.repeat(roughness[..., None], 3, axis=2)

    base_image = save_image(
        "MintLeafBaseColor",
        rgba(base),
        TEXTURE_DIR / "mint-leaf-base.png",
    )
    normal_image = save_image(
        "MintLeafNormal",
        rgba(normal),
        TEXTURE_DIR / "mint-leaf-normal.png",
        non_color=True,
    )
    roughness_image = save_image(
        "MintLeafRoughness",
        rgba(rough_rgb),
        TEXTURE_DIR / "mint-leaf-roughness.png",
        non_color=True,
    )
    return base_image, normal_image, roughness_image


def smoothstep_array(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    x = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def set_principled_input(shader, names: tuple[str, ...], value) -> None:
    for name in names:
        socket = shader.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def create_leaf_material(
    name: str,
    base_image,
    normal_image,
    roughness_image,
    tint: tuple[float, float, float, float],
    normal_strength: float,
):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    output.location = (640, 40)
    shader.location = (350, 40)
    set_principled_input(shader, ("Metallic",), 0.0)
    set_principled_input(shader, ("Roughness",), 0.48)
    set_principled_input(shader, ("IOR",), 1.38)
    set_principled_input(shader, ("Coat Weight", "Clearcoat"), 0.22)
    set_principled_input(shader, ("Coat Roughness", "Clearcoat Roughness"), 0.31)
    set_principled_input(shader, ("Sheen Weight", "Sheen"), 0.18)
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    color_texture = nodes.new("ShaderNodeTexImage")
    color_texture.image = base_image
    color_texture.location = (-620, 160)
    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.blend_type = "MULTIPLY"
    multiply.inputs[0].default_value = 1.0
    multiply.inputs[2].default_value = tint
    multiply.location = (-330, 160)
    links.new(color_texture.outputs["Color"], multiply.inputs[1])
    links.new(multiply.outputs["Color"], shader.inputs["Base Color"])

    roughness_texture = nodes.new("ShaderNodeTexImage")
    roughness_texture.image = roughness_image
    roughness_texture.location = (-560, -120)
    links.new(roughness_texture.outputs["Color"], shader.inputs["Roughness"])

    normal_texture = nodes.new("ShaderNodeTexImage")
    normal_texture.image = normal_image
    normal_texture.location = (-620, -390)
    normal_node = nodes.new("ShaderNodeNormalMap")
    normal_node.inputs["Strength"].default_value = normal_strength
    normal_node.location = (-290, -330)
    links.new(normal_texture.outputs["Color"], normal_node.inputs["Color"])
    links.new(normal_node.outputs["Normal"], shader.inputs["Normal"])
    return material


def create_simple_material(
    name: str,
    base_color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = base_color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    set_principled_input(shader, ("Coat Weight", "Clearcoat"), 0.35)
    set_principled_input(shader, ("Coat Roughness", "Clearcoat Roughness"), 0.22)
    if emission:
        set_principled_input(shader, ("Emission Color", "Emission"), emission)
        set_principled_input(shader, ("Emission Strength",), emission_strength)
    return material


def create_leaf_surface(materials):
    vertices: list[tuple[float, float, float]] = []
    uv_by_vertex: list[tuple[float, float]] = []
    parameters: list[tuple[float, float, float]] = []

    for layer in (-0.5, 0.5):
        for row in range(ROWS):
            t = row / (ROWS - 1)
            for col in range(COLS):
                s = -1.0 + 2.0 * col / (COLS - 1)
                vertices.append(leaf_point(t, s, layer))
                uv_by_vertex.append((t, (s + 1.0) * 0.5))
                parameters.append((t, s, layer))

    layer_size = ROWS * COLS
    faces: list[tuple[int, int, int, int]] = []
    material_indices: list[int] = []

    for row in range(ROWS - 1):
        for col in range(COLS - 1):
            a = row * COLS + col
            b = a + 1
            d = (row + 1) * COLS + col
            c = d + 1
            faces.append((a, b, c, d))
            material_indices.append(0)

            a2, b2, c2, d2 = a + layer_size, b + layer_size, c + layer_size, d + layer_size
            faces.append((a2, d2, c2, b2))
            material_indices.append(1)

    for row in range(ROWS - 1):
        for col in (0, COLS - 1):
            a = row * COLS + col
            b = (row + 1) * COLS + col
            faces.append((a, b, b + layer_size, a + layer_size))
            material_indices.append(2)

    for row in (0, ROWS - 1):
        for col in range(COLS - 1):
            a = row * COLS + col
            b = a + 1
            faces.append((a, a + layer_size, b + layer_size, b))
            material_indices.append(2)

    mesh = bpy.data.meshes.new("MintLeafSurfaceMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    leaf = bpy.data.objects.new("MintLeafSurface", mesh)
    bpy.context.collection.objects.link(leaf)
    for material in materials:
        leaf.data.materials.append(material)
    for polygon, material_index in zip(mesh.polygons, material_indices, strict=True):
        polygon.material_index = material_index
        polygon.use_smooth = True

    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uv_by_vertex[vertex_index]

    leaf.shape_key_add(name="Basis", from_mix=False)
    breeze = leaf.shape_key_add(name="Breeze", from_mix=False)
    curl = leaf.shape_key_add(name="Curl", from_mix=False)
    for index, (t, s, _layer) in enumerate(parameters):
        original = Vector(vertices[index])
        influence = smoothstep(0.12, 1.0, t)

        breeze_offset = Vector(
            (
                0.105 * math.sin(t * math.pi * 1.18) * influence,
                -0.040 * math.sin(t * math.pi * 2.1 + s * 0.8) * influence,
                0.026 * math.sin(t * math.pi) * s * influence,
            ),
        )
        breeze.data[index].co = original + breeze_offset

        curl_offset = Vector(
            (
                -0.048 * s * influence,
                -0.155 * smoothstep(0.68, 1.0, t) ** 1.7 + 0.024 * abs(s) * influence,
                0.020 * math.sin(t * math.pi) * influence,
            ),
        )
        curl.data[index].co = original + curl_offset

    breeze.value = 0.0
    curl.value = 0.0
    leaf.active_shape_key_index = 0
    leaf["asset_author"] = "Mintea"
    leaf["asset_license"] = "Original work; all rights reserved"
    leaf["asset_version"] = "1.0"
    return leaf


def create_curve_mesh(name: str, paths, material, bevel_depth: float, bevel_resolution: int = 2):
    curve_data = bpy.data.curves.new(name + "Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 2
    curve_data.bevel_depth = bevel_depth
    curve_data.bevel_resolution = bevel_resolution
    curve_data.resolution_u = 2
    curve_data.use_fill_caps = True
    for path in paths:
        spline = curve_data.splines.new("NURBS")
        spline.points.add(len(path) - 1)
        spline.order_u = min(3, len(path))
        spline.use_endpoint_u = True
        for point, (position, radius) in zip(spline.points, path, strict=True):
            point.co = (*position, 1.0)
            point.radius = radius

    curve_object = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(curve_object)
    curve_object.data.materials.append(material)
    bpy.context.view_layer.objects.active = curve_object
    curve_object.select_set(True)
    bpy.ops.object.convert(target="MESH")
    curve_object = bpy.context.view_layer.objects.active
    curve_object.name = name
    for polygon in curve_object.data.polygons:
        polygon.use_smooth = True
    curve_object.select_set(False)
    return curve_object


def create_veins(material):
    paths = []
    center_path = []
    for index in range(48):
        t = 0.035 + 0.93 * index / 47
        x, depth, z = leaf_point(t, 0.0, -0.5)
        radius = 1.35 - 0.95 * smoothstep(0.05, 0.96, t)
        center_path.append(((x, depth - 0.022, z), radius))
    paths.append(center_path)

    for vein_index, base in enumerate((0.18, 0.285, 0.39, 0.50, 0.61, 0.72, 0.81)):
        for direction in (-1.0, 1.0):
            path = []
            for index in range(18):
                progress = index / 17
                s = direction * 0.88 * (progress**1.08)
                t = min(0.96, base + (0.108 + vein_index * 0.004) * (progress**1.08))
                x, depth, z = leaf_point(t, s, -0.5)
                radius = 0.78 - 0.52 * progress
                path.append(((x, depth - 0.020, z), radius))
            paths.append(path)
    return create_curve_mesh("MintLeafVeins", paths, material, 0.012, bevel_resolution=2)


def create_stem(material):
    path = []
    for index in range(20):
        progress = index / 19
        z = -LEAF_LENGTH * 0.5 - 0.60 * progress
        x = -0.015 - 0.13 * progress + 0.025 * math.sin(progress * math.pi)
        y = 0.01 + 0.08 * progress
        path.append(((x, y, z), 1.28 - 0.38 * progress))
    return create_curve_mesh("MintLeafStem", [path], material, 0.040, bevel_resolution=3)


def create_dew_drops(material):
    drops = []
    placements = (
        (0.62, -0.34, 0.080, (1.0, 0.52, 0.78)),
        (0.48, 0.46, 0.058, (1.0, 0.58, 0.82)),
        (0.77, 0.20, 0.044, (1.0, 0.64, 0.88)),
    )
    for index, (t, s, radius, scale) in enumerate(placements, start=1):
        x, depth, z = leaf_point(t, s, -0.5)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=radius, location=(x, depth - radius * 0.58, z))
        drop = bpy.context.active_object
        drop.name = f"MintLeafDewDrop{index:02d}"
        drop.scale = scale
        drop.data.materials.append(material)
        for polygon in drop.data.polygons:
            polygon.use_smooth = True
        drops.append(drop)
    return drops


def create_root(objects):
    root = bpy.data.objects.new("MintLeafRoot", None)
    bpy.context.collection.objects.link(root)
    for obj in objects:
        obj.parent = root
    return root


def look_at(obj, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_preview_scene(root):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("MintLeafWorld")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.004, 0.024, 0.018, 1.0)
    background.inputs["Strength"].default_value = 0.24
    scene.world = world

    camera_data = bpy.data.cameras.new("MintLeafPreviewCamera")
    camera = bpy.data.objects.new("MintLeafPreviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0.0, -7.2, 0.15)
    camera.data.lens = 58
    look_at(camera, Vector((0.0, 0.0, -0.05)))
    scene.camera = camera

    lights = (
        ("SoftKey", "AREA", (3.6, -4.4, 5.4), (1.0, 0.94, 0.86), 620.0, 4.8),
        ("MintFill", "AREA", (-4.2, -2.4, 0.6), (0.26, 1.0, 0.69), 360.0, 4.0),
        ("AmberRim", "AREA", (3.0, 2.2, 3.8), (1.0, 0.52, 0.24), 420.0, 3.4),
        ("TopSoftbox", "AREA", (-0.5, 0.4, 6.5), (0.72, 1.0, 0.89), 380.0, 5.4),
    )
    for name, light_type, position, color, energy, size in lights:
        light_data = bpy.data.lights.new(name=name, type=light_type)
        light_data.energy = energy
        light_data.color = color
        light_data.shape = "DISK"
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        light.location = position
        bpy.context.collection.objects.link(light)
        look_at(light, Vector((0.0, 0.0, 0.0)))
    return scene, camera


def render_qa(scene, root, camera):
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    poses = (
        ("front", 0.0),
        ("three-quarter", math.radians(-30.0)),
        ("near-edge", math.radians(-58.0)),
    )
    for name, yaw in poses:
        root.rotation_euler = (0.0, 0.0, yaw)
        scene.render.filepath = str(QA_DIR / f"mint-leaf-{name}.png")
        bpy.ops.render.render(write_still=True)

    root.rotation_euler = (math.radians(-2.0), math.radians(-8.0), math.radians(-20.0))
    scene.render.resolution_x = 640
    scene.render.resolution_y = 820
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 88
    scene.render.filepath = str(POSTER_CANDIDATE_PATH)
    camera.location = (0.0, -7.8, 0.05)
    camera.data.lens = 62
    look_at(camera, Vector((0.0, 0.0, -0.06)))
    bpy.ops.render.render(write_still=True)
    root.rotation_euler = (0.0, 0.0, 0.0)


def export_glb(root):
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(RAW_GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_morph=True,
        export_morph_normal=True,
        export_tangents=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )


def optimize_glb() -> None:
    command = (
        "npx",
        "-y",
        "@gltf-transform/cli@4.3.0",
        "optimize",
        str(RAW_GLB_PATH),
        str(GLB_CANDIDATE_PATH),
        "--compress",
        "meshopt",
        "--flatten",
        "false",
        "--join",
        "false",
        "--palette",
        "false",
        "--simplify",
        "false",
        "--texture-compress",
        "webp",
        "--texture-size",
        str(TEXTURE_SIZE),
    )
    try:
        subprocess.run(command, cwd=ROOT, check=True)
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Optimization unavailable ({error}); retaining the raw GLB")
        shutil.copyfile(RAW_GLB_PATH, GLB_CANDIDATE_PATH)


def publish_versioned_asset(candidate: Path, destination: Path) -> None:
    """Publish once, preventing stale immutable-cache URLs after later edits."""

    if destination.exists() and destination.read_bytes() != candidate.read_bytes():
        raise RuntimeError(
            f"Refusing to overwrite immutable asset {destination.name}. "
            "Bump ASSET_VERSION and update the landing-page URLs first."
        )
    shutil.copyfile(candidate, destination)


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    QA_DIR.mkdir(parents=True, exist_ok=True)
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    base_image, normal_image, roughness_image = create_textures()
    top_material = create_leaf_material(
        "MintLeafTopMaterial",
        base_image,
        normal_image,
        roughness_image,
        (0.98, 1.0, 0.99, 1.0),
        0.34,
    )
    underside_material = create_leaf_material(
        "MintLeafUndersideMaterial",
        base_image,
        normal_image,
        roughness_image,
        (0.68, 0.84, 0.74, 1.0),
        0.28,
    )
    edge_material = create_simple_material(
        "MintLeafEdgeMaterial",
        (0.035, 0.40, 0.24, 1.0),
        roughness=0.52,
    )
    vein_material = create_simple_material(
        "MintLeafVeinMaterial",
        (0.22, 0.69, 0.45, 1.0),
        roughness=0.42,
        emission=(0.05, 0.28, 0.16, 1.0),
        emission_strength=0.08,
    )
    stem_material = create_simple_material(
        "MintLeafStemMaterial",
        (0.03, 0.38, 0.21, 1.0),
        roughness=0.46,
    )
    dew_material = create_simple_material(
        "MintLeafDewMaterial",
        (0.66, 1.0, 0.84, 1.0),
        roughness=0.05,
    )
    dew_shader = dew_material.node_tree.nodes.get("Principled BSDF")
    set_principled_input(dew_shader, ("Transmission Weight", "Transmission"), 0.72)
    set_principled_input(dew_shader, ("Coat Weight", "Clearcoat"), 1.0)
    set_principled_input(dew_shader, ("IOR",), 1.333)

    leaf = create_leaf_surface((top_material, underside_material, edge_material))
    veins = create_veins(vein_material)
    stem = create_stem(stem_material)
    drops = create_dew_drops(dew_material)
    root = create_root((leaf, veins, stem, *drops))

    export_glb(root)
    optimize_glb()
    scene, camera = setup_preview_scene(root)
    render_qa(scene, root, camera)
    publish_versioned_asset(GLB_CANDIDATE_PATH, GLB_PATH)
    publish_versioned_asset(POSTER_CANDIDATE_PATH, POSTER_PATH)

    print(f"Mint leaf GLB: {GLB_PATH} ({GLB_PATH.stat().st_size:,} bytes)")
    print(f"Mint leaf poster: {POSTER_PATH} ({POSTER_PATH.stat().st_size:,} bytes)")
    print(f"QA renders: {QA_DIR}")


if __name__ == "__main__":
    main()
