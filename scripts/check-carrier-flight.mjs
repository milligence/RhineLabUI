import assert from "node:assert/strict";
import * as THREE from "three";
import { CarrierFlight, carrierCamera, carrierFrame, projectOpticalPoint } from "../src/carrier-flight.ts";
import { archiveFraming } from "../src/viewport-layout.ts";

const close = (a, b, message, epsilon = 1e-7) => assert(Math.abs(a - b) < epsilon, message + ": " + a + " / " + b);
const viewport = { width: 1440, height: 960 };
const box = { left: 46, top: 98, width: 1348, height: 824 };
const flight = new CarrierFlight();
flight.move(1, 0, 2200);
const sample = time => carrierFrame(flight.step(time), viewport, box);
const ignition = sample(500), forming = sample(800), separated = sample(1000), approaching = sample(1500), arrived = sample(2200);
assert.equal(ignition.image, 0, "The image must not predate optical ignition");
assert(ignition.light > .1 && ignition.environment === 0);
assert(ignition.camera > 0, "The carrier starts to separate before the image is readable");
assert(forming.image > .8 && forming.image < 1 && forming.environment === 0);
assert.equal(separated.image, 1);
assert.equal(separated.environment, 0, "Camera movement must precede the environment covering the carrier");
assert(approaching.camera > .7 && approaching.camera < .9);
assert(approaching.corners[1].x - approaching.corners[0].x < box.width, "The camera continues to approach rather than stopping early");
assert.equal(arrived.header, 1);
assert.equal(arrived.light, 0);
assert.equal(flight.active, false);
const expected = [{ x: box.left, y: box.top }, { x: box.left + box.width, y: box.top },
  { x: box.left + box.width, y: box.top + box.height }, { x: box.left, y: box.top + box.height }];
arrived.corners.forEach((point, i) => { close(point.x, expected[i].x, "Exact landing X"); close(point.y, expected[i].y, "Exact landing Y"); });

const reverse = new CarrierFlight();
reverse.move(1, 0, 2200); reverse.step(1150);
for (const [at, target, duration] of [[1150,0,1000], [1360,1,1300], [1550,0,1000], [1700,1,1200]]) {
  reverse.step(at);
  const state = [reverse.value, reverse.velocity, reverse.acceleration];
  const pose = carrierFrame(reverse.value, viewport, box);
  reverse.move(target, at, duration); reverse.step(at);
  [reverse.value, reverse.velocity, reverse.acceleration].forEach((v,i) => close(v, state[i], "Retarget retains position, velocity and acceleration", 1e-12));
  assert.deepEqual(carrierFrame(reverse.value, viewport, box).matrix, pose.matrix, "Retarget keeps the painted plane");
}
reverse.step(3100); assert.equal(reverse.value, 1); assert.equal(reverse.velocity, 0);

function cadence(hz) {
  const run = new CarrierFlight(); run.move(1, 0, 2200);
  let last = 0;
  for (const [at,target,duration] of [[1000,0,850],[1350,1,1800]]) {
    for (let time=last;time<at;time+=1000/hz) run.step(time);
    run.move(target, at, duration); last=at;
  }
  run.step(2200);
  return [run.value,run.velocity,run.acceleration];
}
const reference = cadence(120);
for (const hz of [30,60,144]) cadence(hz).forEach((v,i) => close(v, reference[i], "Frame-rate independent braking", 1e-12));
// This sequence previously crossed below zero by .155, causing the clamped
// camera to halt before restarting. Exercise early/late reversals as well.
let reversalCases = 0;
for (let closing=100;closing<2200;closing+=100) for (let reopening=50;reopening<1200;reopening+=100) {
  const run = new CarrierFlight(); run.move(1,0,2200); run.step(closing);
  run.move(0,closing,Math.max(650,run.value*1500)); run.step(closing+reopening);
  run.move(1,closing+reopening,Math.max(450,(1-run.value)*2200));
  for (let time=closing+reopening;time<closing+reopening+2400;time+=10) {
    run.step(time);
    assert(run.value >= -1e-12 && run.value <= 1+1e-12, "The physical path must not depend on endpoint clamping");
  }
  reversalCases++;
}

const dimensions = [{width:390,height:844},{width:960,height:540},{width:844,height:390},viewport,{width:1920,height:1080},{width:2560,height:1080}];
let maxProjectionError = 0, maxExposedOverlap = 0;
const bounds = points => ({ left: Math.min(...points.map(p=>p.x)), right: Math.max(...points.map(p=>p.x)), top: Math.min(...points.map(p=>p.y)), bottom: Math.max(...points.map(p=>p.y)) });
const intersection = (a,b) => Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)) * Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
const baselineBack = new THREE.Vector3(-.277,.238,.931).normalize();
const baselineRight = new THREE.Vector3(0,1,0).cross(baselineBack).normalize();
const baselineUp = new THREE.Vector3().crossVectors(baselineBack,baselineRight);
for (const size of dimensions) {
  const b = { left: 14, top: 100, width: size.width-28, height: size.height-120 };
  const framing = archiveFraming(size.width,size.height,7.33,1,size.width<1100);
  const perspective = 72/framing.span;
  const first = carrierCamera(0,size,perspective), last = carrierCamera(1,size,perspective);
  assert.deepEqual(first.position,{x:0,y:0,z:perspective});
  assert.deepEqual(first.aim,{x:0,y:0,z:0});
  assert(last.backward.x > .1, "The camera actually orbits towards the image");
  assert(Math.abs(last.backward.y) > .1, "Focal transfer also changes elevation");
  close(last.perspective,first.perspective,"Dolly must not be cancelled by changing the lens");
  const lastDistance = Math.hypot(last.position.x-last.aim.x,last.position.y-last.aim.y,last.position.z-last.aim.z);
  assert(lastDistance < perspective*.4, "The camera approaches the optical plane in depth");

  const physical = [0,.8,-.8].map(rotation => {
    const points = [];
    // Public model dimensions and allowed inspection limits, not a fabricated
    // mesh. This conservative box catches collision with the reading surface.
    for (const x of [-2.5,2.5]) for (const y of [-1.85,1.85]) for (const z of [-.155,.155]) {
      const q = new THREE.Vector3(x,y,z).applyAxisAngle(new THREE.Vector3(0,1,0),rotation).divideScalar(framing.span);
      points.push({x:(framing.detailX-.5)*size.width/size.height+q.dot(baselineRight),y:.5-framing.detailY+q.dot(baselineUp),z:q.dot(baselineBack)});
    }
    return points;
  });
  for (let step=0;step<=200;step++) {
    const p=step/200, f=carrierFrame(p,size,b,{perspective,progress:p});
    for (const k of ["camera","environment","image","header","light","emitter","frame"]) assert(f[k]>=0&&f[k]<=1);
    assert(f.corners.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y)));
    const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2*Math.atan(1/(2*perspective))),size.width/size.height,.001,1000);
    camera.position.set(f.rig.position.x,f.rig.position.y,f.rig.position.z);
    camera.lookAt(f.rig.aim.x,f.rig.aim.y,f.rig.aim.z); camera.updateMatrixWorld();
    const css = f.transform.slice(9,-1).split(",").map(Number);
    for (const [x,y] of [[0,0],[b.width,0],[b.width,b.height],[0,b.height],[b.width*.37,b.height*.61]]) {
      const point = new THREE.Vector3(f.rig.centre.x,f.rig.centre.y,f.rig.centre.z)
        .addScaledVector(new THREE.Vector3(f.rig.planeRight.x,f.rig.planeRight.y,f.rig.planeRight.z),f.rig.planeScale*(b.left+x-size.width/2)/size.height)
        .addScaledVector(new THREE.Vector3(f.rig.planeUp.x,f.rig.planeUp.y,f.rig.planeUp.z),f.rig.planeScale*(size.height/2-b.top-y)/size.height).project(camera);
      const u=x-b.width/2,v=y-b.height/2,w=css[3]*u+css[7]*v+css[15];
      const projected = {x:b.left+b.width/2+(css[0]*u+css[4]*v+css[12])/w,y:b.top+b.height/2+(css[1]*u+css[5]*v+css[13])/w};
      const error = Math.max(Math.abs(projected.x-(point.x+1)*size.width/2),Math.abs(projected.y-(1-point.y)*size.height/2));
      maxProjectionError = Math.max(maxProjectionError,error);
      assert(error<1e-5,"CSS plane must match a real Three camera, including perspective and transform origin");
    }
    if (f.image>.01 && f.environment<1) for (const points of physical) {
      const carrier = bounds(points.map(point=>projectOpticalPoint(point,f.rig,size)));
      const image = bounds(f.corners);
      const exposed = intersection(carrier,image)*(1-f.environment)/((image.right-image.left)*(image.bottom-image.top));
      maxExposedOverlap = Math.max(maxExposedOverlap,exposed);
      assert(exposed<.015,"The image must not cover the exposed physical carrier during the handoff");
      if (f.environment>.99) assert.equal(intersection(carrier,{left:0,top:0,right:size.width,bottom:size.height}),0,"The carrier exits through a viewport edge before the observation field is opaque");
    }
  }
}
const delayed = carrierFrame(.7,viewport,box,{perspective:11,progress:.4});
assert.equal(delayed.camera,.4);
assert.equal(delayed.requestedCamera,.7);
assert.deepEqual(delayed.rig,carrierCamera(.4,viewport,11),"DOM geometry follows the drawn camera phase, not the next requested one");
for (const lens of [.3,.8,1.49]) assert.deepEqual(carrierCamera(0,viewport,lens).position,{x:0,y:0,z:lens},"Wide lenses retain an exact entry pose");
console.log(JSON.stringify({checks:"Ordered formation, real orbit and fixed-lens dolly, exact landing, C2 reversals, bounded braking, Three/CSS alignment, responsive carrier separation, drawn-frame synchronization",reversalCases,maxProjectionErrorPx:maxProjectionError,maxExposedOverlap},null,2));
