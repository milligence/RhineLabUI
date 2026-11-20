"""Compile and link Three-generated GLSL in the already installed Mesa EGL.

No browser, driver wrapper, package installation, or browser settings are used.
This validates shader compilation/linking only, not application rendering.
"""
import ctypes as C
import json
import sys
from pathlib import Path

if len(sys.argv) < 2:
    raise SystemExit("Usage: python3 compile.py <generated-directory>")
root = Path(sys.argv[1]).resolve()
ptr, I, U = C.c_void_p, C.c_int, C.c_uint
E = C.CDLL("libEGL.so.1")


def egl(name, result, args):
    function = getattr(E, name)
    function.restype = result
    function.argtypes = args
    return function


get_display = egl("eglGetPlatformDisplay", ptr, [U, ptr, C.POINTER(I)])
initialize = egl("eglInitialize", U, [ptr, C.POINTER(I), C.POINTER(I)])
bind_api = egl("eglBindAPI", U, [U])
choose_config = egl("eglChooseConfig", U, [ptr, C.POINTER(I), C.POINTER(ptr), I, C.POINTER(I)])
create_context = egl("eglCreateContext", ptr, [ptr, ptr, ptr, C.POINTER(I)])
make_current = egl("eglMakeCurrent", U, [ptr, ptr, ptr, ptr])
get_proc = egl("eglGetProcAddress", ptr, [C.c_char_p])


def gl(name, result, args):
    address = get_proc(name.encode())
    assert address, name
    return C.CFUNCTYPE(result, *args)(address)


display = get_display(0x31DD, None, None)  # EGL_PLATFORM_SURFACELESS_MESA
major, minor = I(), I()
assert initialize(display, C.byref(major), C.byref(minor)), "EGL initialization failed"
assert bind_api(0x30A0), "Cannot bind OpenGL ES"
attributes = (I * 9)(0x3033, 1, 0x3040, 0x40, 0x3024, 8, 0x3023, 8, 0x3038)
config, count = ptr(), I()
assert choose_config(display, attributes, C.byref(config), 1, C.byref(count)) and count.value
context = create_context(display, config, None, (I * 3)(0x3098, 3, 0x3038))
assert context and make_current(display, None, None, context), "Cannot make ES3 compiler context current"
get_string = gl("glGetString", C.c_char_p, [U])
create_shader = gl("glCreateShader", U, [U])
shader_source = gl("glShaderSource", None, [U, I, C.POINTER(C.c_char_p), C.POINTER(I)])
compile_shader = gl("glCompileShader", None, [U])
shader_value = gl("glGetShaderiv", None, [U, U, C.POINTER(I)])
shader_log = gl("glGetShaderInfoLog", None, [U, I, C.POINTER(I), C.c_char_p])
create_program = gl("glCreateProgram", U, [])
attach_shader = gl("glAttachShader", None, [U, U])
link_program = gl("glLinkProgram", None, [U])
program_value = gl("glGetProgramiv", None, [U, U, C.POINTER(I)])
program_log = gl("glGetProgramInfoLog", None, [U, I, C.POINTER(I), C.c_char_p])
delete_shader = gl("glDeleteShader", None, [U])
delete_program = gl("glDeleteProgram", None, [U])


def info(handle, getter, logger):
    size, length = I(), I()
    getter(handle, 0x8B84, C.byref(size))  # INFO_LOG_LENGTH
    if size.value <= 1:
        return ""
    buffer = C.create_string_buffer(size.value)
    logger(handle, size, C.byref(length), buffer)
    return buffer.value.decode(errors="replace")


if __name__ == "__main__":
    report = {"egl": f"{major.value}.{minor.value}",
              "gl": get_string(0x1F02).decode(), "renderer": get_string(0x1F01).decode(),
              "glsl": get_string(0x8B8C).decode(), "scope": "Actual Three-generated GLSL ES vertex/fragment compilation and program linking; no draw call or application visual acceptance.",
              "programs": []}
    try:
        for item in json.loads((root / "manifest.json").read_text()):
            result = {"name": item["name"], "vertexSha256": item.get("vertexSha256"), "fragmentSha256": item.get("fragmentSha256"), "shaders": []}
            handles = []
            for kind, enum in [("vertex", 0x8B31), ("fragment", 0x8B30)]:
                code = (root / item[kind]).read_bytes()
                shader = create_shader(enum)
                handles.append(shader)
                code_pointer = C.c_char_p(code)
                length = I(len(code))
                shader_source(shader, 1, C.byref(code_pointer), C.byref(length))
                compile_shader(shader)
                status = I()
                shader_value(shader, 0x8B81, C.byref(status))  # COMPILE_STATUS
                result["shaders"].append({"kind": kind, "compiled": bool(status.value),
                                          "log": info(shader, shader_value, shader_log), "bytes": len(code)})
            program = create_program()
            for shader in handles:
                attach_shader(program, shader)
            link_program(program)
            linked = I()
            program_value(program, 0x8B82, C.byref(linked))
            result["linked"] = bool(linked.value)
            result["log"] = info(program, program_value, program_log)
            report["programs"].append(result)
            for shader in handles:
                delete_shader(shader)
            delete_program(program)
    finally:
        make_current(display, None, None, None)
        egl("eglDestroyContext", U, [ptr, ptr])(display, context)
        egl("eglTerminate", U, [ptr])(display)

    report["passed"] = all(item["linked"] and all(shader["compiled"] for shader in item["shaders"]) for item in report["programs"])
    (root / "compile-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report["passed"] else 1)
