"""Standalone exact-beam raster through a float target and Three OutputShader.

This is a component diagnostic. It omits ArchiveScene meshes, AO/DOF/SMAA and DOM.
"""
import ctypes as C
import json
import sys
sys.dont_write_bytecode = True
from pathlib import Path
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import compile as api

root = Path(sys.argv[1]).resolve()
physical = json.loads((root / "beam-physical.json").read_text())
suffix = sys.argv[2] if len(sys.argv) > 2 else "current"
pixel_ratio = float(sys.argv[3]) if len(sys.argv) > 3 else 1
width, height = round(physical["viewport"]["width"] * pixel_ratio), round(physical["viewport"]["height"] * pixel_ratio)
U, I, F, P = C.c_uint, C.c_int, C.c_float, C.c_void_p
def bind(name, ret, args): return api.gl(name, ret, args)
gen_textures = bind("glGenTextures", None, [I, C.POINTER(U)])
bind_texture = bind("glBindTexture", None, [U, U])
texture_image = bind("glTexImage2D", None, [U, I, I, I, I, I, U, U, P])
texture_parameter = bind("glTexParameteri", None, [U, U, I])
gen_framebuffers = bind("glGenFramebuffers", None, [I, C.POINTER(U)])
bind_framebuffer = bind("glBindFramebuffer", None, [U, U])
framebuffer_texture = bind("glFramebufferTexture2D", None, [U, U, U, U, I])
framebuffer_status = bind("glCheckFramebufferStatus", U, [U])
viewport = bind("glViewport", None, [I, I, I, I])
clear_color = bind("glClearColor", None, [F, F, F, F])
clear = bind("glClear", None, [U])
enable = bind("glEnable", None, [U])
disable = bind("glDisable", None, [U])
blend_func = bind("glBlendFuncSeparate", None, [U, U, U, U])
depth_mask = bind("glDepthMask", None, [C.c_ubyte])
use_program = bind("glUseProgram", None, [U])
uniform_location = bind("glGetUniformLocation", I, [U, C.c_char_p])
attribute_location = bind("glGetAttribLocation", I, [U, C.c_char_p])
uniform1f = bind("glUniform1f", None, [I, F])
uniform1i = bind("glUniform1i", None, [I, I])
uniform2f = bind("glUniform2f", None, [I, F, F])
uniform3f = bind("glUniform3f", None, [I, F, F, F])
uniform4m = bind("glUniformMatrix4fv", None, [I, I, C.c_ubyte, P])
uniform3m = bind("glUniformMatrix3fv", None, [I, I, C.c_ubyte, P])
gen_buffers = bind("glGenBuffers", None, [I, C.POINTER(U)])
bind_buffer = bind("glBindBuffer", None, [U, U])
buffer_data = bind("glBufferData", None, [U, C.c_ssize_t, P, U])
enable_attribute = bind("glEnableVertexAttribArray", None, [U])
attribute_pointer = bind("glVertexAttribPointer", None, [U, I, U, C.c_ubyte, I, P])
gen_vaos = bind("glGenVertexArrays", None, [I, C.POINTER(U)])
bind_vao = bind("glBindVertexArray", None, [U])
draw_elements = bind("glDrawElements", None, [U, I, U, P])
draw_arrays = bind("glDrawArrays", None, [U, I, I])
active_texture = bind("glActiveTexture", None, [U])
read_pixels = bind("glReadPixels", None, [I, I, I, I, U, U, P])
get_error = bind("glGetError", U, [])

def program(name):
    shaders = []
    for suffix, kind in [("vert", 0x8B31), ("frag", 0x8B30)]:
        code = (root / f"{name}.{suffix}").read_bytes()
        shader = api.create_shader(kind)
        data, length = C.c_char_p(code), I(len(code))
        api.shader_source(shader, 1, C.byref(data), C.byref(length))
        api.compile_shader(shader)
        status = I(); api.shader_value(shader, 0x8B81, C.byref(status))
        assert status.value, api.info(shader, api.shader_value, api.shader_log)
        shaders.append(shader)
    handle = api.create_program()
    for shader in shaders: api.attach_shader(handle, shader)
    api.link_program(handle)
    status = I(); api.program_value(handle, 0x8B82, C.byref(status))
    assert status.value, api.info(handle, api.program_value, api.program_log)
    for shader in shaders: api.delete_shader(shader)
    return handle

def target(floating):
    texture = U(); gen_textures(1, C.byref(texture)); bind_texture(0x0DE1, texture)
    for option in [0x2801, 0x2800]: texture_parameter(0x0DE1, option, 0x2600)
    for option in [0x2802, 0x2803]: texture_parameter(0x0DE1, option, 0x812F)
    texture_image(0x0DE1, 0, 0x881A if floating else 0x8058, width, height, 0, 0x1908, 0x140B if floating else 0x1401, None)
    frame = U(); gen_framebuffers(1, C.byref(frame)); bind_framebuffer(0x8D40, frame)
    framebuffer_texture(0x8D40, 0x8CE0, 0x0DE1, texture, 0)
    assert framebuffer_status(0x8D40) == 0x8CD5
    return frame, texture

def buffer(target, data):
    name = U(); gen_buffers(1, C.byref(name)); bind_buffer(target, name)
    buffer_data(target, data.nbytes, data.ctypes.data, 0x88E4)
    return name

def vertex_array(handle, attributes, indices=None):
    vao = U(); gen_vaos(1, C.byref(vao)); bind_vao(vao)
    for name, (size, values) in attributes.items():
        location = attribute_location(handle, name.encode())
        if location < 0: continue
        data = np.array(values, dtype=np.float32)
        buffer(0x8892, data)
        enable_attribute(location); attribute_pointer(location, size, 0x1406, 0, 0, None)
    if indices is not None: buffer(0x8893, np.array(indices, dtype=np.uint16))
    return vao

def matrix(handle, name, value, size=4):
    data = np.array(value, dtype=np.float32)
    (uniform4m if size == 4 else uniform3m)(uniform_location(handle, name.encode()), 1, 0, data.ctypes.data)

beam_program = program("projector-beam-composer")
output_program = program("archive-output")
beam_vao = vertex_array(beam_program, {name: (size, physical[name]) for name, size in [("position", 3), ("normal", 3), ("uv", 2)]}, physical["index"])
output_vao = vertex_array(output_program, {"position": (3, [-1, -1, 0, 3, -1, 0, -1, 3, 0]), "uv": (2, [0, 0, 2, 0, 0, 2])})
linear_frame, linear_texture = target(True)
output_frame, output_texture = target(False)
depth_texture = U(); gen_textures(1, C.byref(depth_texture)); active_texture(0x84C1); bind_texture(0x0DE1, depth_texture)
for option in [0x2801, 0x2800]: texture_parameter(0x0DE1, option, 0x2600)
for option in [0x2802, 0x2803]: texture_parameter(0x0DE1, option, 0x812F)
packed_depth = np.array([0, 0, 0, 0, 255, 255, 255, 255], dtype=np.uint8)
texture_image(0x0DE1, 0, 0x8058, 2, 1, 0, 0x1908, 0x1401, packed_depth.ctypes.data)
viewport(0, 0, width, height)
disable(0x0B44); disable(0x0B71)
identity = np.eye(4, dtype=np.float32).ravel().tolist()

def render(theme, draw, occlude=False):
    bind_framebuffer(0x8D40, linear_frame)
    disable(0x0BE2); clear_color(*theme["background"], 1); clear(0x4000)
    if draw:
        use_program(beam_program); bind_vao(beam_vao)
        matrix(beam_program, "projectionMatrix", physical["projectionMatrix"])
        matrix(beam_program, "modelViewMatrix", physical["modelViewMatrix"])
        matrix(beam_program, "normalMatrix", physical["normalMatrix"], 3)
        uniform3f(uniform_location(beam_program, b"diffuse"), *theme["diffuse"])
        uniform3f(uniform_location(beam_program, b"uProjectorEdge"), *physical["edge"])
        uniform1f(uniform_location(beam_program, b"opacity"), theme["opacity"])
        uniform1f(uniform_location(beam_program, b"uProjectorDark"), theme["dark"])
        uniform1f(uniform_location(beam_program, b"uProjectorPixelRatio"), pixel_ratio)
        active_texture(0x84C1); bind_texture(0x0DE1, depth_texture)
        uniform1i(uniform_location(beam_program, b"uProjectorDepth"), 1)
        uniform1f(uniform_location(beam_program, b"uProjectorOcclusion"), int(occlude))
        uniform2f(uniform_location(beam_program, b"uProjectorViewport"), width, height)
        enable(0x0BE2); blend_func(0x0302, 0x0303, 1, 0x0303); depth_mask(0)
        draw_elements(0x0004, len(physical["index"]), 0x1403, None)
    bind_framebuffer(0x8D40, output_frame); disable(0x0BE2)
    use_program(output_program); bind_vao(output_vao)
    matrix(output_program, "projectionMatrix", identity); matrix(output_program, "modelViewMatrix", identity)
    uniform1f(uniform_location(output_program, b"toneMappingExposure"), theme["exposure"])
    active_texture(0x84C0); bind_texture(0x0DE1, linear_texture)
    uniform1i(uniform_location(output_program, b"tDiffuse"), 0)
    draw_arrays(0x0004, 0, 3)
    pixels = np.empty((height, width, 4), dtype=np.uint8)
    read_pixels(0, 0, width, height, 0x1908, 0x1401, pixels.ctypes.data)
    assert get_error() == 0
    return pixels[::-1, :, :3].copy()

def samples(image, coordinates):
    x = np.clip(coordinates[:, 0], 0, width - 1.001); y = np.clip(coordinates[:, 1], 0, height - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    wx, wy = (x - x0)[:, None], (y - y0)[:, None]
    return image[y0, x0]*(1-wx)*(1-wy) + image[y0, x0+1]*wx*(1-wy) + image[y0+1, x0]*(1-wx)*wy + image[y0+1, x0+1]*wx*wy

report = {"scope": physical["scope"] + " Linear RGBA16F normal-alpha blending followed by actual Three OutputShader ACES/sRGB.", "renderer": api.get_string(0x1F01).decode(), "pixelRatio": pixel_ratio, "themes": []}
fig, axes = plt.subplots(2, 4, figsize=(14, 5), layout="constrained")
offsets = np.linspace(-14, 14, 281)
for theme_index, theme in enumerate(physical["themes"]):
    baseline, raster = render(theme, False), render(theme, True)
    clipped = render(theme, True, True)
    assert np.array_equal(clipped[:, :width//2], baseline[:, :width//2]), "Packed foreground depth must hide every optical fragment"
    assert np.array_equal(clipped[:, width//2:], raster[:, width//2:]), "Packed far depth must preserve every optical fragment"
    name = theme["name"]
    Image.fromarray(raster).save(root / f"beam-{suffix}-{name}.png")
    delta = raster.astype(float) - baseline.astype(float)
    luma = delta @ np.array([.2126, .7152, .0722])
    mask = np.max(np.abs(delta), axis=2) >= 1
    row = {"name": name, "packedDepthOcclusion": "foreground blocked / background preserved exactly", "backgroundRGB": baseline[0, 0].tolist(), "maxChannelDifference": float(np.max(np.abs(delta))),
           "maximumBrightening": float(luma.max()), "maximumDarkening": float(luma.min()),
           "changedPixels": int(mask.sum()), "pixelsOver8RGB": int((np.max(np.abs(delta), axis=2) >= 8).sum()), "profiles": []}
    for edge in range(4):
        a, b = np.array(physical["sourcePixels"][edge]), np.array(physical["receiverPixels"][edge])
        centre = a * .45 + b * .55
        direction = (b - a) / np.linalg.norm(b - a); normal = np.array([-direction[1], direction[0]])
        coords = (centre + offsets[:, None] * normal) * pixel_ratio
        profile = (samples(raster, coords) - samples(baseline, coords)) @ np.array([.2126, .7152, .0722])
        magnitude = -profile if theme_index == 0 else profile
        half_peak = magnitude > magnitude.max() * .5
        row["profiles"].append({"edge": edge, "centre": centre.tolist(), "minimumDeltaY": float(profile.min()), "maximumDeltaY": float(profile.max()),
                                "widthAboveHalfPeakCssPixels": float(half_peak.sum() * (offsets[1]-offsets[0]))})
        ax = axes[theme_index, edge]; ax.plot(offsets, profile, color="#a48652"); ax.axhline(0, color="#999", lw=.6)
        ax.set_title(f"{name}: corner ray {edge}"); ax.set_xlabel("perpendicular offset / pixels"); ax.set_ylabel("delta luma / 8-bit RGB")
        ax.grid(alpha=.15)
    report["themes"].append(row)
fig.suptitle(f"Standalone beam / {suffix} / actual shader, geometry, float blend + OutputShader")
fig.savefig(root / f"beam-{suffix}-profiles.png", dpi=150)
plt.close(fig)
(root / f"beam-{suffix}-pixels.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
api.make_current(api.display, None, None, None)
api.egl("eglDestroyContext", U, [P, P])(api.display, api.context)
api.egl("eglTerminate", U, [P])(api.display)
