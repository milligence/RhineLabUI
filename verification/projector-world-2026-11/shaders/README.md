# Standalone shader validation

These files validate the actual production shader hooks without a browser. They
are **not an ArchiveScene visual acceptance capture**: no archive models, AO,
depth of field, SMAA, DOM content, or camera animation is drawn in the beam PNGs.

## Reproduce

Run from the repository root, after its existing dependencies are available:

```sh
node --experimental-strip-types verification/projector-world-2026-11/shaders/generate.mjs /tmp/rhine-projector-shaders
python3 verification/projector-world-2026-11/shaders/compile.py /tmp/rhine-projector-shaders
python3 verification/projector-world-2026-11/shaders/raster.py /tmp/rhine-projector-shaders current 1
python3 verification/projector-world-2026-11/shaders/raster.py /tmp/rhine-projector-shaders current-dpr2 2
```

The scripts require an existing surfaceless EGL ES3 implementation. This run
used EGL 1.5, Mesa 25.0.7, and llvmpipe LLVM 19.1.7. The raster diagnostic also
uses NumPy, Pillow, and Matplotlib. No dependencies were installed and no
browser drivers, browser flags, or browser policies were changed.

`generate.mjs` reads the production ProjectorBeam module directly. TypeScript's
parser extracts CubeProjection's actual material initializers and three shader
hooks. The installed Three `WebGLPrograms` and `WebGLProgram` generate the GLSL,
including shader chunks, defines, lighting, color space, and tone mapping.
An inert GL sink captures those final strings; `compile.py` then submits them
to the actual GLES compiler and linker. Generated sources remain in the chosen
temporary directory. Manifests preserve their SHA-256 digests and production
input digests alongside the compiler reports.

The ceramic case includes clearcoat, CubeUV environment lighting, two
directional lights, one hemisphere light, and PCF shadows. The beam is checked
both through the composer's linear target and the direct-render ACES path.
The outline, formation shadow-depth pass, and actual Three OutputShader are
also compiled and linked.

## Beam raster

The receiving plane uses the production `carrierReceiverPlane` solver with the
actual aperture coordinates and the settled archive entry camera. The exact
ProjectorBeam position, normal, UV, and index buffers are drawn into RGBA16F
with normal alpha blending. The actual Three OutputShader applies ACES and
sRGB conversion. There are no fabricated beam pixels or substituted shader
equations. The retained PNGs use a plain light or dark scene background so
edge contrast can be measured independently of the archive assets.

Cross-sections lie 55% of the way along each source-to-receiver corner ray.
They measure the change in 8-bit output luminance from a separately rendered
background. The four sections may include two physical side surfaces where
their screen projections overlap; their combined width is not always the
width of one optical lip.

`beam-current-*` and `baseline-*` preserve the original result. That shader had
at most 3/255 channel contrast on the light background while the dark
background reached about 133/255 luminance change. `pass2-*` preserves the
first separated-lip and absorption-shoulder revision, including DPR 1 and 2
diagnostics. `pass3-*` records the subsequent adjustment: lighter absorption
on the light theme, a restrained wider shoulder on the dark theme, and the
shader's packed-depth comparison for the post-DOF draw. At DPR 1 its measured
middle sections are about 7–18/255 darker on the light background; the strongest
dark-background highlight is about 60/255 brighter. These are component
measurements rather than a full-scene contrast guarantee.

For current shaders the raster also executes the packed-depth branch with a
small known foreground/far depth texture. It asserts that every foreground
optical pixel disappears and every far-depth pixel exactly matches the
unoccluded raster. The PNGs themselves show the unoccluded beam. In production,
ProjectorBeamPass samples the actual Bokeh depth after DOF and before SMAA and
Output; when DOF is disabled the beam uses the ordinary hardware depth path.
