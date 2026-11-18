import assert from "node:assert/strict";
import {
  baselineSelectionWave,
  flowingSelectionWave,
  limitSelectionWave,
  prepareSelectionPulses,
  flowingSelectionField,
  queueSelectionPulse,
  SELECTION_WAVE_LIFETIME,
} from "../src/motion.ts";

const epsilon = 1e-7;
const field = (pulses, row, lane, time) =>
  limitSelectionWave(pulses.reduce((height, pulse) => height + flowingSelectionWave(
    Math.hypot(row - pulse.row, (lane - pulse.lane) * 2.2),
    time - pulse.time,
  ), 0));
const positions = Array.from({ length: 225 }, (_, i) => ({
  row: -8 + (i % 45),
  lane: Math.floor(i / 45),
}));

// The seventh input previously discarded a live wave. Verify actual field
// position and velocity at each insertion, including rapid direction changes.
const pulses = [];
let maximumEventJump = 0, maximumVelocitySeam = 0;
for (let i = 0; i < 24; i++) {
  const time = i * 0.08;
  const cell = { lane: 2, row: 12 + (i < 12 ? i : 24 - i) };
  const before = pulses.map(pulse => ({ ...pulse }));
  queueSelectionPulse(pulses, cell, time);
  for (const { row, lane } of positions) {
    const at = field(before, row, lane, time);
    const next = field(pulses, row, lane, time);
    const jump = Math.abs(at - next);
    const enteringVelocity = (at - field(before, row, lane, time - epsilon)) / epsilon;
    const leavingVelocity = (field(pulses, row, lane, time + epsilon) - next) / epsilon;
    maximumEventJump = Math.max(maximumEventJump, jump);
    maximumVelocitySeam = Math.max(maximumVelocitySeam, Math.abs(leavingVelocity - enteringVelocity));
    assert.ok(jump < 1e-12, "New selection cannot remove a living wave");
    assert.ok(Math.abs(leavingVelocity - enteringVelocity) < 0.001, "Reversal preserves wave velocity");
  }
}
assert.equal(pulses.length, 24, "Fast navigation retains more than six living waves");

// Pin the real regression: deleting the oldest pulse produces a visible jump.
const legacy = Array.from({ length: 6 }, (_, i) => ({ row: 12 + i, time: i * 0.08 }));
const clamp = value => Math.max(-0.6, Math.min(0.6, value));
const legacyField = list => clamp(list.reduce((sum, pulse) => sum + baselineSelectionWave(
  Math.abs(8.125 - pulse.row), 0.48 - pulse.time,
), 0));
const previousJump = Math.abs(legacyField(legacy) - legacyField(legacy.slice(1)));
assert.ok(previousJump > 0.45, "Fixture exercises the old six-wave discontinuity");

// A whole drag segment may visit many cells in one frame; its source is still
// at rest and can move to the latest cell without touching any older wave.
const beforeBurst = pulses.map(pulse => ({ ...pulse }));
for (let row = 0; row < 64; row++) queueSelectionPulse(pulses, { row, lane: 3 }, 1.84);
assert.equal(pulses.length, beforeBurst.length);
assert.deepEqual(pulses.at(-1), { row: 63, lane: 3, time: 1.84 });
for (const { row, lane } of positions) {
  assert.equal(field(pulses, row, lane, 1.84), field(beforeBurst, row, lane, 1.84));
}
const count = pulses.length;
queueSelectionPulse(pulses, { row: -99, lane: 1 }, 1.85);
assert.equal(pulses.length, count, "Sub-50ms input skips only the unborn pulse");

// Expiry is already at zero with zero velocity, including cards near the
// travelling crest where the old function still had nonzero height at 3.2s.
let maximumExpiryHeight = 0, maximumExpiryVelocity = 0;
for (let distance = 0; distance <= 40; distance += 0.125) {
  const end = flowingSelectionWave(distance, SELECTION_WAVE_LIFETIME);
  const before = flowingSelectionWave(distance, SELECTION_WAVE_LIFETIME - epsilon);
  maximumExpiryHeight = Math.max(maximumExpiryHeight, Math.abs(before));
  maximumExpiryVelocity = Math.max(maximumExpiryVelocity, Math.abs((end - before) / epsilon));
  assert.equal(Math.abs(end), 0);
  assert.ok(Math.abs(before) < 1e-12);
  assert.ok(Math.abs((end - before) / epsilon) < 1e-6);
}
assert.ok(baselineSelectionWave(25.6, 3.2) > 0.02, "Historical timing remains untouched");
assert.ok(flowingSelectionWave(0, 0.6) < -0.01, "Signed negative trough is preserved");
for (let distance = 0; distance <= 32; distance += 0.5) {
  for (let age = 0; age < 2.6; age += 0.1) {
    assert.equal(flowingSelectionWave(distance, age), baselineSelectionWave(distance, age));
  }
}

// The soft knee is identity through normal travel and has continuous first
// and second derivatives at both shoulders, while never exceeding the bound.
for (let i = -1000; i <= 1000; i++) {
  const value = i / 100;
  const limited = limitSelectionWave(value);
  assert.ok(Math.abs(limited) <= 0.6);
  assert.equal(limited + limitSelectionWave(-value), 0);
  if (Math.abs(value) <= 0.5) assert.equal(limited, value);
  if (i > -1000) assert.ok(limited >= limitSelectionWave(value - 0.01));
}
for (const shoulder of [-0.5, 0.5]) {
  const h = 1e-5;
  const a = limitSelectionWave(shoulder - h), b = limitSelectionWave(shoulder), c = limitSelectionWave(shoulder + h);
  assert.ok(Math.abs((c - a) / (2 * h) - 1) < 1e-7);
  assert.ok(Math.abs((c - 2 * b + a) / (h * h)) < 0.001);
}

// Lifetime + cadence, not hard eviction, bound even a 1 kHz event stream.
let busy = [], maximumHistory = 0;
for (let millisecond = 0; millisecond < 10000; millisecond++) {
  const time = millisecond / 1000;
  busy = busy.filter(pulse => time - pulse.time < SELECTION_WAVE_LIFETIME);
  queueSelectionPulse(busy, { row: millisecond, lane: 2 }, time);
  maximumHistory = Math.max(maximumHistory, busy.length);
}
assert.ok(maximumHistory <= 65);

// Long-loop rebasing translates live sources and sample coordinates together;
// neither pulse age nor its contribution to the visible curve may change.
const shifted = pulses.map(pulse => ({ ...pulse, row: pulse.row - 3200, lane: pulse.lane + 2500 }));
for (const { row, lane } of positions) {
  assert.equal(field(pulses, row, lane, 2.2), field(shifted, row - 3200, lane + 2500, 2.2));
}

// Precomputing the shared time envelope is an evaluation optimization only.
// Cover zero-age bursts, expiry, reversals, distant cards and rebased sources.
let maximumPreparedDifference = 0;
for (const time of [0, 0.08, 0.88, 1.84, 2.2, 3.2, 4.8, 5.2]) {
  for (const list of [pulses, shifted]) {
    const prepared = prepareSelectionPulses(list, time);
    for (const { row, lane } of positions) {
      const expected = field(list, row, lane, time);
      const actual = flowingSelectionField(prepared, row, lane);
      maximumPreparedDifference = Math.max(maximumPreparedDifference, Math.abs(expected - actual));
      assert.ok(Math.abs(expected - actual) < 1e-12, "Prepared field preserves the exact motion shape");
    }
  }
}

console.log(JSON.stringify({
  checks: "passed",
  previousJump,
  maximumEventJump,
  maximumVelocitySeam,
  maximumExpiryHeight,
  maximumExpiryVelocity,
  maximumHistory,
  maximumPreparedDifference,
}, null, 2));
