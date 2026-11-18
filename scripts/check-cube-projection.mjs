import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "three";
import { CubeArcball, arcballPoint } from "../src/cube-rotation.ts";
import { cubeCoordinates, cubeEyeOccupancy, cubeIndex, defaultCubeExperiment, parseCubeExperiment } from "../src/cube-projection.ts";

const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
const quaternionClose = (a, b, tolerance = 1e-7) => assert.ok(a.angleTo(b) < tolerance, `Quaternion distance ${a.angleTo(b)}`);

// Repeated vertical sweeps can continue past both poles; no world-up switch or
// latitude clamp may interrupt one user's continuous direction of rotation.
const free = new CubeArcball();
let clock = 0, accumulated = 0, minimumY = 1, maximumY = -1;
for (let stroke = 0; stroke < 8; stroke++) {
  free.begin(250, 390, 500, 500, clock);
  for (let y = 380; y >= 110; y -= 10) {
    const previous = free.orientation.clone(); free.move(250, y, clock += 8);
    close(free.orientation.length(), 1);
    const increment = free.orientation.angleTo(previous);
    assert.ok(increment < .07 && increment > .02, "No pole jump or clamp within a drag");
    accumulated += increment;
    const up = new Vector3(0, 1, 0).applyQuaternion(free.orientation).y;
    minimumY = Math.min(minimumY, up); maximumY = Math.max(maximumY, up);
  }
  free.end(clock, true); clock += 20;
}
assert.ok(accumulated > Math.PI * 2, "Rotation continues through a complete revolution");
assert.ok(minimumY < -.99 && maximumY > .99, "Upside-down and upright poses remain accessible");
assert.ok(Number.isFinite(arcballPoint(-1000, 4000, 1, 1).z), "Far-outside drag remains finite");

const roll = new CubeArcball(); roll.begin(250, 250, 500, 500, 0); roll.twist(Math.PI / 2, 16);
close(new Vector3(0, 1, 0).applyQuaternion(roll.orientation).x, 1);
close(new Vector3(0, 0, 1).applyQuaternion(roll.orientation).z, 1);

const released = () => {
  const ball = new CubeArcball(); ball.begin(200, 250, 500, 500, 0);
  for (let i = 1; i <= 8; i++) ball.move(200 + i * 7, 250 + i * 2, i * 10);
  ball.end(81); assert.ok(ball.angularSpeed > .5); return ball;
};
const slowFrames = released(), fastFrames = released();
for (let i = 0; i < 18; i++) slowFrames.step(1 / 30);
for (let i = 0; i < 72; i++) fastFrames.step(1 / 120);
quaternionClose(slowFrames.orientation, fastFrames.orientation);
close(slowFrames.angularSpeed, fastFrames.angularSpeed);
const frameRateOrientationDifference = slowFrames.orientation.angleTo(fastFrames.orientation);
const caughtPose = fastFrames.orientation.clone(); fastFrames.begin(300, 280, 500, 500, 800);
quaternionClose(fastFrames.orientation, caughtPose); close(fastFrames.angularSpeed, 0);
fastFrames.move(301, 280, 810); assert.ok(fastFrames.orientation.angleTo(caughtPose) < .01, "New pointer catches current pose without a reset");

const reduced = released(), reducedPose = reduced.orientation.clone();
reduced.step(1 / 60, true); close(reduced.angularSpeed, 0); quaternionClose(reduced.orientation, reducedPose);
reduced.setOrientation(new Quaternion(), true); reduced.step(1 / 60, true); quaternionClose(reduced.orientation, new Quaternion());
const held = new CubeArcball(); held.begin(200, 250, 500, 500, 0); held.move(250, 250, 50); held.end(250);
close(held.angularSpeed, 0); // A pause before release must not revive old velocity.

// The boundary adapter preserves actual lattice/face data, not the obsolete
// editing tool or the orbit implementation. Fixtures are generic, not private constructions.
const complete = defaultCubeExperiment();
assert.equal(complete.present.length, 27); assert.equal(complete.present.reduce((a, b) => a + b, 0), 27);
assert.deepEqual(parseCubeExperiment(complete), complete);
for (let index = 0; index < 1728; index++) assert.equal(cubeIndex(...cubeCoordinates(index, 12), 12), index);
const old = {
  format: "cube-observatory/v1", n: 3, present: complete.present.slice(), colors: complete.colors.map(faces => faces.slice()),
  mode: "orbit", orbit: { radius: 9, az: 90, el: 0 }, projection: "orthographic", fov: 60, orthoSize: 5,
};
old.present[13] = 0; old.colors[5][2] = "#b98a40";
const adapted = parseCubeExperiment(old);
close(adapted.observer.eye[0], 9); close(adapted.observer.eye[1], 0); close(adapted.observer.eye[2], 0);
assert.equal(adapted.observer.projection, "orthographic"); assert.equal(adapted.present[13], 0); assert.equal(adapted.colors[5][2], "#b98a40");
adapted.present[0] = 0; assert.equal(old.present[0], 1, "Import owns a deep copy");

const inside = parseCubeExperiment({ ...old, mode: "inside", inside: { radius: 0, az: 0, el: 0, yaw: 90, pitch: 0 } });
assert.equal(inside.observer.mode, "fixed"); assert.equal(inside.observer.projection, "perspective");
assert.deepEqual(inside.observer.eye, [0, 0, 0]); close(inside.observer.target[0], 1); assert.deepEqual(cubeEyeOccupancy(inside), []);
inside.present[13] = 1; assert.deepEqual(cubeEyeOccupancy(inside), [13]);
inside.observer.eye = [.5, 0, 0]; assert.deepEqual(cubeEyeOccupancy(inside), [13, 14], "A shared solid boundary is not a legal empty viewpoint");
const polar = parseCubeExperiment({ ...old, mode: "orbit", orbit: { radius: 9, az: 0, el: 90 } });
assert.deepEqual(polar.observer.up, [0, 0, 1], "A polar imported pose gets a finite initial basis");

for (const patch of [{ n: undefined }, { n: 0 }, { n: 13 }, { present: [1] }, { colors: Array(27).fill(["red", null, null, null, null, null]) }, { observer: { ...complete.observer, eye: [NaN, 0, 0] } }, { observer: { ...complete.observer, target: complete.observer.eye } }, { observer: { ...complete.observer, up: [0, 0, 0] } }]) {
  assert.throws(() => parseCubeExperiment({ ...complete, ...patch }));
}
const preservedMath = JSON.stringify(complete.observer);
const inspect = new CubeArcball(); inspect.begin(100, 100, 500, 500, 0); inspect.move(400, 400, 60); inspect.end(61); inspect.step(.05);
assert.equal(JSON.stringify(complete.observer), preservedMath, "The rotation model never owns or mutates the mathematical experiment");

console.log(JSON.stringify({ passed: true, accumulatedInspectionRadians: Number(accumulated.toFixed(4)), freePoleRange: [Number(minimumY.toFixed(4)), Number(maximumY.toFixed(4))], frameRateOrientationDifference, checks: ["continuous pole crossings", "explicit roll", "analytic release damping", "re-grab continuity", "reduced motion", "held release", "v1/v2 data boundary", "inside and surface occupancy", "invalid data rejection"] }, null, 2));
