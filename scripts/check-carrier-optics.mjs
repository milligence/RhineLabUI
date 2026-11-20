import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CarrierOptics } from "../src/carrier-optics.ts";
import { carrierFrame, carrierCue } from "../src/carrier-flight.ts";

// Execute production optics with inert drawing boundaries. This covers depth
// ownership, receiver exclusion, native masks and lifecycle, not rasterization.
const viewport = { width: 1280, height: 800 }, box = { left: 40, top: 100, width: 1200, height: 660 };
const hash = value => createHash("sha256").update(value).digest("hex");
let contextSupported = true;
function drawingBoundary(canvas) {
  const finite = (...numbers) => numbers.forEach(value => assert(Number.isFinite(value)));
  const stack = [];
  const context = {
    globalAlpha: 1, globalCompositeOperation: "source-over", clearCalls: 0, drawCalls: 0,
    setTransform: finite, moveTo: finite, lineTo: finite, translate: finite, rotate: finite, scale: finite,
    beginPath() {}, closePath() {}, fill() {}, stroke() {}, clip() {},
    save() { stack.push([this.globalAlpha, this.globalCompositeOperation]); },
    restore() { const state = stack.pop(); assert(state); [this.globalAlpha, this.globalCompositeOperation] = state; },
    clearRect(...values) { finite(...values); this.clearCalls++; }, fillRect: finite,
    arc(x, y, radius, start, end) { finite(x, y, radius, start, end); assert(radius >= 0); },
    createLinearGradient(...values) { finite(...values); return { addColorStop: offset => assert(offset >= 0 && offset <= 1) }; },
    createRadialGradient(...values) { finite(...values); return { addColorStop: offset => assert(offset >= 0 && offset <= 1) }; },
    drawImage(source, ...values) { finite(...values); assert(source.pixels); this.drawCalls++; },
  };
  canvas.drawing = context; return context;
}
class CanvasBoundary {
  width = 0; height = 0; style = {}; removed = false; pixels; uploads = 0; allocations = 0;
  setAttribute() {}
  getContext() {
    if (!contextSupported) return null;
    if (this.className === "carrier-optical-field") return drawingBoundary(this);
    return {
      createImageData: (width, height) => { this.allocations++; return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
      putImageData: pixels => { this.uploads++; this.pixels = new Uint8ClampedArray(pixels.data); },
    };
  }
  toDataURL() { throw new Error("Optical formation must never encode a synchronous bitmap"); }
  remove() { this.removed = true; }
}
globalThis.document = { createElement: name => { assert.equal(name, "canvas"); return new CanvasBoundary(); } };
globalThis.window = { devicePixelRatio: 1 };
const container = { append() {} };
const input = (progress, extra = {}) => ({ frame: carrierFrame(progress, viewport, box), origin: { x: 280, y: 430 },
  edge: [{ x: 260, y: 430 }, { x: 300, y: 430 }], width: viewport.width, height: viewport.height,
  planeWidth: box.width, planeHeight: box.height, elapsed: 1000, dark: false, reduced: false, ...extra });

const optics = new CarrierOptics(container);
const initial = optics.render(input(0));
assert.equal(initial.maskImage, "linear-gradient(transparent,transparent)"); assert.equal(initial.active, false);
const fronts = [];
for (const ms of [2100, 2400, 2750, 3100, 3400]) {
  const match = optics.render(input(carrierCue(ms))).maskImage.match(/^linear-gradient\(115deg,#000 ([-\d.]+)%,transparent ([-\d.]+)%\)$/);
  assert(match, "Legacy content uses a native finite front, not an encoded image");
  fronts.push(Number(match[1])); assert(Math.abs(Number(match[2]) - Number(match[1]) - 3) < 1e-5);
}
for (let i = 1; i < fronts.length; i++) assert(fronts[i] > fronts[i - 1]);
const repeated = input(carrierCue(2750)), first = optics.render(repeated).maskImage;
optics.render(input(1));
assert.equal(optics.render(input(carrierCue(2750), { elapsed: 999999, dark: true })).maskImage, first);
const second = new CarrierOptics(container);
assert.equal(second.render(repeated).maskImage, first, "Fresh and reverse phases use the same front");
assert.equal(optics.render({ ...repeated, structuredFormation: true }).maskImage, "none", "Graph and material formation bypass the whole-page wipe");
assert.equal(optics.getStats().generatedMasks, 0); assert.deepEqual(optics.getStats().maskSize, [0, 0]);
const stable = optics.render(input(1)); assert.equal(stable.maskImage, "none"); assert.equal(stable.clarity, 1); assert.equal(stable.active, false);
const reduced = optics.render({ ...repeated, reduced: true });
assert.equal(reduced.maskImage, "none"); assert.equal(reduced.clarity, 1); assert.equal(reduced.active, false);

const physical = new CarrierOptics(container);
let volumeCalls = 0, apertureCalls = 0;
const actualVolume = physical.volume.bind(physical), actualAperture = physical.aperture.bind(physical);
physical.volume = (...args) => { volumeCalls++; return actualVolume(...args); };
physical.aperture = (...args) => { apertureCalls++; return actualAperture(...args); };
physical.render({ ...repeated, physicalSource: true, sceneBeam: true, structuredFormation: true });
assert.equal(volumeCalls, 0); assert.equal(apertureCalls, 0);
assert.equal(physical.beamCanvas.allocations, 0, "Scene-owned frustum allocates no second optical texture");
physical.render({ ...repeated, physicalSource: true, sceneBeam: false }); assert.equal(volumeCalls, 1); assert.equal(apertureCalls, 0);
physical.render({ ...repeated, physicalSource: false, sceneBeam: true }); assert.equal(volumeCalls, 1); assert.equal(apertureCalls, 1);

// The actual fallback buffer must contain zero light over the receiver even
// when its enclosing convex frustum covers the entire receiving quadrilateral.
const volume = new CarrierOptics(container);
const aperture = [{ x: 150, y: 345 }, { x: 190, y: 345 }, { x: 190, y: 357 }, { x: 150, y: 357 }];
const receiver = [{ x: 500, y: 100 }, { x: 1000, y: 100 }, { x: 1000, y: 650 }, { x: 500, y: 650 }];
const frame = { ...carrierFrame(carrierCue(2750), viewport, box), corners: receiver, beamReach: 1 };
const volumeInput = { ...repeated, frame, aperture, physicalSource: true, structuredFormation: true };
volume.render(volumeInput);
const beam = volume.beamCanvas;
assert(beam.pixels && beam.uploads === 1); assert(beam.width <= 480 && beam.height <= 256);
let receiverPixels = 0, visibleConnectorPixels = 0;
for (let y = 0; y < beam.height; y++) for (let x = 0; x < beam.width; x++) {
  const sx = 146 + (x + .5) / beam.width * 858, sy = 96 + (y + .5) / beam.height * 558;
  const alpha = beam.pixels[(y * beam.width + x) * 4 + 3];
  if (sx > 500 && sx < 1000 && sy > 100 && sy < 650) { receiverPixels++; assert.equal(alpha, 0, "Fallback light cannot fog receiver pixels"); }
  if (sx > 210 && sx < 450 && alpha > 0) visibleConnectorPixels++;
}
assert(receiverPixels > 10000 && visibleConnectorPixels > 1000);
const originalBeam = hash(beam.pixels), uploads = beam.uploads, allocations = beam.allocations;
volume.render({ ...volumeInput, elapsed: 99999, outline: [{ x: 0, y: 0 }, { x: 1280, y: 0 }, { x: 1280, y: 800 }, { x: 0, y: 800 }] });
assert.equal(beam.uploads, uploads); assert.equal(beam.allocations, allocations);
assert.equal(hash(beam.pixels), originalBeam, "A 2D silhouette cannot punch a false depth hole in light");
volume.render({ ...volumeInput, dark: true }); assert.equal(beam.uploads, uploads + 1); assert.notEqual(hash(beam.pixels), originalBeam);
volume.render(volumeInput); assert.equal(hash(beam.pixels), originalBeam);

const resizeCases = [];
window.devicePixelRatio = 3;
for (const [width, height] of [[390, 780], [2560, 1440], [7680, 4320]]) {
  const screen = { width, height }, plate = { left: 20, top: 100, width: width - 40, height: height - 140 };
  volume.render(input(carrierCue(2750), { width, height, planeWidth: plate.width, planeHeight: plate.height,
    frame: carrierFrame(carrierCue(2750), screen, plate), origin: { x: width * .25, y: height * .60 },
    edge: [{ x: width * .25 - 20, y: height * .60 }, { x: width * .25 + 20, y: height * .60 }] }));
  const stats = volume.getStats(); assert(stats.canvasSize[0] * stats.canvasSize[1] <= 2400000 + width + height);
  assert(beam.width <= 480 && beam.height <= 256);
  resizeCases.push({ viewport: [width, height], canvas: stats.canvasSize, beam: [beam.width, beam.height] });
}
const clears = volume.canvas.drawing.clearCalls, draws = volume.canvas.drawing.drawCalls;
volume.render({ ...repeated, reduced: true });
assert.equal(volume.canvas.drawing.clearCalls, clears + 1); assert.equal(volume.canvas.drawing.drawCalls, draws);
assert.equal(volume.canvas.style.visibility, "hidden"); volume.render(input(1)); assert.equal(volume.canvas.drawing.clearCalls, clears + 1);
contextSupported = false;
const unavailable = new CarrierOptics(container);
assert.match(unavailable.render(repeated).maskImage, /^linear-gradient\(/);
assert.equal(unavailable.render({ ...repeated, structuredFormation: true }).maskImage, "none");
for (const instance of [optics, second, physical, volume, unavailable]) {
  instance.dispose(); assert.equal(instance.canvas.removed, true); assert.equal(instance.canvas.width + instance.canvas.height, 0);
  assert.equal(instance.beamCanvas.width + instance.beamCanvas.height, 0); assert.equal(instance.beamPixels, undefined); assert.equal(instance.getStats().active, false);
}
console.log(JSON.stringify({ passed: true,
  scope: "Actual native mask output, fallback alpha buffer and lifecycle with inert Canvas boundaries; no browser compositing, WebGL or full-scene acceptance.",
  nativeFronts: fronts, receiverPixels, visibleConnectorPixels, resizeCases,
  checks: ["no synchronous bitmap encoding", "monotone reversible native fallback", "semantic formation bypass", "independent physical-source and scene-beam ownership", "zero light over receiver pixels", "no silhouette hole", "cached fallback geometry", "theme invalidation", "DPR budget", "reduced-motion clearing", "all surfaces released"] }, null, 2));
