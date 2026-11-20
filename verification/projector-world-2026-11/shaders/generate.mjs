import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import * as THREE from "../../../node_modules/three/build/three.module.js";
import ts from "../../../node_modules/typescript/lib/typescript.js";
import { WebGLPrograms } from "../../../node_modules/three/src/renderers/webgl/WebGLPrograms.js";
import { WebGLProgram } from "../../../node_modules/three/src/renderers/webgl/WebGLProgram.js";
import { ProjectorBeam } from "../../../src/projector-beam.ts";
import { PROJECTOR_APERTURE } from "../../../src/projector-aperture.ts";
import { archiveFraming } from "../../../src/viewport-layout.ts";
import { carrierReceiverPlane, carrierPlaneCorners } from "../../../src/carrier-flight.ts";
import { OutputShader } from "../../../node_modules/three/examples/jsm/shaders/OutputShader.js";

if (!process.argv[2]) throw new Error("Usage: node --experimental-strip-types generate.mjs <output-directory>");
const output = resolve(process.argv[2]) + sep;
const hash = value => createHash("sha256").update(value).digest("hex");
mkdirSync(output, { recursive: true });
const cubeText = readFileSync(new URL("../../../src/cube-projection.ts", import.meta.url), "utf8");
const source = ts.createSourceFile("cube-projection.ts", cubeText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const cubeClass = source.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === "CubeProjection");
assert(cubeClass);
const cube = { formationUniforms: { surface: { value: .5 }, outline: { value: .5 }, size: { value: 3 } } };
for (const name of ["bodyMaterial", "lineMaterial", "formationDepthMaterial"]) {
  const member = cubeClass.members.find(member => member.name?.getText(source) === name);
  assert(member?.initializer, name);
  cube[name] = new Function(...Object.keys(THREE), "return (" + member.initializer.getText(source) + ");")(...Object.values(THREE));
  let hook;
  const visit = node => {
    if (ts.isBinaryExpression(node) && node.left.getText(source) === `this.${name}.onBeforeCompile`) hook = node.right;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(cubeClass, visit);
  assert(hook && ts.isArrowFunction(hook), `Actual production ${name} hook`);
  cube[name].onBeforeCompile = new Function("return (" + hook.getText(source) + ");").call(cube);
}

const beam = new ProjectorBeam(new THREE.Scene());
const geometry = new THREE.BoxGeometry();
geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
const cubeObject = new THREE.Mesh(geometry, cube.bodyMaterial);
const lineObject = new THREE.LineSegments(geometry, cube.lineMaterial);
const depthObject = new THREE.Mesh(geometry, cube.formationDepthMaterial);
const texture = new THREE.Texture({ height: 256, width: 768 });
texture.mapping = THREE.CubeUVReflectionMapping;
const cubeScene = new THREE.Scene(); cubeScene.environment = texture;
const plainScene = new THREE.Scene();
const noLights = { directional: [], point: [], spot: [], spotLightMap: [], rectArea: [], hemi: [],
  directionalShadowMap: [], pointShadowMap: [], spotShadowMap: [], numSpotLightShadowsWithMaps: 0, numLightProbes: 0 };
const cubeLights = { ...noLights, directional: [{}, {}], hemi: [{}], directionalShadowMap: [{}] };
const manifest = [];

function generate(name, object, scene, lights, target, shadowType = THREE.PCFShadowMap) {
  const material = object.material;
  const captured = new Map();
  const gl = { VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    createProgram: () => ({}), createShader: type => ({ type }), shaderSource: (shader, text) => captured.set(shader.type, text),
    compileShader() {}, attachShader() {}, linkProgram() {}, bindAttribLocation() {}, deleteProgram() {} };
  const renderer = { getContext: () => gl, getRenderTarget: () => target,
    state: { buffers: { depth: { getReversed: () => false } } },
    outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping,
    shadowMap: { enabled: lights.directionalShadowMap.length > 0, type: shadowType } };
  const programs = WebGLPrograms(renderer, { get: value => value }, { has: () => false },
    { precision: "highp", getMaxPrecision: value => value, logarithmicDepthBuffer: false }, {}, { numPlanes: 0, numIntersection: 0 });
  const params = programs.getParameters(material, lights, lights.directionalShadowMap, scene, object);
  const shader = { vertexShader: params.vertexShader, fragmentShader: params.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, renderer);
  params.vertexShader = shader.vertexShader; params.fragmentShader = shader.fragmentShader;
  // This is Three's installed program source generator, including all recursive
  // ShaderChunks, light/clipping substitutions, unrolling, GLES3 prefix, tone
  // mapping and color-space code. Only its GL sink is intercepted here; the
  // resulting exact strings are compiled and linked separately by Mesa GLES.
  new WebGLProgram(renderer, name, params, { releaseStatesOfProgram() {} });
  const vertex = `${name}.vert`, fragment = `${name}.frag`;
  writeFileSync(output + vertex, captured.get(gl.VERTEX_SHADER));
  writeFileSync(output + fragment, captured.get(gl.FRAGMENT_SHADER));
  manifest.push({ name, vertex, fragment, vertexSha256: hash(captured.get(gl.VERTEX_SHADER)), fragmentSha256: hash(captured.get(gl.FRAGMENT_SHADER)), material: material.type, shaderID: params.shaderID,
    transparent: material.transparent, clearcoat: params.clearcoat, environment: params.envMap,
    shadow: params.shadowMapEnabled, numDirLights: params.numDirLights, numHemiLights: params.numHemiLights,
    toneMapping: params.toneMapping, colorSpace: params.outputColorSpace,
    customUniforms: Object.keys(shader.uniforms) });
}
generate("projector-beam-composer", beam.mesh, plainScene, noLights, {});
generate("projector-beam-direct", beam.mesh, plainScene, noLights, null);
generate("cube-ceramic-formation", cubeObject, cubeScene, cubeLights, null);
generate("cube-outline-formation", lineObject, cubeScene, noLights, null);
generate("cube-formation-shadow-depth", depthObject, plainScene, noLights, {});
const outputMaterial = new THREE.RawShaderMaterial({ name: OutputShader.name,
  vertexShader: OutputShader.vertexShader, fragmentShader: OutputShader.fragmentShader,
  defines: { ACES_FILMIC_TONE_MAPPING: "", SRGB_TRANSFER: "" } });
generate("archive-output", new THREE.Mesh(geometry, outputMaterial), plainScene, noLights, null);

// Exact production beam geometry in a settled entry shot. Translation of the
// whole cassette/rig is immaterial; use local cassette origin as world origin.
const viewport = { width: 1280, height: 800 };
const framing = archiveFraming(viewport.width, viewport.height, 7.33, 1, false);
const backward = new THREE.Vector3(-.277, .238, .931).normalize();
const right = new THREE.Vector3(0, 1, 0).cross(backward).normalize();
const up = new THREE.Vector3().crossVectors(backward, right);
const aim = new THREE.Vector3(0, 1.85, 0)
  .addScaledVector(right, (.5 - framing.detailX) * viewport.width / viewport.height * framing.span)
  .addScaledVector(up, (framing.detailY - .5) * framing.span);
const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(framing.span / 144)), viewport.width / viewport.height, 5, 300);
camera.position.copy(aim).addScaledVector(backward, 72); camera.lookAt(aim); camera.updateMatrixWorld();
const aperture = PROJECTOR_APERTURE.corners.map(value => new THREE.Vector3(value.x, value.y, value.z));
const toLocal = value => { const relative = value.clone().sub(aim); return { x: relative.dot(right) / framing.span,
  y: relative.dot(up) / framing.span, z: relative.dot(backward) / framing.span }; };
const plane = carrierReceiverPlane(viewport, 72 / framing.span, { corners: aperture.map(toLocal),
  normal: { x: right.z, y: up.z, z: backward.z }, clearance: .9 / framing.span });
const receiver = carrierPlaneCorners(plane, viewport).map(value => aim.clone().addScaledVector(right, value.x * framing.span)
  .addScaledVector(up, value.y * framing.span).addScaledVector(backward, value.z * framing.span));
beam.update({ source: aperture, receiver, reach: 1, spread: 1, power: 1, dark: false });
const hook = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} };
beam.mesh.material.onBeforeCompile(hook, null);
const project = value => { const p = value.clone().project(camera); return [(p.x + 1) * viewport.width / 2, (1 - p.y) * viewport.height / 2]; };
const physical = { viewport, scope: "Standalone production ProjectorBeam, actual aperture and solved receiver in settled entry camera; no archive meshes, AO/DOF, DOM, or compositor acceptance.",
  source: aperture.map(point => point.toArray()), receiver: receiver.map(point => point.toArray()),
  sourcePixels: aperture.map(project), receiverPixels: receiver.map(project),
  position: Array.from(beam.mesh.geometry.attributes.position.array), normal: Array.from(beam.mesh.geometry.attributes.normal.array),
  uv: Array.from(beam.mesh.geometry.attributes.uv.array), index: Array.from(beam.mesh.geometry.index.array),
  projectionMatrix: camera.projectionMatrix.elements, modelViewMatrix: camera.matrixWorldInverse.elements,
  normalMatrix: new THREE.Matrix3().getNormalMatrix(camera.matrixWorldInverse).elements,
  edge: hook.uniforms.uProjectorEdge.value.toArray(), themes: [] };
for (const [name, dark, background, exposure] of [["light", false, "#eae5e1", 1.05], ["dark", true, "#11181b", .98]]) {
  beam.update({ source: aperture, receiver, reach: 1, spread: 1, power: 1, dark });
  physical.themes.push({ name, dark: Number(dark), background: new THREE.Color(background).toArray(), exposure,
    diffuse: beam.mesh.material.color.toArray(), opacity: beam.mesh.material.opacity });
}
writeFileSync(output + "beam-physical.json", JSON.stringify(physical, null, 2));
writeFileSync(output + "manifest.json", JSON.stringify(manifest, null, 2));
writeFileSync(output + "production-inputs.json", JSON.stringify({
  three: JSON.parse(readFileSync(new URL("../../../node_modules/three/package.json", import.meta.url), "utf8")).version,
  sourceHashes: Object.fromEntries(["projector-beam.ts", "cube-projection.ts", "carrier-flight.ts", "projector-aperture.ts", "viewport-layout.ts"].map(name =>
    ["src/" + name, hash(readFileSync(new URL("../../../src/" + name, import.meta.url)))])),
}, null, 2));
beam.dispose(); geometry.dispose(); texture.dispose();
for (const name of ["bodyMaterial", "lineMaterial", "formationDepthMaterial"]) cube[name].dispose();
outputMaterial.dispose();
console.log(JSON.stringify({ generated: manifest.length, output, programs: manifest.map(item => item.name) }, null, 2));
