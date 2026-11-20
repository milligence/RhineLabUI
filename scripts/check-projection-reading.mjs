// Exercise the production optical/readability clocks without DOM or rendering.
// This verifies reversible staging and endpoint continuity, not visual quality.
import assert from "node:assert/strict";
import {
  CarrierFlight, CARRIER_ENTRANCE_MS, CARRIER_RETURN_MS,
  carrierCameraProgress, carrierChannels, carrierCue, carrierFrame,
  carrierReadingChannels,
} from "../src/carrier-flight.ts";

const close = (actual, expected, message, epsilon = 1e-10) =>
  assert(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} / ${expected}`);
const keys = ["identity", "landmarks", "names", "context", "reading"];
const zero = Object.fromEntries(keys.map(key => [key, 0]));
const one = Object.fromEntries(keys.map(key => [key, 1]));
const viewport = { width: 1440, height: 960 };
const box = { left: 46, top: 98, width: 1348, height: 824 };

assert.equal(CARRIER_ENTRANCE_MS, 6800);
assert.equal(CARRIER_RETURN_MS, 2400);
assert.equal(carrierCameraProgress(carrierCue(4200)), 0);
assert.equal(carrierCameraProgress(1), 1);

// The receiving plane is stable before the first root arrives. Its envelope
// cannot turn a locally gradual graph exposure into a whole-image flash.
assert.equal(carrierChannels(carrierCue(1650)).image, 0);
assert.equal(carrierChannels(carrierCue(1780)).image, 1);
assert.equal(carrierChannels(carrierCue(1815)).image, 1);
assert.equal(carrierChannels(carrierCue(1700)).contentResolve, 0);
assert.equal(carrierChannels(carrierCue(4000)).contentResolve, 1);
for (let time = 1700; time <= 4000; time += 50) {
  close(carrierChannels(carrierCue(time)).contentResolve, (time - 1700) / 2300,
    "The full 2300 ms formation interval keeps a linear clock");
}
for (let time = 0; time <= 4200; time += 25) {
  const camera = carrierCameraProgress(carrierCue(time));
  assert.deepEqual(carrierReadingChannels(camera), zero,
    `No typography may enter the held projection at ${time} ms`);
}

// Typography follows the camera that was actually drawn, even if the requested
// presentation phase has already advanced to the reading position.
const delayed = carrierFrame(carrierCue(6600), viewport, box,
  { perspective: 12, phase: carrierCue(4100), progress: 0 });
assert.deepEqual(carrierReadingChannels(delayed.camera), zero);
assert.equal(delayed.contentResolve, 1, "The held tree can be complete while text is absent");

// All channels remain bounded and monotonic, with separate arrival order.
let previous = zero;
for (let i = 0; i <= 10000; i++) {
  const current = carrierReadingChannels(i / 10000);
  for (const key of keys) {
    assert(current[key] >= 0 && current[key] <= 1, `${key} remains bounded`);
    assert(current[key] >= previous[key] - 1e-12, `${key} advances monotonically`);
  }
  previous = current;
}
assert(carrierReadingChannels(.30).landmarks > 0);
assert.equal(carrierReadingChannels(.30).identity, 0);
assert.equal(carrierReadingChannels(.55).context, 0);
assert.equal(carrierReadingChannels(.55).reading, 0);

// Every local envelope joins its constant endpoints with zero velocity and
// acceleration. One-sided finite differences check the production function.
const ranges = {
  identity: [.36, .82], landmarks: [.10, .48], names: [.40, .88],
  context: [.62, .94], reading: [.58, .95],
};
for (const [key, [start, end]] of Object.entries(ranges)) {
  const sample = x => carrierReadingChannels(x)[key];
  assert.equal(sample(start), 0, `${key} starts at exact zero`);
  assert.equal(sample(end), 1, `${key} ends at exact one`);
  assert.equal(sample(start - .001), 0);
  assert.equal(sample(end + .001), 1);
  const h = (end - start) * 1e-4;
  assert(Math.abs((sample(start + h) - sample(start)) / h) < 1e-5,
    `${key} starts with zero velocity`);
  assert(Math.abs((sample(end) - sample(end - h)) / h) < 1e-5,
    `${key} ends with zero velocity`);
  assert(Math.abs((sample(start + 2 * h) - 2 * sample(start + h) + sample(start)) / (h * h)) < .07,
    `${key} starts with zero acceleration`);
  assert(Math.abs((sample(end) - 2 * sample(end - h) + sample(end - 2 * h)) / (h * h)) < .07,
    `${key} ends with zero acceleration`);
}

// A completed approach has reached all text endpoints before a terminal state
// switch can remove presentation-only CSS. Clamping is exact outside the range.
for (const camera of [.95, .99, 1, 2, Infinity])
  assert.deepEqual(carrierReadingChannels(camera), one);
for (const camera of [-Infinity, -1, 0])
  assert.deepEqual(carrierReadingChannels(camera), zero);

// Closing and reopening reuse current phase, velocity and acceleration. The
// same camera phase yields byte-identical channel values in either direction.
const checkpoints = [0, .10, .18, .36, .48, .55, .62, .75, .88, .94, .95, 1];
const forward = new Map(checkpoints.map(camera => [camera, carrierReadingChannels(camera)]));
for (const camera of [...checkpoints].reverse())
  assert.deepEqual(carrierReadingChannels(camera), forward.get(camera));

let reversalCases = 0;
for (const closeAt of [1820, 2750, 4100, 5100, 5900, 6550, 6800]) {
  for (const reopenAfter of [0, 40, 250, 650]) {
    const flight = new CarrierFlight();
    flight.startPresentation(0);
    flight.step(closeAt);
    const beforeClose = carrierReadingChannels(carrierCameraProgress(flight.value));
    flight.move(0, closeAt, Math.max(850, flight.value * CARRIER_RETURN_MS));
    assert.deepEqual(carrierReadingChannels(carrierCameraProgress(flight.value)), beforeClose,
      "Closing cannot reset the displayed exposure");
    const reopenAt = closeAt + reopenAfter;
    flight.step(reopenAt);
    const beforeReopen = carrierReadingChannels(carrierCameraProgress(flight.value));
    flight.move(1, reopenAt, Math.max(900, (1 - flight.value) * CARRIER_ENTRANCE_MS));
    assert.deepEqual(carrierReadingChannels(carrierCameraProgress(flight.value)), beforeReopen,
      "Reopening cannot reset the displayed exposure");
    for (let time = reopenAt; time <= reopenAt + CARRIER_ENTRANCE_MS + 1000; time += 13) {
      const camera = carrierCameraProgress(flight.step(time));
      for (const value of Object.values(carrierReadingChannels(camera)))
        assert(Number.isFinite(value) && value >= 0 && value <= 1);
    }
    assert.deepEqual(carrierReadingChannels(carrierCameraProgress(flight.value)), one);
    reversalCases++;
  }
}

console.log(JSON.stringify({
  passed: true,
  scope: "Production pure functions and CarrierFlight; no DOM, CSS, WebGL or visual acceptance.",
  formationMs: [1700, 4000], imageMs: [1650, 1780],
  approachStartMs: 4200, entranceMs: CARRIER_ENTRANCE_MS, returnMs: CARRIER_RETURN_MS,
  channels: ranges, reversalCases,
  checks: ["held structure without typography", "drawn-camera ownership", "linear formation clock",
    "bounded monotonic channels", "exact endpoints", "C2 joins", "reversible exposure",
    "close/reopen continuity", "all text resolved before terminal state"],
}, null, 2));
