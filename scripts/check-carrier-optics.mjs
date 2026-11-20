import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CarrierOptics } from "../src/carrier-optics.ts";
import { carrierFrame, carrierCue } from "../src/carrier-flight.ts";

// Execute the actual mask generator. Only the Canvas allocation/encoding
// boundary is inert: no substitute noise, deposit field or threshold formula
// is used. Encoded URLs stand for alpha-buffer hashes, not rendered PNGs.
const viewport = { width: 1280, height: 800 };
const box = { left: 40, top: 100, width: 1200, height: 660 };
const hash = value => createHash("sha256").update(value).digest("hex");
let canvases = [], contextSupported = true, renderContextSupported = false;
function drawingBoundary(canvas) {
  const finite = (...numbers) => numbers.forEach(value => assert(Number.isFinite(value), "Canvas geometry remains finite"));
  const stack = [];
  const context = {
    globalAlpha: 1, globalCompositeOperation: "source-over", clearCalls: 0, drawCalls: 0,
    setTransform: finite, moveTo: finite, lineTo: finite, translate: finite, rotate: finite, scale: finite,
    beginPath() {}, closePath() {}, fill() {}, stroke() {}, clip() {},
    save() { stack.push([this.globalAlpha, this.globalCompositeOperation]); },
    restore() { const state = stack.pop(); assert(state, "Balanced Canvas state stack"); [this.globalAlpha, this.globalCompositeOperation] = state; },
    clearRect(...values) { finite(...values); this.clearCalls++; },
    fillRect: finite,
    arc(x, y, radius, start, end) { finite(x, y, radius, start, end); assert(radius >= 0); },
    createLinearGradient(...values) { finite(...values); return { addColorStop: (offset) => assert(offset >= 0 && offset <= 1) }; },
    createRadialGradient(...values) { finite(...values); return { addColorStop: (offset) => assert(offset >= 0 && offset <= 1) }; },
    drawImage(source, ...values) { finite(...values); assert(source.pixels, "Volume upload precedes drawing"); this.drawCalls++; },
  };
  canvas.drawing = context; return context;
}
class CanvasBoundary {
  width = 0; height = 0; style = {}; removed = false; pixels; uploads = 0; allocations = 0; encodings = 0;
  setAttribute() {}
  getContext() {
    if (!contextSupported) return null;
    if (this.className === "carrier-optical-field") return renderContextSupported ? drawingBoundary(this) : null;
    return {
      createImageData: (width, height) => { this.allocations++; return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
      putImageData: pixels => { this.uploads++; this.pixels = new Uint8ClampedArray(pixels.data); },
    };
  }
  toDataURL(mime) {
    assert.equal(mime, "image/png");
    this.encodings++;
    return "data:image/png;base64," + Buffer.from(hash(this.pixels)).toString("base64");
  }
  remove() { this.removed = true; }
}
globalThis.document = { createElement: name => {
  assert.equal(name, "canvas");
  const canvas = new CanvasBoundary();
  canvases.push(canvas); return canvas;
} };
globalThis.window = { devicePixelRatio: 1 };
const container = { append: () => {} };
const input = (progress, extra = {}) => ({ frame: carrierFrame(progress, viewport, box), origin: { x: 280, y: 430 },
  edge: [{ x: 260, y: 430 }, { x: 300, y: 430 }], width: viewport.width, height: viewport.height,
  planeWidth: box.width, planeHeight: box.height, elapsed: 1000, dark: false, reduced: false, ...extra });
const alpha = pixels => pixels.filter((_, index) => index % 4 === 3);
const optics = new CarrierOptics(container);
const maskCanvas = canvases[1];

const initial = optics.render(input(0));
assert.notEqual(initial.maskImage, "none", "Before ignition the real DOM image is masked out");
assert.equal(initial.active, false);
assert.equal(optics.getStats().generatedMasks, 0);

let previous, monotoneSamples = 0, mixedSpatialFrame = false;
const coverage = [];
for (const progress of [2000, 2200, 2400, 2600, 2800].map(carrierCue)) {
  const result = optics.render(input(progress));
  assert.notEqual(result.maskImage, "none");
  const current = alpha(maskCanvas.pixels);
  if (previous) {
    assert.equal(current.length, previous.length);
    for (let i = 0; i < current.length; i++) assert(current[i] >= previous[i], "No pixel disappears during forward deposition");
  }
  previous = current; monotoneSamples++;
  mixedSpatialFrame ||= current.some(value => value === 255) && current.some(value => value === 0);
  coverage.push(current.reduce((sum, a) => sum + a, 0) / (255 * current.length));
}
for (let i = 1; i < coverage.length; i++) assert(coverage[i] > coverage[i - 1], "Deposition advances through the plate rather than fading a complete image");
assert(mixedSpatialFrame, "The forming plate contains both resolved and unresolved regions");

const repeatedInput = input(carrierCue(2450));
const first = optics.render(repeatedInput).maskImage;
const firstPixels = hash(maskCanvas.pixels), count = optics.getStats().generatedMasks;
assert.equal(optics.render(input(carrierCue(2450), { elapsed: 999999, dark: true })).maskImage, first, "The same phase has no time-seeded or theme-seeded deposit");
assert.equal(optics.getStats().generatedMasks, count, "An identical phase reuses the bounded mask cache");
for (let ms = 1850; ms < 2980; ms += 10) optics.render(input(carrierCue(ms)));
assert(optics.getStats().maskCacheEntries <= 24, "The mask cache is bounded during continuous playback");
assert.equal(optics.render(repeatedInput).maskImage, first, "Revisiting a phase after cache eviction gives the exact same mask");
assert.equal(hash(maskCanvas.pixels), firstPixels, "Reverse travel cannot create a different grain field");

const second = new CarrierOptics(container);
assert.equal(second.render(repeatedInput).maskImage, first, "Fresh opening uses the same deterministic optical field");
const size = optics.getStats().maskSize;
assert(size[0] <= 512 && size[1] <= 384, "The serialized mask is bounded independently of the full viewport");
const beforeStable = optics.getStats().generatedMasks;
const stable = optics.render(input(1));
assert.equal(stable.maskImage, "none"); assert.equal(stable.clarity, 1); assert.equal(stable.active, false);
const reduced = optics.render(input(carrierCue(2400), { reduced: true }));
assert.equal(reduced.maskImage, "none"); assert.equal(reduced.clarity, 1); assert.equal(reduced.active, false);
assert.equal(optics.getStats().generatedMasks, beforeStable, "Stable and reduced-motion frames generate no new mask bitmap");

contextSupported = false;
const fallback = new CarrierOptics(container);
assert.match(fallback.render(input(carrierCue(2400))).maskImage, /^linear-gradient\(/, "Missing Canvas retains a soft-front semantic-content fallback");
assert.equal(fallback.render(input(1)).maskImage, "none");
fallback.dispose();
optics.dispose(); second.dispose();
assert.equal(optics.getStats().maskCacheEntries, 0); assert.equal(optics.getStats().active, false);
assert.equal(canvases[0].removed, true); assert.equal(canvases[0].width, 0); assert.equal(maskCanvas.width, 0);

// Exercise the real continuous-volume buffer and its invalidation path with
// inert drawing calls. This checks resource/state behavior, not raster output.
contextSupported = true; renderContextSupported = true;
const volume = new CarrierOptics(container);
const volumeMain = volume.canvas, volumeMask = volume.maskCanvas, volumeBeam = volume.beamCanvas;
volume.render(input(carrierCue(2400)));
assert(volumeBeam.pixels && volumeBeam.uploads === 1);
assert(volumeBeam.width <= 480 && volumeBeam.height <= 256);
assert.equal(volumeBeam.encodings, 0, "The continuous volume is never encoded as a PNG URL");
const beamPixels = hash(volumeBeam.pixels), beamUploads = volumeBeam.uploads, beamAllocations = volumeBeam.allocations;
volume.render(input(carrierCue(2400), { elapsed: 6500 }));
assert.equal(volumeBeam.uploads, beamUploads, "An unchanged geometric field reuses the volume texture");
assert.equal(volumeBeam.allocations, beamAllocations);
volume.render(input(carrierCue(2400))); volume.render(input(carrierCue(2400)));
assert.equal(volumeBeam.uploads, beamUploads, "A paused complete frame does not rebuild identical volume geometry");
volume.render(input(carrierCue(2400), { dark: true }));
assert.equal(volumeBeam.uploads, beamUploads + 1, "A theme change invalidates the volume colors");
assert.notEqual(hash(volumeBeam.pixels), beamPixels);
volume.render(input(carrierCue(2400)));
assert.equal(hash(volumeBeam.pixels), beamPixels, "Returning to the original theme restores the same field");

const resizeCases = [];
window.devicePixelRatio = 3;
for (const [width, height] of [[390, 780], [2560, 1440], [7680, 4320]]) {
  const screen = { width, height }, plate = { left: 20, top: 100, width: width - 40, height: height - 140 };
  volume.render(input(carrierCue(2400), { width, height, planeWidth: plate.width, planeHeight: plate.height,
    frame: carrierFrame(carrierCue(2400), screen, plate), origin: { x: width * .25, y: height * .60 },
    edge: [{ x: width * .25 - 20, y: height * .60 }, { x: width * .25 + 20, y: height * .60 }] }));
  const stats = volume.getStats();
  assert(stats.canvasSize[0] * stats.canvasSize[1] <= 2400000 + width + height, "High-DPR output remains within the 2.4M-pixel budget plus integer rounding");
  assert(volumeBeam.width <= 480 && volumeBeam.height <= 256);
  assert(stats.maskSize[0] <= 512 && stats.maskSize[1] <= 384);
  resizeCases.push({ viewport: [width, height], canvas: stats.canvasSize, beam: [volumeBeam.width, volumeBeam.height], mask: stats.maskSize });
}
const clearsBeforeReduced = volumeMain.drawing.clearCalls, drawsBeforeReduced = volumeMain.drawing.drawCalls;
volume.render(input(carrierCue(2400), { reduced: true, dark: true }));
assert.equal(volume.getStats().active, false); assert.equal(volumeMain.style.visibility, "hidden");
assert.equal(volumeMain.drawing.clearCalls, clearsBeforeReduced + 1, "Reduced motion clears the last visible optical frame");
assert.equal(volumeMain.drawing.drawCalls, drawsBeforeReduced, "Reduced motion does not redraw a hidden light field");
volume.render(input(1, { dark: false }));
assert.equal(volumeMain.drawing.clearCalls, clearsBeforeReduced + 1, "Repeated inactive frames do no redundant clearing");
volume.render(input(carrierCue(2400), { dark: true }));
assert.equal(volume.getStats().active, true); assert.equal(volumeMain.style.visibility, "visible");
assert.equal(volumeMain.drawing.globalAlpha, 1, "Optical drawing does not leak an alpha multiplier to the next frame");
volume.dispose();
for (const canvas of [volumeMain, volumeMask, volumeBeam]) assert.equal(canvas.width + canvas.height, 0, "All optical surfaces are released on close");
assert.equal(volume.beamPixels, undefined); assert.equal(volume.beamIdentity, "");

console.log(JSON.stringify({ passed: true,
  scope: "Actual production alpha/volume buffers, cache and lifecycle with inert Canvas boundaries; no Canvas rasterization, encoded PNG, browser layout, WebGL or full-scene acceptance.",
  monotoneSamples, coverage: coverage.map(value => Number(value.toFixed(6))), deterministicMaskSha256: firstPixels,
  maskSize: size, resizeCases, checks: ["transparent initial frame", "monotone spatial deposition", "same-phase determinism", "cache eviction and reverse revisits", "fresh-open determinism", "bounded bitmap/cache", "stable and reduced-motion bypass", "missing-context fallback", "identical-frame volume cache", "theme invalidation", "high-DPR resize bounds", "inactive-frame clearing", "all-surface resource release"] }, null, 2));
