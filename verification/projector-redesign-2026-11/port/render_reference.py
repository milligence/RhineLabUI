"""Offline geometry/material reference only, not a Three.js/browser capture."""
import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/assets/archive-cassette.glb'))

def linear(hex_value):
    values = [int(hex_value[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    return tuple(value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in values)

def apply_color(node, color):
    node.inputs['Base Color'].default_value = (*linear(color), 1)

# Match the scene's explicit selected-cassette finishes. Lighting and renderer
# remain a studio approximation; this does not simulate screen-space refraction.
for material in bpy.data.materials:
    node = material.node_tree.nodes.get('Principled BSDF') if material.use_nodes else None
    if node is None:
        continue
    name = material.name.split('.')[0]
    if name == 'Frosted_Polymer':
        apply_color(node, 'fffdfa')
        node.inputs['Transmission Weight'].default_value = .9
        node.inputs['Roughness'].default_value = .21
        node.inputs['IOR'].default_value = 1.46
    elif name == 'Internal_Ceramic':
        apply_color(node, 'c7beb6')
        node.inputs['Roughness'].default_value = .6
    elif name == 'Printed_Label':
        apply_color(node, 'eae5dc')
    elif name == 'Ivory_Edges':
        apply_color(node, 'f0e7df')
        node.inputs['Roughness'].default_value = .31
        node.inputs['Transmission Weight'].default_value = .65
    elif name == 'Optical_Diffuser':
        apply_color(node, 'e2dad4')
        node.inputs['Transmission Weight'].default_value = 0
        node.inputs['Roughness'].default_value = .7
    elif name == 'Subsurface_Optics':
        apply_color(node, 'b9aba1')
        node.inputs['Roughness'].default_value = .48
        node.inputs['Metallic'].default_value = .05
    elif name == 'Optical_Edges':
        apply_color(node, 'd4c7be')
        node.inputs['Transmission Weight'].default_value = 0
        node.inputs['Roughness'].default_value = .26
        node.inputs['Metallic'].default_value = .08

port_materials = {}
for component in json.loads((OUT / 'geometry.json').read_text()):
    data = component['vertices']
    # glTF Y-up to Blender Z-up, preserving the original cassette geometry.
    points = [(data[index], -data[index + 2], data[index + 1]) for index in range(0, len(data), 3)]
    indices = component['indices'] or list(range(len(points)))
    faces = [indices[index:index + 3] for index in range(0, len(indices), 3)]
    mesh = bpy.data.meshes.new('Runtime_' + component['role'])
    mesh.from_pydata(points, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(obj)
    # Use the runtime's exact transformed bevel normals.
    for face in mesh.polygons:
        face.use_smooth = True
    normals = component['normals']
    mesh.normals_split_custom_set_from_vertices([
        (normals[index], -normals[index + 2], normals[index + 1])
        for index in range(0, len(normals), 3)
    ])
    material = bpy.data.materials.new('Runtime_' + component['role'])
    material.use_nodes = True
    node = material.node_tree.nodes['Principled BSDF']
    values = component['material']
    node.inputs['Base Color'].default_value = (*values['color'], 1)
    node.inputs['Metallic'].default_value = values['metalness']
    node.inputs['Roughness'].default_value = values['roughness']
    node.inputs['Transmission Weight'].default_value = values['transmission']
    node.inputs['IOR'].default_value = values['ior']
    node.inputs['Coat Weight'].default_value = values['clearcoat']
    node.inputs['Coat Roughness'].default_value = values['clearcoatRoughness']
    node.inputs['Emission Color'].default_value = (*values['emissive'], 1)
    node.inputs['Emission Strength'].default_value = 0
    obj.data.materials.append(material)
    port_materials[component['role']] = (node, values['emissiveIntensity'])

scene = bpy.context.scene
scene.world = bpy.data.worlds.new('Offline_Warm_Studio')
scene.world.use_nodes = True
background = scene.world.node_tree.nodes['Background']
background.inputs[0].default_value = (.73, .71, .67, 1)
background.inputs[1].default_value = .42

for name, location, power, size in [
    ('Large soft key', (-3, -5, 7), 700, 5),
    ('Narrow glass reflection', (3.5, -3, 5.5), 350, 1.5),
    ('Soft rim', (4, 2, 6), 700, 4),
]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.shape = 'DISK'
    light.data.size = size
    light.rotation_euler = (Vector((.8, -.1, 3.1)) - light.location).to_track_quat('-Z', 'Y').to_euler()

bpy.ops.object.camera_add()
camera = bpy.context.object
camera.name = 'Offline_Port_Review'
camera.data.type = 'ORTHO'
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 96
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 8
scene.cycles.transmission_bounces = 6
scene.render.resolution_x = 1400
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'

def render(name, position, target, scale, power):
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = scale
    for role, (node, intensity) in port_materials.items():
        node.inputs['Emission Strength'].default_value = intensity * power
    scene.render.filepath = str(OUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)

shots = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not shots or 'off' in shots:
    render('port-v2-off-oblique', (3.2, -5.5, 4.6), (1.22, -.22, 3.34), 2.48, 0)
if not shots or 'on' in shots:
    render('port-v2-on-oblique', (3.2, -5.5, 4.6), (1.22, -.22, 3.34), 2.48, 1)
if not shots or 'overview' in shots:
    render('card-v2-on-proportion', (6, -11, 5.5), (0, -.05, 1.86), 7.2, 1)
print('OFFLINE_REFERENCE_ONLY', OUT)
