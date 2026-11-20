import assert from "node:assert/strict";
import * as THREE from "three";
import { ProjectorBeam, ProjectorBeamPass } from "../src/projector-beam.ts";
import { SharedDepthBokeh } from "../src/shared-depth.ts";

// Run with --experimental-transform-types for SharedDepthBokeh's existing
// constructor parameter property. No DOM, synthetic image or WebGL replacement
// is used to claim visual acceptance: this exercises geometry and depth routing.
const scene = new THREE.Scene();
const beam = new ProjectorBeam(scene);
const quad = (width, height, z) => [
  new THREE.Vector3(-width / 2, height / 2, z),
  new THREE.Vector3(width / 2, height / 2, z),
  new THREE.Vector3(width / 2, -height / 2, z),
  new THREE.Vector3(-width / 2, -height / 2, z),
];
const source = quad(.5, .18, .25), receiver = quad(4.2, 2.8, 4.6);
const frame = { source, receiver, reach: 1, spread: 1, power: .8 };
const attribute = beam.mesh.geometry.getAttribute("position");
const buffer = attribute.array;
const readPoint = index => new THREE.Vector3().fromBufferAttribute(attribute, index);
const close = (actual, expected, message) => assert(actual.distanceTo(expected) < 1e-6, message);
assert.equal(beam.mesh.visible, false);
beam.update(frame);
assert.equal(beam.mesh.visible, true);
assert.equal(attribute.count, 16);
assert.equal(beam.mesh.geometry.index.count, 24, "The volume has eight side triangles and no filled end caps");
for (let side = 0; side < 4; side++) {
  const next = (side + 1) % 4;
  for (const [corner, expected] of [source[side], source[next], receiver[next], receiver[side]].entries())
    close(readPoint(side * 4 + corner), expected, "Side surfaces meet the actual aperture and receiving frame");
}
assert([...beam.mesh.geometry.getAttribute("normal").array].every(Number.isFinite));
assert(Number.isFinite(beam.mesh.geometry.boundingSphere.radius));
const initialRevision = beam.revision, positionVersion = attribute.version;
beam.update(frame);
assert.equal(beam.revision, initialRevision, "A stable physical rig does not invalidate the static render cache");
assert.equal(attribute.version, positionVersion, "An identical frame does not upload vertex data again");
beam.update({ ...frame, reach: .5 });
close(readPoint(3), source[0].clone().lerp(receiver[0], .5), "The advancing light front travels from the real source");
beam.update({ ...frame, spread: 0 });
assert(readPoint(3).distanceTo(readPoint(2)) < receiver[0].distanceTo(receiver[1]) * .1, "Collimated light opens into the final receiver");
beam.update(frame);
assert.equal(beam.mesh.geometry.getAttribute("position").array, buffer, "The same bounded geometry buffer survives forward and reverse playback");
const beforeTheme = attribute.version;
beam.update({ ...frame, dark: .5, power: .3 });
assert.equal(beam.mesh.material.opacity, .3);
assert.equal(attribute.version, beforeTheme, "Theme and optical power do not rebuild geometry");
assert.equal(beam.getStats().dark, .5);

// Exercise the actual installed MeshBasic shader's extension anchors. GPU
// compilation and its final tone-mapped appearance require the real browser.
const shader = {
  vertexShader: THREE.ShaderLib.basic.vertexShader,
  fragmentShader: THREE.ShaderLib.basic.fragmentShader,
  uniforms: { ...THREE.ShaderLib.basic.uniforms },
};
beam.mesh.material.onBeforeCompile(shader, undefined);
assert.match(shader.vertexShader, /vProjectorView = -mvPosition.xyz/);
assert.match(shader.fragmentShader, /outgoingLight = weightedRadiance/);
assert.match(shader.fragmentShader, /diffuseColor.a \*= opticalAlpha/);
assert.equal(shader.uniforms.uProjectorDark.value, .5);
beam.update({ ...frame, pixelRatio: 2 });
assert.equal(shader.uniforms.uProjectorPixelRatio.value, 2);
assert.equal(attribute.version, beforeTheme, "Resolution changes adjust optical widths without rebuilding geometry");
beam.update({ ...frame, pixelRatio: Number.NaN });
assert.equal(shader.uniforms.uProjectorPixelRatio.value, 1, "Invalid resolution ratios return to a finite default");
assert(beam.mesh.material.color instanceof THREE.Color, "Scene material-state traversal can read this material's color");
assert.equal(beam.mesh.material.depthTest, true);
assert.equal(beam.mesh.material.depthWrite, false);
assert.equal(beam.mesh.castShadow, false);
assert.equal(beam.mesh.userData.excludeFromAO, true);
assert.equal(beam.mesh.userData.excludeFromDepth, true);

const beforeInvalid = Array.from(buffer);
beam.update({ ...frame, source: [new THREE.Vector3(NaN, 0, 0), ...source.slice(1)] });
assert.equal(beam.mesh.visible, false, "Invalid geometry cannot enter the scene");
assert.deepEqual(Array.from(buffer), beforeInvalid, "A bad frame cannot poison the reusable geometry buffer");
beam.update({ ...frame, visible: false }); assert.equal(beam.mesh.visible, false);
beam.update({ ...frame, reach: 0 }); assert.equal(beam.mesh.visible, false);
beam.update({ ...frame, power: 0 }); assert.equal(beam.mesh.visible, false);
beam.update(frame);

// Use BokehPass's real fallback render, with only the renderer boundary inert.
// It installs its opaque depth material: depthWrite=false alone cannot protect
// a transparent light volume from being interpreted as solid scene geometry.
const camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
const opaque = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
const alreadyHidden = new THREE.Object3D();
alreadyHidden.visible = false; alreadyHidden.userData.excludeFromDepth = true;
scene.add(opaque, alreadyHidden);
const ao = { enabled: false, width: 100, height: 100 };
const bokeh = new SharedDepthBokeh(scene, camera, { focus: 5, aperture: .003, maxblur: .01 }, () => ao);
bokeh.setSize(100, 100);
let depthCalls = 0, throwDuringDepth = false;
const sentinel = new Error("test depth boundary");
const renderer = {
  autoClear: true,
  getClearColor: color => color.set(0x123456), getClearAlpha: () => .8,
  setClearColor() {}, setClearAlpha() {}, setRenderTarget() {}, clear() {},
  render(object) {
    if (object !== scene) return;
    depthCalls++;
    assert(scene.overrideMaterial instanceof THREE.MeshDepthMaterial, "The actual standalone depth pass runs");
    assert.equal(beam.mesh.visible, false, "Projected light is excluded while the opaque depth override is active");
    assert.equal(opaque.visible, true, "Real archive geometry remains in the depth pass");
    assert.equal(alreadyHidden.visible, false);
    if (throwDuringDepth) throw sentinel;
  },
};
const read = { texture: new THREE.Texture() };
bokeh.render(renderer, {}, read, 0, false);
assert.equal(beam.mesh.visible, true);
const standaloneDepth = bokeh.uniforms.tDepth.value;
assert.equal(bokeh.lastDepthTexture, standaloneDepth, "Post-DOF optics receive the actual standalone packed depth");
ao.enabled = true; ao.width = 50;
bokeh.render(renderer, {}, read, 0, false);
assert.equal(beam.mesh.visible, true, "AO scale changes retain identical transparent-depth routing");
throwDuringDepth = true;
assert.throws(() => bokeh.render(renderer, {}, read, 0, false), error => error === sentinel);
assert.equal(beam.mesh.visible, true, "A failed depth render still restores the visible optical field");
assert.equal(alreadyHidden.visible, false, "Restoration never reveals an object that was already hidden");
assert.equal(depthCalls, 3);
assert.equal(bokeh.lastDepthTexture, null, "A failed pass cannot publish a stale depth texture");
scene.overrideMaterial = null;
const packedDepth = new THREE.Texture();
ao.width = 100; ao.normalRenderTarget = { textures: [new THREE.Texture(), packedDepth] };
throwDuringDepth = false;
bokeh.render(renderer, {}, read, 0, false);
assert.equal(bokeh.lastDepthTexture, packedDepth, "Matching AO shares the same packed scene depth with the optical pass");
assert.equal(bokeh.uniforms.tDepth.value, standaloneDepth, "Shared-depth use preserves the standalone fallback binding");

// Bokeh blurs a transparent field against whatever opaque depth lies beneath.
// The late optical draw instead reads that depth, preserving its narrow edge.
const savedBackground = new THREE.Color(0xeae5e1), savedOverride = new THREE.MeshBasicMaterial();
scene.background = savedBackground; scene.overrideMaterial = savedOverride;
camera.layers.enable(5);
const savedMask = camera.layers.mask;
const output = new THREE.WebGLRenderTarget(100, 100);
let currentTarget = { name: "prior target" }, overlayCalls = 0, throwOverlay = false;
const priorTarget = currentTarget;
const overlayRenderer = {
  autoClear: true, getRenderTarget: () => currentTarget, setRenderTarget: value => { currentTarget = value; },
  render(drawnScene, drawnCamera) {
    overlayCalls++;
    assert.equal(drawnScene, scene); assert.equal(drawnCamera, camera);
    assert.equal(currentTarget, output); assert.equal(this.autoClear, false);
    assert.equal(scene.background, null); assert.equal(scene.overrideMaterial, null);
    assert.equal(camera.layers.mask, 2, "Only the optical layer is drawn after DOF");
    assert.equal(beam.mesh.material.depthTest, false, "The stale postprocess target depth is not used");
    assert.equal(shader.uniforms.uProjectorOcclusion.value, 1);
    assert.equal(shader.uniforms.uProjectorDepth.value, packedDepth);
    assert.deepEqual(shader.uniforms.uProjectorViewport.value.toArray(), [100, 100]);
    if (throwOverlay) throw sentinel;
  },
};
const overlay = new ProjectorBeamPass(scene, camera, beam, () => bokeh.lastDepthTexture);
beam.setPostProcessingEnabled(true);
const postRevision = beam.revision;
beam.setPostProcessingEnabled(true);
assert.equal(beam.revision, postRevision);
assert.equal(beam.mesh.layers.mask, 2);
const restored = () => {
  assert.equal(currentTarget, priorTarget); assert.equal(overlayRenderer.autoClear, true);
  assert.equal(scene.background, savedBackground); assert.equal(scene.overrideMaterial, savedOverride);
  assert.equal(camera.layers.mask, savedMask); assert.equal(beam.mesh.material.depthTest, true);
  assert.equal(shader.uniforms.uProjectorOcclusion.value, 0);
  assert.equal(shader.uniforms.uProjectorDepth.value, null);
  assert.equal(beam.revision, postRevision, "Per-pass uniforms do not defeat static-frame reuse");
};
overlay.render(overlayRenderer, {}, output); restored();
throwOverlay = true;
assert.throws(() => overlay.render(overlayRenderer, {}, output), error => error === sentinel); restored();
bokeh.lastDepthTexture = null;
overlay.render(overlayRenderer, {}, output);
assert.equal(overlayCalls, 2, "No depth means no unoccluded overlay draw");
beam.setPostProcessingEnabled(false);
assert.equal(beam.mesh.layers.mask, 1, "Without DOF the ordinary beauty pass owns hardware depth testing");
overlay.render(overlayRenderer, {}, output);
assert.equal(overlayCalls, 2);
overlay.dispose(); output.dispose(); savedOverride.dispose(); packedDepth.dispose(); ao.normalRenderTarget.textures[0].dispose();
bokeh.dispose(); read.texture.dispose(); opaque.geometry.dispose(); opaque.material.dispose();

let geometryDisposals = 0, materialDisposals = 0;
beam.mesh.geometry.addEventListener("dispose", () => geometryDisposals++);
beam.mesh.material.addEventListener("dispose", () => materialDisposals++);
beam.dispose(); beam.dispose(); beam.update(frame);
assert.equal(scene.children.includes(beam.mesh), false);
assert.equal(beam.mesh.visible, false);
assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);

console.log(JSON.stringify({ passed: true,
  scope: "Production beam geometry, cache, shader extension anchors, resources, standalone/shared Bokeh depth routing and post-DOF optical draw state at an inert renderer boundary. No GPU compilation or visual acceptance claim.",
  triangles: 8, vertices: 16, depthFallbackCases: depthCalls,
  checks: ["real corner endpoints", "front advance and widening", "bounded buffer and static-frame cache", "independent theme and power", "actual Three shader hook anchors", "real opaque-depth isolation", "invalid-input containment", "exception-safe visibility restoration", "shared and standalone optical-depth publication", "post-DOF state restoration", "normal hardware-depth fallback", "idempotent resource release"]
}, null, 2));
