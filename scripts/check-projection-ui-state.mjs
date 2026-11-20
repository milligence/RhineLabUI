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
import * as researchFormation from "../src/research-formation.ts";
import * as carrierFlight from "../src/carrier-flight.ts";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const sourceFiles = Object.fromEntries([
  "src/research-projection.ts", "src/cube-projection.ts", "src/cube-rotation.ts",
  "src/html.ts", "src/projection-types.ts", "src/research-formation.ts", "src/carrier-flight.ts",
  "scripts/check-projection-ui-state.mjs", "package-lock.json",
].map(file => [file, sha256(readFileSync(new URL(`../${file}`, import.meta.url)))]));

// ResearchProjection imports styles, so transpile that production module for a
// Node-only method check. Its non-style dependencies are the real modules.
const deferredFrames = new Map();
let nextFrame = 1;
const requestFrame = callback => { const id = nextFrame++; deferredFrames.set(id, callback); return id; };
const cancelFrame = id => deferredFrames.delete(id);
const advanceFrame = time => {
  // Like RAF, callbacks requested while delivering this frame wait for the
  // next frame, and cancellation also removes a not-yet-delivered callback.
  for (const id of [...deferredFrames.keys()]) {
    const callback = deferredFrames.get(id);
    deferredFrames.delete(id);
    callback?.(time);
  }
};
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
    if (specifier === "./research-formation") return researchFormation;
    if (specifier === "./carrier-flight") return carrierFlight;
    throw new Error(`Unexpected research dependency: ${specifier}`);
  },
  requestAnimationFrame: requestFrame,
  cancelAnimationFrame: cancelFrame,
  document: { hidden: false },
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
  readingProgress: 1, presentationSuspended: false, suspendedReplay: false, flightFrame: 0,
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
const svgBoundary = () => {
  const attributes = new Map();
  return { attributes, style: {}, setAttribute(key, value) { attributes.set(key, value); }, removeAttribute(key) { attributes.delete(key); } };
};
const formingGraph = Object.create(ResearchProjection.prototype);
const graphPath = svgBoundary(), attributes = graphPath.attributes;
const nodeStyle = styleBoundary(), maskStyle = {}, heads = { style: {} };
const edgeHead = svgBoundary(), trace = svgBoundary(), grains = Array.from({ length: 3 }, svgBoundary);
const formationCue = { id: "forming-node", arrival: .32, coreEnd: .42, labelStart: .36, labelEnd: .51 };
Object.assign(formingGraph, { formation: 1, reduced: false, scale: 1, presentationScale: .44, readingProgress: 1,
  presentationLabels: new Set(),
  body: { dataset: {}, style: styleBoundary() }, map: { querySelector: () => heads },
  formationNodes: [{ node: { style: nodeStyle }, cue: formationCue }],
  formationEdges: [{ path: graphPath, mask: { style: maskStyle }, id: "actual-edge", length: 240,
    index: 0, from: "source", to: "forming-node", start: .20, end: .45, primary: true, feedback: false, valid: true,
    samples: Array.from({ length: 97 }, (_, i) => ({ x: i * 2.5, y: 40 })), head: edgeHead, trace, grains }],
});
const formationSnapshot = () => ({
  offset: maskStyle.strokeDashoffset,
  core: [nodeStyle["--formation-core"], nodeStyle["--formation-sweep"], nodeStyle["--formation-fill"]],
  head: { ...edgeHead.style, attributes: [...edgeHead.attributes] },
  trace: { ...trace.style },
  grains: grains.map(grain => ({ ...grain.style, attributes: [...grain.attributes] })),
});
formingGraph.setReadingProgress(0);
formingGraph.setFormation(0); assert.equal(maskStyle.strokeDashoffset, "240");
formingGraph.setFormation(.3); const formedAtThirty = formationSnapshot();
assert(Number(maskStyle.strokeDashoffset) > 0 && Number(maskStyle.strokeDashoffset) < 240);
assert(Number(edgeHead.style.opacity) > 0, "The real edge has a finite moving light while it forms");
assert(Math.abs(Number(edgeHead.attributes.get("cx")) - 96) < 1e-9, "The head follows the sampled real edge arc");
assert(grains.every(grain => Number(grain.style.opacity) > 0 && Number.isFinite(Number(grain.attributes.get("cx")))));
assert.equal(nodeStyle["--reading-node"], "0", "Edge deposition does not reveal a complete node label");
formingGraph.setFormation(1); assert.equal(attributes.has("mask"), false, "Resolved graph uses its original stroke and dash semantics");
assert.equal(heads.style.display, "none", "Resolved graph removes the temporary light layer");
assert.equal(nodeStyle["--reading-node"], "0", "A complete held tree still waits for the reading camera");
formingGraph.setFormation(.3); assert.deepEqual(formationSnapshot(), formedAtThirty);
assert.equal(attributes.get("mask"), "url(#actual-edge)", "Reverse travel reattaches the same measured path mask");
formingGraph.reduced = true; formingGraph.setFormation(.1); assert.equal(attributes.has("mask"), false);

const landmark = { dataset: { node: "landmark" }, style: styleBoundary() };
const ordinary = { dataset: { node: "ordinary" }, style: styleBoundary() };
Object.assign(formingGraph, { reduced: false, presentationScale: 1, presentationDetail: 1,
  readingProgress: 1,
  formationNodes: [
    { node: landmark, cue: { ...formationCue, id: "landmark", arrival: .08 } },
    { node: ordinary, cue: { ...formationCue, id: "ordinary" } },
  ],
  nodes: [landmark, ordinary], presentationLabels: new Set(["landmark"]), stage: { clientWidth: 1200 }, x: 120, y: 86, scale: .32 });
const anchorsBefore = [formingGraph.x, formingGraph.y, formingGraph.scale];
const readingSnapshot = () => ({
  context: formingGraph.body.style["--reading-context"], content: formingGraph.body.style["--reading-content"],
  landmark: landmark.style["--reading-node"], ordinary: ordinary.style["--reading-node"],
});
formingGraph.setReadingProgress(0);
assert.deepEqual(readingSnapshot(), { context: "0", content: "0", landmark: "0", ordinary: "0" });
formingGraph.setReadingProgress(.45);
const readingAtFortyFive = readingSnapshot();
assert(Number(readingAtFortyFive.landmark) > Number(readingAtFortyFive.ordinary));
assert(Number(readingAtFortyFive.ordinary) > 0 && Number(readingAtFortyFive.ordinary) < 1,
  "Ordinary names become readable continuously during approach");
assert.equal(readingAtFortyFive.context, "0"); assert.equal(readingAtFortyFive.content, "0");
formingGraph.setReadingProgress(.8);
const cameraReading = carrierFlight.carrierReadingChannels(.8);
assert.equal(Number(formingGraph.body.style["--reading-context"]), cameraReading.context);
assert.equal(Number(formingGraph.body.style["--reading-content"]), cameraReading.reading);
formingGraph.setReadingProgress(1);
assert.deepEqual(readingSnapshot(), { context: "1", content: "1", landmark: "1", ordinary: "1" });
formingGraph.setReadingProgress(.45); assert.deepEqual(readingSnapshot(), readingAtFortyFive,
  "Reverse camera travel restores the exact previous reading channels");
formingGraph.setFormation(.5);
assert.deepEqual(readingSnapshot(), readingAtFortyFive, "Changing formation cannot run a second text clock");
formingGraph.setFormation(1);
formingGraph.reduced = true; formingGraph.setReadingProgress(.1);
assert.deepEqual(readingSnapshot(), { context: "1", content: "1", landmark: "1", ordinary: "1" });
formingGraph.reduced = false;
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
formingGraph.setPresentationScale(.99995);
formingGraph.setPresentationScale(1); assert.equal(formingGraph.body.dataset.projecting, "false");
assert.equal(formingGraph.presentationScale, 1, "The exact landing cannot be swallowed by the per-frame write tolerance");
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

// Exercise the real selection, flight and replay lifecycle. Only painting and
// element storage are inert: a deterministic, cancellable RAF queue owns time.
// In particular, resuming must not call play(), which would reset its cursor.
deferredFrames.clear();
function elementBoundary(dataset = {}) {
  const attributes = new Map(), classes = new Set();
  return {
    dataset, style: styleBoundary(), scrollTop: 0,
    setAttribute(key, value) { attributes.set(key, value); },
    removeAttribute(key) { attributes.delete(key); },
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, enabled) { const next = enabled ?? !classes.has(name); if (next) classes.add(name); else classes.delete(name); return next; },
    },
  };
}
const lifecycle = Object.create(ResearchProjection.prototype);
const lifecycleNodes = ["A", "B", "C"].map((id, stage) => ({ id, stage, lane: 0, phase: 0, title: id, date: "2000.01.01", status: "tested" }));
const lifecycleButtons = lifecycleNodes.map(node => elementBoundary({ node: node.id }));
const lifecycleEdges = lifecycleNodes.slice(1).map((node, i) => ({
  ...elementBoundary({ from: lifecycleNodes[i].id, to: node.id }), getTotalLength: () => 240,
}));
const lifecyclePanes = {
  ".research-contemporary .research-plane-scroll": { scrollTop: 650 },
  ".research-hindsight .research-plane-scroll": { scrollTop: 48 },
  ".research-evidence-scroll": { scrollTop: 62 },
};
const currentParts = { ".research-current-meta": {}, strong: {} };
const lifecycleElements = {
  ".research-map-hint": {}, ".projection-step": {},
  ".research-current-record": { querySelector: selector => currentParts[selector] },
  '[data-research="prev"]': {}, '[data-research="next"]': {},
};
Object.assign(lifecycle, {
  ordered: lifecycleNodes, selected: 1, route: [0, 1, 2],
  positions: new Map(lifecycleNodes.map((node, i) => [node.id, { x: 120 + 240 * i, y: 450 }])),
  x: 120, y: 86, scale: .72, velocity: { x: 0, y: 0, scale: 0 }, target: { x: 120, y: 86, scale: Math.log(.72) },
  focused: true, settled: true, reduced: false, dragged: false,
  playing: false, playPosition: 0, playFrame: 0, playLast: 0, elapsed: 0,
  flightFrame: 0, flightLast: 0, presentationSuspended: false, suspendedReplay: false,
  formation: 1, formationEdges: [], formationNodes: [], readingProgress: 1, presentationScale: 1, presentationDetail: 1,
  reading: new Map(), data: { layout: "evolution", edges: [], narrativePath: ["A", "B", "C"] },
  body: { dataset: {}, scrollTop: 96 }, stage: { clientWidth: 1200, clientHeight: 600 },
  host: { dataset: {}, querySelector: selector => lifecycleElements[selector], querySelectorAll: () => [] },
  nodes: lifecycleButtons, map: { querySelectorAll: () => lifecycleEdges },
  timeline: elementBoundary(), playButton: elementBoundary(),
  inspector: { ...elementBoundary({ nodeId: "B" }), querySelector: selector => lifecyclePanes[selector] },
  abort: { signal: { aborted: false } }, paintMap() {}, paintAssociations() {},
  paintInspector(node) {
    this.inspector.dataset.nodeId = node.id;
    Object.values(lifecyclePanes).forEach(pane => pane.scrollTop = 0);
  },
});
lifecycle.play();
for (let i = 0; i < 6; i++) advanceFrame(1000 + i * 1000 / 60);
assert.equal(lifecycle.selected, 1); assert.equal(lifecycle.playPosition, 1);
assert(lifecycle.flightFrame > 0 && !lifecycle.settled, "The fixture closes during an actual unfinished node flight");
const flightTarget = { ...lifecycle.target };
lifecycle.suspendPresentation();
assert.equal(lifecycle.presentationSuspended, true);
assert.deepEqual({ ...lifecycle.suspendedTarget }, flightTarget, "Close stores the original unfinished flight target");
assert.equal(lifecycle.getState().reading.B.record, 650, "Closing during transfer cannot replace saved reading with temporary zero");
const suspendedSnapshot = () => JSON.stringify({
  x: lifecycle.x, y: lifecycle.y, scale: lifecycle.scale, selected: lifecycle.selected,
  playPosition: lifecycle.playPosition, elapsed: lifecycle.elapsed, timeline: lifecycle.timeline.value,
  reading: lifecycle.getState().reading,
});
const duringClose = suspendedSnapshot();
assert.equal(deferredFrames.size, 0, "Close cancels both flight and replay frame requests");
lifecycle.suspendPresentation();
advanceFrame(100000);
lifecycle.playTick(100000); // Even a stale callback must respect suspension.
assert.equal(suspendedSnapshot(), duringClose, "Hidden replay cannot advance a node, camera, cursor or reading position");
const elapsedBeforeResume = lifecycle.elapsed;
lifecycle.resumePresentation();
assert.equal(lifecycle.presentationSuspended, false);
assert.equal(lifecycle.suspendedTarget, undefined);
assert.deepEqual({ ...lifecycle.target }, flightTarget, "Reopening restores the pending destination instead of refitting the graph");
assert.equal(lifecycle.selected, 1); assert.equal(lifecycle.playPosition, 1);
const queuedAfterResume = deferredFrames.size;
lifecycle.resumePresentation(); assert.equal(deferredFrames.size, queuedAfterResume, "Repeated resume cannot duplicate animation loops");
advanceFrame(100000);
assert.equal(lifecycle.elapsed, elapsedBeforeResume, "The hidden interval is excluded from the resumed replay clock");
assert.equal(lifecycle.selected, 1);
advanceFrame(100000 + 1000 / 60);
assert(lifecycle.elapsed > elapsedBeforeResume && lifecycle.elapsed - elapsedBeforeResume < .02);
for (let i = 2; i < 300 && !lifecycle.settled; i++) advanceFrame(100000 + i * 1000 / 60);
assert.equal(lifecycle.settled, true, "The resumed production spring reaches its original target");
assert.equal(lifecyclePanes[".research-contemporary .research-plane-scroll"].scrollTop, 650);
assert.equal(lifecyclePanes[".research-hindsight .research-plane-scroll"].scrollTop, 48);
assert.equal(lifecyclePanes[".research-evidence-scroll"].scrollTop, 62);
assert.equal(lifecycle.body.scrollTop, 96);
advanceFrame(110000); // Deliver the settled frame's deferred wire painting.

// Scroll offsets can be clamped by a layout change during outer withdrawal.
// Once suspended, getState must read the captured archive, not those transient
// offsets. This is a state-boundary check, not proof of browser scroll clamping.
lifecycle.suspendPresentation();
Object.values(lifecyclePanes).forEach(pane => pane.scrollTop = 0);
assert.equal(lifecycle.getState().reading.B.record, 650, "A closing snapshot preserves the reading captured before suspension");
lifecycle.pause();
lifecycle.resumePresentation();
assert.equal(lifecycle.playing, false, "An explicitly paused hidden replay is not restarted by reopen");
assert.equal(deferredFrames.size, 0, "Paused stable content schedules no hidden or resumed replay loop");

// A real focus reframe during withdrawal must supersede the destination that
// was measured before resize. Reopening cannot spring back to the old view.
lifecycle.restoreReadingPosition();
lifecycle.flyTo(-480, -80, 1.2);
advanceFrame(120000);
lifecycle.suspendPresentation();
const beforeResizeTarget = { ...lifecycle.suspendedTarget };
lifecycle.stage.clientWidth = 390; lifecycle.stage.clientHeight = 780;
lifecycle.focusCamera(false);
const reframedTarget = { ...lifecycle.target };
const reframedPose = [lifecycle.x, lifecycle.y, lifecycle.scale];
assert.notDeepEqual(reframedTarget, beforeResizeTarget, "A new viewport changes the actual focus destination");
assert.equal(lifecycle.suspendedTarget, undefined, "Synchronous reframe clears the obsolete suspended destination");
assert.equal(lifecycle.settled, true); assert.equal(lifecycle.flightFrame, 0);
assert.equal(lifecycle.getState().reading.B.record, 650);
lifecycle.resumePresentation();
assert.equal(lifecycle.flightFrame, 0, "Resume does not animate back to the pre-resize destination");
advanceFrame(121000);
assert.deepEqual([lifecycle.x, lifecycle.y, lifecycle.scale], reframedPose);
assert.deepEqual({ ...lifecycle.target }, reframedTarget);

// An animated destination requested while hidden is also updated, but only
// starts moving when the outer presentation has reopened.
lifecycle.flyTo(-600, -150, .9);
lifecycle.suspendPresentation();
const beforeQueuedReframe = [lifecycle.x, lifecycle.y, lifecycle.scale];
lifecycle.flyTo(240, 180, .65);
assert.deepEqual({ ...lifecycle.suspendedTarget }, { x: 240, y: 180, scale: Math.log(.65) });
assert.equal(lifecycle.flightFrame, 0); assert.equal(deferredFrames.size, 0);
advanceFrame(200000);
assert.deepEqual([lifecycle.x, lifecycle.y, lifecycle.scale], beforeQueuedReframe,
  "An updated hidden target cannot start a second flight behind the closing plate");
lifecycle.resumePresentation();
for (let i = 0; i < 300 && !lifecycle.settled; i++) advanceFrame(200000 + i * 1000 / 60);
assert.equal(lifecycle.settled, true);
assert.deepEqual([lifecycle.x, lifecycle.y], [240, 180]);
assert(Math.abs(lifecycle.scale - .65) < 1e-12);
assert.equal(lifecycle.selected, 1); assert.equal(lifecycle.getState().reading.B.record, 650);
advanceFrame(210000);
assert.equal(deferredFrames.size, 0);

console.log(JSON.stringify({
  passed: true, executed: new Date().toISOString(), node: process.version,
  scope: "Production state methods with inert UI/rendering effects; no browser layout or WebGL acceptance.",
  sourceDigest: sha256(JSON.stringify(sourceFiles)), sourceFiles,
  checks: {
    research: ["transfer snapshot protection", "synchronous reading restoration", "diagnostic read purity", "reversible measured-path exposure and bounded real-arc light", "complete and reduced-motion mask removal", "camera-owned reading channels independent of tree deposition", "reversible reading and reduced-motion restoration", "selective held labels and continuous restoration", "screen compensation leaves graph anchors unchanged", "mobile landmarks use complete visible bounds and refresh on resize", "suspended replay and flight cannot advance hidden state", "reopening preserves pending destination, replay cursor and elapsed time", "closing snapshots preserve captured reading", "explicit pause survives suspension and reopen", "synchronous viewport reframe supersedes suspended destination", "animated hidden reframe waits for reopen and retains the new target"],
    cube: ["normalized baseline", "free camera isolation", "geometry and face provenance", "observer provenance", "undo and redo provenance", "preset history isolation", "gesture grouping reset", "undoable file import", "invalid-load preservation", "contour before material", "reversible formation preserves experiment, camera, counting and history"],
  },
}, null, 2));
