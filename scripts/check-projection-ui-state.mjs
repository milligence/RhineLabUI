// Regression checks for the two state failures found during the projection UI
// review. Production methods own the behavior; the harness supplies only scroll
// elements and inert rendering/DOM effects. This does not validate browser
// layout, scroll clamping, focus, CSS, or WebGL pixels.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { PerspectiveCamera, Vector3 } from "three";
import { CubeProjection, defaultCubeExperiment, parseCubeExperiment } from "../src/cube-projection.ts";
import { CubeArcball } from "../src/cube-rotation.ts";
import * as html from "../src/html.ts";
import * as projectionTypes from "../src/projection-types.ts";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const sourceFiles = Object.fromEntries([
  "src/research-projection.ts", "src/cube-projection.ts", "src/cube-rotation.ts",
  "src/html.ts", "src/projection-types.ts", "scripts/check-projection-ui-state.mjs", "package-lock.json",
].map(file => [file, sha256(readFileSync(new URL(`../${file}`, import.meta.url)))]));

// ResearchProjection imports styles, so transpile that production module for a
// Node-only method check. Its non-style dependencies are the real modules.
const deferredFrames = [];
const researchModule = { exports: {} };
const researchSource = readFileSync(new URL("../src/research-projection.ts", import.meta.url), "utf8");
const researchCode = ts.transpileModule(researchSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(researchCode, {
  exports: researchModule.exports,
  module: researchModule,
  require(specifier) {
    if (specifier.endsWith(".css")) return {};
    if (specifier === "./html") return html;
    if (specifier === "./projection-types") return projectionTypes;
    throw new Error(`Unexpected research dependency: ${specifier}`);
  },
  requestAnimationFrame: callback => deferredFrames.push(callback),
  cancelAnimationFrame() {},
}, { filename: "src/research-projection.ts" });
const { ResearchProjection } = researchModule.exports;
const record = { scrollTop: 732 };
const retrospective = { scrollTop: 48 };
const evidence = { scrollTop: 62 };
const panes = {
  ".research-contemporary .research-plane-scroll": record,
  ".research-hindsight .research-plane-scroll": retrospective,
  ".research-evidence-scroll": evidence,
};
const research = Object.create(ResearchProjection.prototype);
Object.assign(research, {
  ordered: [{ id: "T13" }], selected: 0, route: [0],
  positions: new Map([["T13", { x: 120, y: 555 }]]),
  x: 0, y: 0, scale: 1, focused: true, settled: true, playing: false, reduced: false,
  formation: 1, formationEdges: [], formationNodes: [], presentationScale: 1, presentationDetail: 1,
  data: { layout: "evolution", edges: [] }, reading: new Map(),
  body: { dataset: {}, scrollTop: 0 }, stage: { clientWidth: 1200, clientHeight: 600 },
  inspector: { dataset: { nodeId: "T13" }, querySelector: selector => panes[selector] },
  abort: { signal: { aborted: false } }, paintAssociations() {},
});

research.captureReadingPosition();
assert.equal(research.reading.get("T13").record, 732);
// Revisited nodes have new, zeroed containers until their transfer settles.
research.settled = false;
record.scrollTop = retrospective.scrollTop = evidence.scrollTop = 0;
for (let i = 0; i < 10; i++) research.getStats();
research.getState();
assert.equal(research.reading.get("T13").record, 732,
  "Polling and state capture during transfer must preserve the previous reading");
research.finishFlight();
assert.equal(record.scrollTop, 732, "Record restores before any deferred animation frame");
assert.equal(retrospective.scrollTop, 48, "Hindsight restores its own saved reading");
assert.equal(evidence.scrollTop, 62, "Evidence restores its own saved reading");
record.scrollTop = 650;
research.getStats();
assert.equal(research.reading.get("T13").record, 732, "Diagnostics remain read-only after settlement");
assert.equal(research.getState().reading.T13.record, 650, "Explicit state capture records a settled reading change");

// The Cube constructor and rendering/DOM output are absent. Mutation, parser,
// history, baseline comparison and presentation-camera methods remain real.
function cubeHarness(input) {
  const nodes = new Map(), readouts = {};
  const cube = Object.create(CubeProjection.prototype);
  Object.assign(cube, {
    state: parseCubeExperiment(input), root: { dataset: {}, style: { setProperty() {} } }, options: {},
    archiveContext: { title: "", description: "" }, archiveBaseline: null, archiveModified: false,
    disposed: false, task: "inspect", tool: "inspect", throughObserver: false, showMarkers: false,
    undoStack: [], redoStack: [], pointers: new Map(), ball: new CubeArcball(),
    camera: new PerspectiveCamera(), target: new Vector3(),
    cancelObserverGesture() {}, countSize: { width: 0, height: 0 }, apparatus: { visible: false }, selected: null, hover: null,
    axis: "z", layer: 1, paint: "#c79845", erase: false, distance: 9, wheelHistoryAt: 12, rangeHistorySaved: true,
    formation: 1, formationUniforms: { surface: { value: 1 }, outline: { value: 1 }, size: { value: 3 } },
    floorOpacity: .24, floor: { material: { uniforms: { shadowOpacity: { value: .24 } } } },
    lineMaterial: { opacity: .16 }, selection: { visible: false }, countRevision: 0,
    query(selector) { if (!nodes.has(selector)) nodes.set(selector, {}); return nodes.get(selector); },
    readout(name, text) { readouts[name] = text; },
    buildGeometry() {}, syncUI() { this.syncContext(); this.syncHistory(); },
    updateMathCamera() {}, updateSelection() {}, updateSightline() {}, syncObserver() {}, scheduleCount() {}, requestFrame() {},
    resetInspection() {}, restoreVisibleFocus() {}, announce(text) { readouts.status = text; },
  });
  return { cube, readouts, nodes };
}

const a = defaultCubeExperiment(3);
a.colors[1][0] = "#A1B2C3";
const { cube, readouts, nodes } = cubeHarness(a);
const original = structuredClone(a);
original.observer.up = [0, 2, 0]; original.colors[1][0] = "#a1b2c3";
cube.setArchiveContext("原始构造 A", "原始事实", original);
assert.equal(cube.getStats().archiveModified, false, "Baseline normalizes up vectors and color case");
cube.restoreInspectionState({ orientation: [0, .5, 0, Math.sqrt(.75)], target: [1, 2, 0], distance: 11 });
cube.syncContext();
assert.equal(cube.getStats().archiveModified, false, "Free inspection is outside the experimental baseline");
assert.deepEqual(cube.state.observer, parseCubeExperiment(a).observer);

cube.tool = "remove"; cube.task = "edit"; cube.act({ index: 0, face: 0 });
assert.equal(cube.getStats().archiveModified, true, "Removing a voxel marks a local study");
assert.equal(readouts["task-overline"], "LOCAL STUDY / 本地试作");
assert.match(nodes.get('[data-readout="archive-note"]').textContent, /原始构造 A/);
cube.history(false);
assert.equal(cube.getStats().archiveModified, false, "Undo to the original construction clears the local-study mark");
cube.history(true); assert.equal(cube.getStats().archiveModified, true);
cube.history(false);
cube.tool = "paint"; cube.act({ index: 1, face: 1 });
assert.equal(cube.getStats().archiveModified, true, "Face colors belong to the experiment");
cube.history(false); assert.equal(cube.getStats().archiveModified, false);
cube.changeObserver(o => { o.eye[0] += .25; });
assert.equal(cube.getStats().archiveModified, true, "Changing O marks a study without rebuilding geometry");
cube.history(false); assert.equal(cube.getStats().archiveModified, false);
cube.changeObserver(o => { o.eye[0] += 1e-12; });
assert.equal(cube.getStats().archiveModified, false, "Floating point noise does not mark a local study");

const b = defaultCubeExperiment(4); b.present[3] = 0;
cube.wheelHistoryAt = 12; cube.rangeHistorySaved = true;
cube.loadExperiment(b, { resetHistory: true }); cube.setArchiveContext("原始构造 B", "原始事实 B", b);
assert.equal(cube.getStats().archiveModified, false);
assert.equal(cube.getStats().undo, 0); assert.equal(cube.getStats().redo, 0);
assert.equal(cube.rangeHistorySaved, false); assert.equal(cube.wheelHistoryAt, -Infinity);
cube.history(false);
assert.equal(cube.state.n, 4, "Preset history cannot restore the previous archive");
const imported = structuredClone(b); imported.present[2] = 0;
cube.loadExperiment(imported);
assert.equal(cube.getStats().undo, 1, "A file import remains undoable by default");
assert.equal(cube.getStats().archiveModified, true);
assert.equal(readouts["task-title"], "构造试作");
assert.notEqual(readouts["task-hint"], "原始事实 B", "Modified experiments do not inherit historical result wording");
cube.history(false);
assert.equal(cube.getStats().archiveModified, false);
assert.equal(readouts["task-title"], "原始构造 B"); assert.equal(readouts["task-hint"], "原始事实 B");
const historyBefore = [cube.getStats().undo, cube.getStats().redo];
cube.loadExperiment({ ...b, n: 0 }, { resetHistory: true });
assert.deepEqual([cube.getStats().undo, cube.getStats().redo], historyBefore, "Invalid input preserves the current history");
assert.equal(cube.state.n, 4);
cube.setArchiveContext("独立实验", "无历史基线");
assert.equal(cube.getStats().archiveModified, false);

// Optical exposure changes material uniforms, never the experimental state,
// observation camera, ID estimate or history. Reverse visits are exact.
const preserved = () => JSON.stringify({ state: cube.getState(), view: cube.getInspectionState(),
  undo: cube.undoStack, redo: cube.redoStack, countRevision: cube.countRevision });
const beforeFormation = preserved();
const materialFrames = [];
for (const phase of [0, .2, .4, .6, .85, 1]) {
  cube.setFormation(phase);
  materialFrames.push([cube.formationUniforms.outline.value, cube.formationUniforms.surface.value]);
  assert.equal(preserved(), beforeFormation);
}
for (let i = 1; i < materialFrames.length; i++) materialFrames[i].forEach((value, axis) => assert(value >= materialFrames[i - 1][axis]));
assert(materialFrames[2][0] > materialFrames[2][1], "The actual contour forms ahead of the actual material");
cube.setFormation(.4); assert.deepEqual([cube.formationUniforms.outline.value, cube.formationUniforms.surface.value], materialFrames[2]);
cube.reduced = true; cube.setFormation(.1);
assert.equal(cube.formation, 1); assert.equal(cube.formationUniforms.surface.value, 1);
assert.equal(cube.lineMaterial.opacity, .16, "Completed projection restores the original line material");

const styleBoundary = () => ({ setProperty(key, value) { this[key] = value; }, getPropertyValue(key) { return this[key] ?? ""; } });
const formingGraph = Object.create(ResearchProjection.prototype);
const attributes = new Map(), graphPath = { setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
const nodeStyle = styleBoundary(), maskStyle = {}, heads = { style: {} };
Object.assign(formingGraph, { formation: 1, reduced: false, scale: 1,
  body: { dataset: {}, style: styleBoundary() }, map: { querySelector: () => heads },
  formationNodes: [{ node: { style: nodeStyle }, arrival: .32 }],
  formationEdges: [{ path: graphPath, mask: { style: maskStyle }, id: "actual-edge", length: 240, start: .20, end: .45 }],
});
formingGraph.setFormation(0); assert.equal(maskStyle.strokeDashoffset, "240");
formingGraph.setFormation(.3); const formedAtThirty = { offset: maskStyle.strokeDashoffset, label: nodeStyle["--formation-label-edge"] };
assert(Number(maskStyle.strokeDashoffset) > 0 && Number(maskStyle.strokeDashoffset) < 240);
formingGraph.setFormation(1); assert.equal(attributes.has("mask"), false, "Resolved graph uses its original stroke and dash semantics");
formingGraph.setFormation(.3); assert.deepEqual({ offset: maskStyle.strokeDashoffset, label: nodeStyle["--formation-label-edge"] }, formedAtThirty);
assert.equal(attributes.get("mask"), "url(#actual-edge)", "Reverse travel reattaches the same measured path mask");
formingGraph.reduced = true; formingGraph.setFormation(.1); assert.equal(attributes.has("mask"), false);

const landmark = { dataset: { node: "landmark" }, style: styleBoundary() };
const ordinary = { dataset: { node: "ordinary" }, style: styleBoundary() };
Object.assign(formingGraph, { reduced: false, presentationScale: 1, presentationDetail: 1,
  nodes: [landmark, ordinary], presentationLabels: new Set(["landmark"]), stage: { clientWidth: 1200 }, x: 120, y: 86, scale: .32 });
const anchorsBefore = [formingGraph.x, formingGraph.y, formingGraph.scale];
formingGraph.setPresentationScale(.44);
const heldInk = { ...formingGraph.body.style };
assert.equal(landmark.dataset.projectionLandmark, "true");
assert.equal(ordinary.dataset.projectionLandmark, "false");
assert.equal(formingGraph.body.style["--projection-name-clip"], "100.0000%");
formingGraph.setPresentationScale(.78);
assert.equal(formingGraph.body.style["--projection-name-clip"], "100.0000%", "Ordinary names stay absent while the plate is too small to read");
formingGraph.setPresentationScale(.88);
assert(Math.abs(parseFloat(formingGraph.body.style["--projection-name-clip"]) - 50) < .001);
formingGraph.setPresentationScale(.96); assert.equal(formingGraph.body.style["--projection-name-clip"], "0.0000%");
formingGraph.setPresentationScale(1); assert.equal(formingGraph.body.dataset.projecting, "false");
formingGraph.setPresentationScale(.44); assert.deepEqual({ ...formingGraph.body.style }, heldInk);
assert.deepEqual([formingGraph.x, formingGraph.y, formingGraph.scale], anchorsBefore, "Optical readability compensation cannot move graph anchors or its camera");
formingGraph.reduced = true; formingGraph.setPresentationScale(.44); assert.equal(formingGraph.body.dataset.projecting, "false");

const mobileNodes = ["outside", "before", "selected", "after", "edge"].map(id => ({ dataset: { node: id }, style: styleBoundary() }));
Object.assign(formingGraph, { reduced: false, focused: false, presentationScale: 1,
  stage: { clientWidth: 358, clientHeight: 539 }, data: { layout: "evolution" }, x: 0, y: 0, scale: 1,
  ordered: mobileNodes.map(node => ({ id: node.dataset.node })), selected: 2, route: [0, 1, 2, 3, 4], nodes: mobileNodes,
  positions: new Map(mobileNodes.map((node, i) => [node.dataset.node, { x: [-12, 85, 179, 270, 348][i], y: 220 }])),
  labelMetrics: new Map(mobileNodes.map(node => [node.dataset.node, { width: 40, height: 14 }])),
});
formingGraph.setPresentationScale(.46);
assert.deepEqual(mobileNodes.filter(node => node.dataset.projectionLandmark === "true").map(node => node.dataset.node), ["before", "after"]);
assert.equal(mobileNodes[2].dataset.projectionLandmark, "false", "The selected mobile record keeps one caption rather than a duplicate title");
formingGraph.stage.clientWidth = 250; formingGraph.setPresentationScale(.46, true);
assert.equal(mobileNodes[3].dataset.projectionLandmark, "false", "Resizing a held plate reevaluates complete label bounds");
formingGraph.setPresentationScale(1); assert(mobileNodes.every(node => node.dataset.projectionLandmark === undefined), "Reading arrival removes transient landmark selection");

console.log(JSON.stringify({
  passed: true, executed: new Date().toISOString(), node: process.version,
  scope: "Production state methods with inert UI/rendering effects; no browser layout or WebGL acceptance.",
  sourceDigest: sha256(JSON.stringify(sourceFiles)), sourceFiles,
  checks: {
    research: ["transfer snapshot protection", "synchronous reading restoration", "diagnostic read purity", "reversible measured-path exposure", "complete and reduced-motion mask removal", "selective held labels and continuous restoration", "screen compensation leaves graph anchors unchanged", "mobile landmarks use complete visible bounds and refresh on resize"],
    cube: ["normalized baseline", "free camera isolation", "geometry and face provenance", "observer provenance", "undo and redo provenance", "preset history isolation", "gesture grouping reset", "undoable file import", "invalid-load preservation", "contour before material", "reversible formation preserves experiment, camera, counting and history"],
  },
}, null, 2));
