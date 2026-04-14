"""
render_v3.py — Socket Theory front-fascia demonstrator (Blender, Cycles).

A self-contained Blender script that builds a stylized vehicle front end
embodying Socket Theory: skull-like body panels framing deeply recessed
headlamp sockets, a pronounced brow ridge, and a recessed grille aperture.
Lighting is engineered to maximise socket shadow depth so the fusiform face
area can resolve the face read within ~165 ms.

Usage (from a terminal with Blender 3.6+ on PATH):

    cd C:\\Users\\owene\\socket-theory\\
    blender --background --python render_v3.py

Outputs are written to ./renders/ next to this script:

    renders/socket_front_3q.png      front three-quarter hero
    renders/socket_front.png         dead-on face (strongest pareidolia read)
    renders/socket_profile.png       profile (shows socket depth in section)

Tweak the SOCKET_DEPTH / BROW_PROJECTION / APERTURE_RATIO constants below to
explore the parameter space visualised in demonstrator/SocketDemonstrator.jsx.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

# ---------------------------------------------------------------------------
# Socket Theory parameters (match demonstrator ranges)
# ---------------------------------------------------------------------------
SOCKET_DEPTH = 0.22        # how deep the headlamp sits behind the body plane (m)
BROW_PROJECTION = 0.09     # how far the brow ridge overhangs the socket (m)
APERTURE_RATIO = 0.62      # socket opening as a fraction of socket diameter
GRILLE_DEPTH = 0.18        # how deeply the grille aperture is set back (m)

# ---------------------------------------------------------------------------
# Render quality
# ---------------------------------------------------------------------------
RES_X, RES_Y = 1920, 1080
SAMPLES = 256              # Cycles samples; drop to 64 for quick previews
USE_DENOISE = True

# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.images):
        for item in list(coll):
            try:
                coll.remove(item)
            except RuntimeError:
                pass


def make_material(name, base_color, roughness=0.45, metallic=0.0,
                  emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*emission, 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def assign(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


# ---------------------------------------------------------------------------
# Geometry — a stylised "skull-framed" front fascia
# ---------------------------------------------------------------------------

def build_body_shell():
    """Main panel: a broad, rounded prism acting as the skull frame."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.55))
    body = bpy.context.active_object
    body.name = "BodyShell"
    body.scale = (1.05, 0.55, 0.40)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Soften edges so the form reads as a cast panel, not a box.
    bevel = body.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.08
    bevel.segments = 6
    subsurf = body.modifiers.new("Subsurf", "SUBSURF")
    subsurf.levels = 2
    subsurf.render_levels = 3
    bpy.ops.object.shade_smooth()
    return body


def build_socket(side_x):
    """A headlamp socket: body cavity (boolean-style proxy) + recessed lamp.

    We avoid booleans (slow + fragile in --background) and instead stack:
        - a shadow 'well' (dark cylinder set back into the body plane)
        - the headlamp lens (recessed by SOCKET_DEPTH)
        - the brow ridge (an overhanging arc above the lamp)
    """
    # Socket well — the shadowed cavity the lamp sits inside of.
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.17, depth=SOCKET_DEPTH * 2.0,
        location=(side_x, 0.55 - SOCKET_DEPTH, 0.62),
        rotation=(math.radians(90), 0, 0),
    )
    well = bpy.context.active_object
    well.name = f"SocketWell_{'L' if side_x < 0 else 'R'}"

    # Headlamp lens — recessed behind the body plane.
    lens_radius = 0.17 * APERTURE_RATIO
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=lens_radius,
        location=(side_x, 0.55 - SOCKET_DEPTH * 0.75, 0.62),
        segments=48, ring_count=24,
    )
    lens = bpy.context.active_object
    lens.name = f"Headlamp_{'L' if side_x < 0 else 'R'}"
    bpy.ops.object.shade_smooth()

    # Brow ridge — an overhanging arc that casts shadow onto the lens.
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.20, minor_radius=0.035,
        location=(side_x, 0.55 + BROW_PROJECTION, 0.78),
        rotation=(math.radians(75), 0, 0),
        major_segments=48, minor_segments=16,
    )
    brow = bpy.context.active_object
    brow.name = f"Brow_{'L' if side_x < 0 else 'R'}"
    brow.scale = (1.0, 0.6, 0.5)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.shade_smooth()
    return well, lens, brow


def build_grille():
    """Deep-set grille aperture — the 'mouth' of the face."""
    bpy.ops.mesh.primitive_cube_add(size=1,
                                    location=(0, 0.55 - GRILLE_DEPTH, 0.30))
    grille = bpy.context.active_object
    grille.name = "GrilleCavity"
    grille.scale = (0.60, 0.06, 0.12)
    bpy.ops.object.transform_apply(scale=True)
    bevel = grille.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.02
    bevel.segments = 4
    bpy.ops.object.shade_smooth()
    return grille


def build_ground():
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Ground"
    return ground


# ---------------------------------------------------------------------------
# Lighting — "shadow engineering" three-point rig
# ---------------------------------------------------------------------------

def build_lighting():
    # Key: high-angle sun so the brow ridge throws a crisp shadow onto the
    # lens and the grille cavity reads as a deep well.
    bpy.ops.object.light_add(type="SUN", location=(4, -3, 8))
    key = bpy.context.active_object
    key.name = "KeySun"
    key.data.energy = 4.0
    key.data.angle = math.radians(2.5)  # small angular size = hard shadows
    key.rotation_euler = (math.radians(55), math.radians(12), math.radians(30))

    # Fill: cool, low-energy area light opposite the key.
    bpy.ops.object.light_add(type="AREA", location=(-3.5, -2.5, 2.2))
    fill = bpy.context.active_object
    fill.name = "Fill"
    fill.data.energy = 80.0
    fill.data.size = 3.0
    fill.data.color = (0.72, 0.82, 1.0)

    # Rim: behind-and-above to separate the body from the background.
    bpy.ops.object.light_add(type="AREA", location=(0, 3.0, 2.5))
    rim = bpy.context.active_object
    rim.name = "Rim"
    rim.data.energy = 120.0
    rim.data.size = 2.0
    rim.data.color = (1.0, 0.92, 0.84)


# ---------------------------------------------------------------------------
# Camera rig
# ---------------------------------------------------------------------------

def add_camera(name, location, look_at=(0, 0, 0.55), focal=70):
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.active_object
    cam.name = name
    cam.data.lens = focal

    direction = Vector(look_at) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def build_materials():
    return {
        "body": make_material("BodyPaint",
                              base_color=(0.045, 0.045, 0.050),
                              roughness=0.28, metallic=0.85),
        "well": make_material("SocketWell",
                              base_color=(0.012, 0.012, 0.012),
                              roughness=0.95),
        "lens": make_material("Lens",
                              base_color=(0.85, 0.88, 0.92),
                              roughness=0.12, metallic=0.0,
                              emission=(0.95, 0.97, 1.0),
                              emission_strength=2.2),
        "brow": make_material("BrowTrim",
                              base_color=(0.02, 0.02, 0.02),
                              roughness=0.35, metallic=0.75),
        "grille": make_material("GrilleCavity",
                                base_color=(0.008, 0.008, 0.008),
                                roughness=0.98),
        "ground": make_material("Ground",
                                base_color=(0.06, 0.06, 0.065),
                                roughness=0.65),
    }


# ---------------------------------------------------------------------------
# Scene assembly
# ---------------------------------------------------------------------------

def build_scene():
    clear_scene()
    mats = build_materials()

    body = build_body_shell();                 assign(body, mats["body"])
    grille = build_grille();                   assign(grille, mats["grille"])

    for side_x in (-0.55, 0.55):
        well, lens, brow = build_socket(side_x)
        assign(well, mats["well"])
        assign(lens, mats["lens"])
        assign(brow, mats["brow"])

    ground = build_ground();                   assign(ground, mats["ground"])

    build_lighting()

    # World background: near-black so socket shadows dominate the read.
    world = bpy.context.scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.015, 0.017, 0.020, 1.0)
    bg.inputs["Strength"].default_value = 0.6


# ---------------------------------------------------------------------------
# Render settings + output
# ---------------------------------------------------------------------------

def configure_render():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = RES_X
    scene.render.resolution_y = RES_Y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "16"

    scene.cycles.samples = SAMPLES
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.01
    if USE_DENOISE:
        scene.cycles.use_denoising = True

    # Prefer GPU if available; fall back silently to CPU.
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            if any(d.type == backend for d in prefs.devices):
                scene.cycles.device = "GPU"
                for d in prefs.devices:
                    d.use = (d.type == backend or d.type == "CPU")
                break
        except (TypeError, RuntimeError):
            continue

    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"


def render_view(camera, out_path):
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.filepath = out_path
    print(f"[render_v3] rendering {camera.name} -> {out_path}", flush=True)
    bpy.ops.render.render(write_still=True)


def main():
    script_dir = os.path.dirname(os.path.abspath(bpy.data.filepath
                                                 or sys.argv[0] or __file__))
    out_dir = os.path.join(script_dir, "renders")
    os.makedirs(out_dir, exist_ok=True)

    build_scene()
    configure_render()

    cam_3q = add_camera("Cam_3Q",
                        location=(2.6, -3.4, 1.25),
                        look_at=(0.0, 0.0, 0.55), focal=80)
    cam_front = add_camera("Cam_Front",
                           location=(0.0, -4.2, 0.62),
                           look_at=(0.0, 0.0, 0.62), focal=110)
    cam_profile = add_camera("Cam_Profile",
                             location=(4.2, 0.0, 0.70),
                             look_at=(0.0, 0.0, 0.62), focal=85)

    render_view(cam_3q, os.path.join(out_dir, "socket_front_3q.png"))
    render_view(cam_front, os.path.join(out_dir, "socket_front.png"))
    render_view(cam_profile, os.path.join(out_dir, "socket_profile.png"))

    print(f"[render_v3] done. outputs in: {out_dir}", flush=True)


if __name__ == "__main__":
    main()
