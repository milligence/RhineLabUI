import assert from "node:assert/strict";
import { CarrierFlight, carrierFrame } from "../src/carrier-flight.ts";

const viewport = { width: 1440, height: 960 };
const box = { left: 46, top: 98, width: 1348, height: 824 };
const flight = new CarrierFlight();
flight.move(1, 0, 2400);
const sample = time => carrierFrame(flight.step(time), viewport, box);
const ignition = sample(500), projected = sample(1050), travelling = sample(1550), arrived = sample(2400);
assert.equal(ignition.image, 0, "The image must not predate optical ignition");
assert(ignition.light > .1 && ignition.environment === 0);
assert.equal(projected.image, 1);
assert.equal(projected.camera, 0, "A formed image needs a visible hold before camera transfer");
assert.equal(projected.environment, 0, "The physical source remains exposed during the image hold");
assert(travelling.camera > .1 && travelling.camera < .95);
assert(travelling.environment > 0 && travelling.environment < 1);
assert.equal(arrived.header, 1);
assert.equal(arrived.light, 0);
assert.equal(flight.active, false);
assert.deepEqual(arrived.corners, [
  { x: box.left, y: box.top }, { x: box.left + box.width, y: box.top },
  { x: box.left + box.width, y: box.top + box.height }, { x: box.left, y: box.top + box.height },
]);

const reverse = new CarrierFlight();
reverse.move(1, 0, 2400); reverse.step(1350);
for (const [at, target, duration] of [[1350,0,1000], [1560,1,1300], [1750,0,1000], [1900,1,1200]]) {
  reverse.step(at);
  const state = [reverse.value, reverse.velocity, reverse.acceleration];
  reverse.move(target, at, duration); reverse.step(at);
  [reverse.value, reverse.velocity, reverse.acceleration].forEach((v,i)=>assert(Math.abs(v-state[i]) < 1e-12, "Retarget must retain position, velocity and acceleration"));
}
reverse.step(3100); assert.equal(reverse.value, 1); assert.equal(reverse.velocity, 0);

function cadence(hz) {
  const run = new CarrierFlight(); run.move(1, 0, 2400);
  let last = 0;
  for (const [at,target,duration] of [[1300,0,1000],[1580,1,1400]]) {
    for (let time=last;time<at;time+=1000/hz) run.step(time);
    run.move(target, at, duration); last=at;
  }
  run.step(2200);
  return [run.value,run.velocity,run.acceleration];
}
const reference=cadence(120);
for(const hz of [30,60,144]) cadence(hz).forEach((v,i)=>assert(Math.abs(v-reference[i])<1e-12));
for(const dimensions of [{width:390,height:844},{width:960,height:540},viewport]) {
  const b={left:14,top:100,width:dimensions.width-28,height:dimensions.height-120};
  for(let p=-.1;p<1.11;p+=.007) {
    const f=carrierFrame(p,dimensions,b);
    for(const k of ["camera","environment","image","header","light","emitter","frame"]) assert(f[k]>=0&&f[k]<=1);
    assert(f.corners.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y)));
    assert(f.corners[0].x<f.corners[1].x&&f.corners[0].y<f.corners[3].y);
  }
}
console.log("Carrier flight: ordered optical beats, held image, exact full-screen landing, C2 reversals, frame-rate independence and finite responsive geometry passed.");
