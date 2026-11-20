import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { installProjectorAperture, setProjectorAperturePower, PROJECTOR_APERTURE } from "../src/projector-aperture.ts";
import { themeMaterial } from "../src/theme-material.ts";
import { CarrierFlight, CarrierPresentationClock, CARRIER_ENTRANCE_MS, CARRIER_RETURN_MS, carrierCameraProgress, carrierCamera, carrierFrame, carrierLocalPoint, projectOpticalPoint, carrierCue, carrierChannels, carrierReceiverPlane, carrierPlaneCorners } from "../src/carrier-flight.ts";
import { archiveFraming, viewportLayout } from "../src/viewport-layout.ts";
import { INSPECTION_LIFT, smooth as nativeEase } from "../src/motion.ts";

const close = (a, b, message, epsilon = 1e-7) => assert(Math.abs(a - b) < epsilon, message + ": " + a + " / " + b);
const viewport = { width: 1440, height: 960 };
const box = { left: 46, top: 98, width: 1348, height: 824 };
const flight = new CarrierFlight();
flight.startPresentation(0);
const sample = time => carrierFrame(flight.step(time), viewport, box);
const ignition = sample(550), beam = sample(700), beamArrived = sample(1350), frameClosed = sample(1850), forming = sample(2750), held = sample(3900), transfer = sample(6000), arrived = sample(CARRIER_ENTRANCE_MS);
assert.equal(ignition.image, 0, "The physical source lights before any image appears");
assert(ignition.sourcePower > .9 && ignition.environment === 0);
assert.equal(ignition.camera, 0, "The original settled shot establishes the port and formation without residual camera bounce");
assert(beam.beamReach > 0 && beam.beamReach < .5 && beam.reveal === 0, "The beam grows before the image forms");
close(beamArrived.beamReach, 1, "The beam reaches the receiver before the finite frame begins", 1e-12);
assert.equal(beamArrived.frameBuild, 0);
assert.equal(beamArrived.reveal, 0);
assert.equal(frameClosed.frameBuild, 1, "The finite frame closes before the main information appears");
assert.equal(frameClosed.reveal, 0);
assert.equal(forming.image, 1, "Spatial exposure owns image formation without a second whole-page fade");
assert(forming.reveal > .1 && forming.reveal < .7, "The image is spatially revealed over time");
assert.equal(held.image, 1); assert.equal(held.reveal, 1); assert.equal(held.contentResolve, 1);
assert.equal(held.environment, 0); assert.equal(held.beat, "image-held");
const coexistStart = carrierFrame(carrierCue(3600), viewport, box), coexistEnd = carrierFrame(carrierCue(4200), viewport, box);
assert.equal(coexistStart.contentResolve, 1); assert.equal(coexistEnd.contentResolve, 1);
assert.equal(coexistStart.camera, 0); assert.equal(coexistEnd.camera, 0);
assert.deepEqual(coexistStart.matrix, coexistEnd.matrix, "The completed image and real carrier coexist for 600ms before camera departure");
assert.deepEqual(coexistStart.rig.centre, coexistEnd.rig.centre, "The receiving plane stays fixed throughout the shot");
assert.deepEqual(coexistStart.rig.normal, coexistEnd.rig.normal);
assert(transfer.camera > .7 && transfer.camera < .9);
assert.equal(transfer.beamPower, 0);
assert(transfer.edgePresence > .99 && transfer.platePresence > .99, "The finite plate survives the beam's departure");
assert(transfer.corners[1].x - transfer.corners[0].x < box.width, "The camera continues to approach rather than stopping early");
assert.equal(arrived.header, 1); assert.equal(arrived.reveal, 1);
assert.equal(arrived.light, 0); assert.equal(flight.active, false);
const expected = [{ x: box.left, y: box.top }, { x: box.left + box.width, y: box.top },
  { x: box.left + box.width, y: box.top + box.height }, { x: box.left, y: box.top + box.height }];
arrived.corners.forEach((point, i) => { close(point.x, expected[i].x, "Exact landing X"); close(point.y, expected[i].y, "Exact landing Y"); });
const oldPhase = carrierCue(900);
const waitingForCamera = carrierFrame(carrierCue(2400), viewport, box,
  { perspective: 12, progress: carrierCameraProgress(oldPhase), phase: oldPhase });
assert.equal(waitingForCamera.progress, oldPhase, "A drawn phase controls the entire optical frame");
assert.equal(waitingForCamera.image, 0, "A delayed scene cannot be overpainted by an advanced image");
assert.equal(waitingForCamera.reveal, 0);

// Formation has one uniform presentation clock. Its structural channels may
// ease locally; the whole image cannot be accelerated by an outer quintic.
for (let time=1900;time<=3600;time+=100)
  close(carrierChannels(carrierCue(time)).contentResolve,(time-1900)/1700,"Formation retains the full 1700ms local interval",1e-12);
const departure=carrierCue(4200), h=.1/CARRIER_ENTRANCE_MS;
close(carrierCameraProgress(departure),0,"Camera departure starts at rest");
assert(carrierCameraProgress(departure+h)/h<1e-4,"Camera departure has zero first derivative");
assert((carrierCameraProgress(departure+2*h)-2*carrierCameraProgress(departure+h))/(h*h)<.02,"Camera departure has zero second derivative");
assert((1-carrierCameraProgress(1-h))/h<1e-4,"Camera arrival has zero first derivative");

const clock = new CarrierPresentationClock(); clock.reset(100);
clock.step(116); close(clock.value,16,"Normal frame time is preserved");
clock.step(5116); close(clock.value,80,"A render stall cannot consume the whole projection ritual");
clock.step(10116,false); close(clock.value,80,"A hidden tab does not play through the projection");
clock.step(10132); close(clock.value,96,"Returning from a hidden tab resumes from its shown state");
clock.step(10132); close(clock.value,96,"A drawn-scene repaint at the same review time does not advance the timeline");
for (const hz of [30,60,120,144]) {
  const timed = new CarrierPresentationClock(); timed.reset(0);
  for(let frame=1;frame<=hz*3;frame++)timed.step(frame*1000/hz);
  close(timed.value,3000,"Normal display cadences retain the intended duration",1e-8);
}

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
for (let closing=100;closing<CARRIER_ENTRANCE_MS;closing+=250) for (let reopening=50;reopening<CARRIER_RETURN_MS;reopening+=200) {
  const run = new CarrierFlight(); run.startPresentation(0); run.step(closing);
  run.move(0,closing,Math.max(850,run.value*CARRIER_RETURN_MS)); run.step(closing+reopening);
  run.move(1,closing+reopening,Math.max(900,(1-run.value)*CARRIER_ENTRANCE_MS));
  for (let time=closing+reopening;time<closing+reopening+CARRIER_ENTRANCE_MS+300;time+=10) {
    run.step(time);
    assert(run.value >= -1e-12 && run.value <= 1+1e-12, "The physical path must not depend on endpoint clamping");
  }
  reversalCases++;
}

const dimensions = [{width:390,height:780},{width:390,height:844},{width:960,height:540},{width:844,height:390},viewport,{width:1920,height:1080},{width:2560,height:1080}];
let maxProjectionError = 0, maxExposedOverlap = 0, minimumPhysicalClearance=Infinity;
const bounds = points => ({ left: Math.min(...points.map(p=>p.x)), right: Math.max(...points.map(p=>p.x)), top: Math.min(...points.map(p=>p.y)), bottom: Math.max(...points.map(p=>p.y)) });
const intersection = (a,b) => Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)) * Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
const baselineBack = new THREE.Vector3(-.277,.238,.931).normalize();
const baselineRight = new THREE.Vector3(0,1,0).cross(baselineBack).normalize();
const baselineUp = new THREE.Vector3().crossVectors(baselineBack,baselineRight);
for (const size of dimensions) {
  const b = { left: 14, top: 100, width: size.width-28, height: size.height-120 };
  const framing = archiveFraming(size.width,size.height,7.33,1,size.width<1100);
  const perspective = 72/framing.span;
  const physicalAim = new THREE.Vector3(0,1.85,0)
    .addScaledVector(baselineRight,(.5-framing.detailX)*size.width/size.height*framing.span)
    .addScaledVector(baselineUp,(framing.detailY-.5)*framing.span);
  const physicalPoint = point => {
    const relative = new THREE.Vector3(point.x,point.y,point.z).sub(physicalAim);
    return {x:relative.dot(baselineRight)/framing.span,y:relative.dot(baselineUp)/framing.span,z:relative.dot(baselineBack)/framing.span};
  };
  const physicalSource=PROJECTOR_APERTURE.corners.map(physicalPoint);
  const physicalNormal={x:baselineRight.z,y:baselineUp.z,z:baselineBack.z};
  const plane=carrierReceiverPlane(size,perspective,{corners:physicalSource,normal:physicalNormal,clearance:.9/framing.span});
  const receiver=carrierPlaneCorners(plane,size);
  const first = carrierCamera(0,size,perspective,{plane}), last = carrierCamera(1,size,perspective,{plane});
  assert.deepEqual(first.position,{x:0,y:0,z:perspective});
  assert.deepEqual(first.aim,{x:0,y:0,z:0});
  assert(framing.portrait ? last.backward.y > .25 : last.backward.x < -.25, "The camera orbits from the real carrier side, carrying it out of view");
  assert(Math.abs(last.backward.y) > .04, "Focal transfer also changes elevation");
  close(last.perspective,first.perspective,"Dolly must not be cancelled by changing the lens");
  const lastDistance = Math.hypot(last.position.x-last.aim.x,last.position.y-last.aim.y,last.position.z-last.aim.z);
  assert(lastDistance < perspective*.51, "The camera approaches the optical plane in depth");

  const entrySource=physicalSource.map(point=>projectOpticalPoint(point,first,size));
  assert(entrySource.every(point=>point.x>size.width*.03&&point.x<size.width*.97&&point.y>size.height*.03&&point.y<size.height*.97),"The real four-corner aperture is visibly inside the native settled shot");
  const receivingBounds=bounds(receiver.map(point=>projectOpticalPoint(point,first,size)));
  assert(receivingBounds.left>size.width*.02&&receivingBounds.right<size.width*.981&&receivingBounds.top>size.height*.02&&receivingBounds.bottom<size.height*.97,"The entire held receiving frame remains inside the safe view");
  if(!framing.portrait)close((receivingBounds.right-receivingBounds.left)/size.width,.45,"The landscape receiver occupies 45% of the actual frame",1e-7);
  else assert(receivingBounds.top>size.height*.5,"Portrait formation lives below its physical archive");
  for(const target of receiver)for(const aperture of physicalSource){
    const forward=((target.x-aperture.x)*physicalNormal.x+(target.y-aperture.y)*physicalNormal.y+(target.z-aperture.z)*physicalNormal.z)*framing.span;
    minimumPhysicalClearance=Math.min(minimumPhysicalClearance,forward);
    assert(forward>=.9-1e-8,"Every real aperture-to-receiver ray stays in front of the glass and cannot cross its cover");
  }

  const physical = [0].map(rotation => {
    const points = [];
    // The native physical dimensions after the preparation has restored a
    // frontal outlet. Rotated entry is tested through the Scene methods below.
    for (const x of [-2.5,2.5]) for (const y of [-1.85,1.85]) for (const z of [-.155,.155]) {
      const q = new THREE.Vector3(x,y,z).applyAxisAngle(new THREE.Vector3(0,1,0),rotation).divideScalar(framing.span);
      points.push({x:(framing.detailX-.5)*size.width/size.height+q.dot(baselineRight),y:.5-framing.detailY+q.dot(baselineUp),z:q.dot(baselineBack)});
    }
    return points;
  });
  let previousRadius=Infinity;
  for (let step=0;step<=200;step++) {
    const p=step/200, progress=carrierCameraProgress(p);
    const pose=carrierCamera(progress,size,perspective,{plane});
    const presented={perspective,progress,phase:p,plane};
    const radius=Math.hypot(pose.position.x-plane.centre.x,pose.position.y-plane.centre.y,pose.position.z-plane.centre.z);
    assert(radius<=previousRadius+1e-10,"The camera never advances and retreats during the same entrance");previousRadius=radius;
    // Drawn camera samples also preserve a noncanonical up vector.
    if (step===24) Object.assign(presented,{
      position:{x:pose.position.x+.012,y:pose.position.y-.006,z:pose.position.z+.009},
      aim:{x:pose.aim.x+.003,y:pose.aim.y+.004,z:pose.aim.z},up:{x:.012,y:1,z:.006},
    });
    const f=carrierFrame(p,size,b,presented);
    for (const k of ["camera","environment","image","reveal","beamReach","beamSpread","header","light","emitter","frame","interface","sourcePower","beamPower","platePresence","edgePresence","frameBuild","contentResolve"]) assert(f[k]>=0&&f[k]<=1);
    assert(f.corners.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y)));
    const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2*Math.atan(1/(2*perspective))),size.width/size.height,.001,1000);
    camera.position.set(f.rig.position.x,f.rig.position.y,f.rig.position.z);
    camera.up.set(f.rig.up.x,f.rig.up.y,f.rig.up.z);
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
assert.equal(delayed.requestedCamera,carrierCameraProgress(.7));
assert.deepEqual(delayed.rig,carrierCamera(.4,viewport,11),"DOM geometry follows the drawn camera phase, not the next requested one");
for (const lens of [.3,.8,1.49]) assert.deepEqual(carrierCamera(0,viewport,lens).position,{x:0,y:0,z:lens},"Wide lenses retain an exact entry pose");

// Exercise the production painter's coordinate boundary, not a second version
// of it. Pure camera tests alone missed mixing a scaled stage's screen rect
// with its unscaled offsetWidth and CSS transform coordinates.
const viewerSource = readFileSync(new URL("../src/projection-viewer.ts",import.meta.url),"utf8").replace(/^import .+;\r?\n/gm,"");
const painterContext = {exports:{},carrierFrame,carrierCameraProgress,carrierLocalPoint,cancelAnimationFrame:()=>{}};
vm.runInNewContext(ts.transpileModule(viewerSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,painterContext);
let scaledPainterCases = 0;
for (const [width,height] of [[1280,720],[1366,768],[1536,864],[2560,1440],[390,844]]) {
  const layout=viewportLayout(width,height,false), surface={width:layout.width,height:layout.height};
  const rect={left:23,top:17,width:surface.width*layout.scale,height:surface.height*layout.scale};
  const b={left:0,top:0,width:surface.width,height:surface.height};
  const properties=new Map();
  const style=()=>({setProperty:(key,value)=>properties.set(key,value)});
  const ignition={style:style(),querySelector:()=>null};
  const nodes={".projection-environment":{style:style()},".projection-header":{style:style()},".projection-ignition":ignition};
  for (const progress of [.08,.2,.4,.7,1]) {
    const drawn={progress:carrierCameraProgress(progress),phase:progress,perspective:11.8};
    const expectedFrame=carrierFrame(progress,surface,b,drawn);
    const sourceLocal=projectOpticalPoint({x:-.27,y:.04,z:.01},expectedFrame.rig,surface);
    const sourceScreen={x:rect.left+sourceLocal.x*layout.scale,y:rect.top+sourceLocal.y*layout.scale};
    const edgeLocal=[{x:sourceLocal.x-5,y:sourceLocal.y+2},{x:sourceLocal.x+5,y:sourceLocal.y-2}];
    const edgeScreen=edgeLocal.map(p=>({x:rect.left+p.x*layout.scale,y:rect.top+p.y*layout.scale}));
    const apertureLocal=[edgeLocal[0],edgeLocal[1],{x:edgeLocal[1].x+1,y:edgeLocal[1].y+3},{x:edgeLocal[0].x+1,y:edgeLocal[0].y+3}];
    const apertureScreen=apertureLocal.map(p=>({x:rect.left+p.x*layout.scale,y:rect.top+p.y*layout.scale}));
    let opticalInput;
    // Rendering is inert here; the actual production painter still owns the
    // camera and both screen-to-local conversions passed to the optical field.
    const optics={render:input=>{opticalInput=input;return {maskImage:"none",clarity:1,active:false};}};
    const viewer=Object.assign(Object.create(painterContext.exports.ProjectionViewer.prototype),{
      parent:{clientWidth:surface.width,clientHeight:surface.height,getBoundingClientRect:()=>rect},
      root:{style:style(),querySelector:selector=>nodes[selector],closest:()=>null},
      plane:{offsetLeft:b.left,offsetTop:b.top,offsetWidth:b.width,offsetHeight:b.height,style:style()},
      host:{style:style()},
      flight:{value:Math.min(1,progress+.03)},clock:{value:1234},optics,closing:false,setBeat:()=>{},
      options:{reducedMotion:false,onPresentation:()=>drawn,onCameraProgress:()=>{throw new Error("Complete presentation takes precedence");},
        sampleCarrier:()=>({origin:sourceScreen,edge:edgeScreen,corners:apertureScreen,outline:apertureScreen})},
    });
    viewer.paintFlight();
    close(parseFloat(properties.get("--projection-origin-x")),sourceLocal.x,"Scaled stage source X remains on the physical carrier");
    close(parseFloat(properties.get("--projection-origin-y")),sourceLocal.y,"Scaled stage source Y remains on the physical carrier");
    assert.deepEqual(viewer.frameState.matrix,expectedFrame.matrix,"Production image transform uses local dimensions at non-unit stage scales");
    assert.equal(opticalInput.frame,viewer.frameState,"Optical field uses the exact drawn-camera frame used by the production image");
    close(opticalInput.origin.x,sourceLocal.x,"Optical field receives a local emitter X");
    close(opticalInput.origin.y,sourceLocal.y,"Optical field receives a local emitter Y");
    opticalInput.edge.forEach((point,i)=>{
      close(point.x,edgeLocal[i].x,"Optical aperture edge X shares the scaled-stage boundary");
      close(point.y,edgeLocal[i].y,"Optical aperture edge Y shares the scaled-stage boundary");
    });
    assert.equal(viewer.frameState.progress,drawn.phase,"Production material phase matches the drawn source and camera");
    opticalInput.aperture.forEach((point,i)=>{
      close(point.x,apertureLocal[i].x,"Physical rectangular aperture X shares the scaled-stage boundary");
      close(point.y,apertureLocal[i].y,"Physical rectangular aperture Y shares the scaled-stage boundary");
    });
    opticalInput.outline.forEach((point,i)=>{
      close(point.x,apertureLocal[i].x,"Carrier silhouette X uses the same local space");
      close(point.y,apertureLocal[i].y,"Carrier silhouette Y uses the same local space");
    });
    viewer.frameState.corners.forEach((point,i)=>{
      close(rect.left+point.x*layout.scale,rect.left+expectedFrame.corners[i].x*layout.scale,"Displayed image X follows the scaled stage");
      close(rect.top+point.y*layout.scale,rect.top+expectedFrame.corners[i].y*layout.scale,"Displayed image Y follows the scaled stage");
    });
    scaledPainterCases++;
  }
}
// The granular image must leave a normal document behind, and closing an
// interrupted transfer must release its optical resources and input isolation.
const settledProperties=new Map();
const settledStyle={maskImage:"url(data:image/png;base64,formation)",setProperty:(key,value)=>settledProperties.set(key,value)};
const settledIgnition={style:{opacity:"1"},replaceChildren:()=>{}};
let disposedOptics=0,disposedContent=0,restoredFocus=0,closedCallbacks=0,clearedHost=0,lastCamera;
const sibling={inert:true};
const settled=Object.assign(Object.create(painterContext.exports.ProjectionViewer.prototype),{
  plane:{style:settledStyle},
  host:{inert:true,replaceChildren:()=>{clearedHost++;}},
  root:{style:{setProperty:(key,value)=>settledProperties.set(key,value)},dataset:{state:"opening"},querySelector:()=>settledIgnition,hidden:false},
  flight:new CarrierFlight(),setBeat:()=>{},opticalMask:"formation",opticalClarity:.4,
  optics:{dispose:()=>{disposedOptics++;}},research:{setFormation:()=>{},setPresentationScale:()=>{},dispose:()=>{disposedContent++;}},
  siblings:[{node:sibling,inert:false}],opener:{isConnected:true,focus:()=>{restoredFocus++;}},
  options:{onCameraProgress:value=>{lastCamera=value;},onClose:()=>{closedCallbacks++;}},
  isOpen:true,closing:false,
});
settled.finishEntrance();
assert.equal(settled.plane.style.maskImage,"none","Settled text must not retain the formation mask");
assert.equal(settledProperties.get("-webkit-mask-image"),"none","WebKit receives the same clean mask endpoint");
assert.equal(settled.opticalClarity,1,"Settled labels are fully resolved");
assert.equal(settled.host.inert,false,"Settled projection controls become interactive");
assert.equal(settled.root.dataset.state,"open");
assert.equal(settledIgnition.style.opacity,"0","The temporary optical layer is absent from stable reading");
settled.finishClose();
assert.equal(disposedOptics,1,"Closing releases the optical renderer once");
assert.equal(disposedContent,1,"Closing releases the production content once");
assert.equal(settled.optics,undefined);
assert.equal(settled.isOpen,false);assert.equal(settled.root.hidden,true);
assert.equal(lastCamera,0,"A completed return restores the physical camera endpoint");
assert.equal(sibling.inert,false,"Closing restores the underlying archive's input state");
assert.equal(restoredFocus,1);assert.equal(closedCallbacks,1);assert.equal(clearedHost,1);
// A cassette must not gain/lose its physical outlet when selection switches
// between the instanced array and a returning independent model. Exercise the
// actual scene installation method and CardAppearance with the real GLB source.
const sceneText=readFileSync(new URL("../src/scene.ts",import.meta.url),"utf8");
const sceneAst=ts.createSourceFile("scene.ts",sceneText,ts.ScriptTarget.Latest,true);
const sceneClass=sceneAst.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==="ArchiveScene");
const installMethod=sceneClass.members.find(node=>node.name?.getText(sceneAst)==="addProjectorInstances");
assert(installMethod);
const instancingContext={exports:{},THREE,themeMaterial};
vm.runInNewContext(ts.transpileModule(`export class InstanceHarness { ${installMethod.getText(sceneAst)} }`,
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,instancingContext);
const appearanceText=readFileSync(new URL("../src/appearance.ts",import.meta.url),"utf8").replace(/^import .+;\r?\n/gm,"");
const appearanceContext={exports:{},THREE,themeMaterial};
vm.runInNewContext(ts.transpileModule(appearanceText,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,appearanceContext);
const appearance=new appearanceContext.exports.CardAppearance();
const bytes=readFileSync(new URL("../public/assets/archive-cassette.glb",import.meta.url));
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
gltf.scene.updateMatrixWorld(true);
let substrate;
gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh&&!Array.isArray(object.material)&&object.material.name.startsWith("Optical_Diffuser"))substrate=object;});
assert(substrate,"The physical outlet reuses the original closed Blender substrate");
const substrateGeometry=substrate.geometry.clone().applyMatrix4(substrate.matrixWorld);
const selectedPort=new THREE.Group();
const portMeshes=installProjectorAperture(selectedPort,appearance,substrateGeometry);
substrateGeometry.dispose();
const sharedMatrix=new THREE.InstancedBufferAttribute(new Float32Array(50*16),16);
const sharedTheme=new THREE.InstancedBufferAttribute(new Float32Array(50),1);
const installation=Object.assign(Object.create(instancingContext.exports.InstanceHarness.prototype),{
  instances:[{instanceMatrix:sharedMatrix}],scene:new THREE.Scene(),themeAttribute:sharedTheme,subduedIndex:{value:0},
});
installation.addProjectorInstances(portMeshes,50);
const backgroundPorts=installation.instances.slice(1);
assert.equal(backgroundPorts.length,4,"Four shared material groups cover every background cassette");
appearance.prepare(selectedPort);appearance.apply(selectedPort,0);setProjectorAperturePower(selectedPort,0);
const materialEndpoint=(a,b)=>{
  assert.deepEqual(a.color.toArray(),b.color.toArray(),"Resting array and selected port colors match");
  for(const key of ["roughness","metalness","transmission","thickness","clearcoat","clearcoatRoughness"])
    close(a[key],b[key],"Resting array and selected port share "+key);
  assert.equal(a.emissiveIntensity,0);assert.equal(b.emissiveIntensity,0);
};
backgroundPorts.forEach((inst,i)=>{
  assert.equal(inst.geometry,portMeshes[i].geometry,"Array/selected/outgoing share the same hardware geometry");
  assert.equal(inst.instanceMatrix,sharedMatrix,"Hardware shares the archive's existing transform buffer");
  assert.equal(inst.geometry.getAttribute("archiveTheme"),sharedTheme,"Hardware shares the same per-cell theme field");
  assert.equal(inst.count,50);assert.equal(inst.frustumCulled,false);
  assert.notEqual(inst.material,portMeshes[i].material,"Physical light cannot mutate the static array material");
  materialEndpoint(inst.material,portMeshes[i].material);
});
setProjectorAperturePower(selectedPort,1);
assert(selectedPort.children.some(mesh=>mesh.material.emissiveIntensity>1));
assert(backgroundPorts.every(inst=>inst.material.emissiveIntensity===0),"Igniting one selected port never lights the background array");
const returningPort=selectedPort.clone(true);
appearance.prepare(returningPort);appearance.apply(returningPort,0);setProjectorAperturePower(returningPort,0);
backgroundPorts.forEach((inst,i)=>materialEndpoint(inst.material,returningPort.children[i].material));
const glass=portMeshes.find(mesh=>mesh.userData.projectorRole==="glass");glass.geometry.computeBoundingBox();
close(glass.geometry.boundingBox.max.z,PROJECTOR_APERTURE.center.z,"Sampled aperture is the actual front glass face",1e-6);
for(const corner of PROJECTOR_APERTURE.corners)close(corner.z,glass.geometry.boundingBox.max.z,"Every aperture corner belongs to the real surface",1e-6);

// Execute the actual Scene entry/basis/camera methods against the installed
// GLB-derived aperture. A screen-space calibration alone missed both the
// off-screen early gate and rays travelling backwards through the cover.
const methodNames=["physicalProjector","projectionEntryReady","fitProjectionPlane","prepareProjection","cancelProjectionPreparation","beginProjection","setProjectionPresentation","setProjectionFocus","endProjection","rememberPresentedFrame"];
const sceneMethods=methodNames.map(name=>sceneClass.members.find(node=>node.name?.getText(sceneAst)===name));
assert(sceneMethods.every(Boolean));
const updateText=sceneClass.members.find(node=>node.name?.getText(sceneAst)==="update").getText(sceneAst);
const cameraStart=updateText.indexOf("const opticalBase = this.projectionCamera;"),cameraEnd=updateText.indexOf("const ordinaryPosition = this.projectionCamera?.ordinaryPosition");
assert(cameraStart>0&&cameraEnd>cameraStart);
const actualCameraBlock=updateText.slice(cameraStart,cameraEnd);
const opticalContext={exports:{},THREE,carrierCamera,carrierCameraProgress,carrierReceiverPlane,carrierPlaneCorners,PROJECTOR_APERTURE,INSPECTION_LIFT,ease:nativeEase};
vm.runInNewContext(ts.transpileModule(`export class OpticalHarness {
  ${sceneMethods.map(method=>method.getText(sceneAst)).join("\n")}
  advance(cameraPosition,cameraAim,ordinaryFov,cameraBlend,dt,cinematic=false) {
    ${actualCameraBlock}
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    return opticalSample;
  }
}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,opticalContext);

let actualSceneCases=0,oldBackwardsRayCases=0;
const realCoverBounds=new THREE.Box3();
gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh&&!Array.isArray(object.material)&&object.material.name.startsWith("Frosted_Polymer"))realCoverBounds.union(new THREE.Box3().setFromObject(object));});
assert(!realCoverBounds.isEmpty());
for(const size of [{width:1920,height:1080},{width:390,height:780}]) {
  const framing=archiveFraming(size.width,size.height,7.33,1,false),fov=THREE.MathUtils.radToDeg(2*Math.atan(framing.span/144));
  const model=selectedPort.clone(true);model.position.set(0,INSPECTION_LIFT,0);model.updateMatrixWorld(true);
  const aim=model.position.clone().add(new THREE.Vector3(0,1.85,0))
    .addScaledVector(baselineRight,(.5-framing.detailX)*size.width/size.height*framing.span)
    .addScaledVector(baselineUp,(framing.detailY-.5)*framing.span);
  const camera=new THREE.PerspectiveCamera(fov,size.width/size.height,5,300);camera.position.copy(aim).addScaledVector(baselineBack,72);camera.lookAt(aim);camera.updateMatrixWorld();
  const displayed={time:0,position:camera.position.clone(),aim:aim.clone(),up:camera.up.clone(),fov,
    velocity:new THREE.Vector3(),acceleration:new THREE.Vector3(),aimVelocity:new THREE.Vector3(),aimAcceleration:new THREE.Vector3(),fovVelocity:0,fovAcceleration:0};
  const actual=Object.assign(Object.create(opticalContext.exports.OpticalHarness.prototype),{
    model,camera,cameraAim:aim.clone(),presentedCamera:displayed,
    container:{clientWidth:size.width,clientHeight:size.height},motion:{surfaceTransitions:true},renderedFrames:0,reusedFrames:0,
    targetDetail:1,detail:1,lift:{value:INSPECTION_LIFT,velocity:0},returnY:null,rotation:0,targetRotation:0,cameraResidual:0,cancelPointer:()=>{},
  });
  const neighborTop=3.76;
  assert(actual.projectionEntryReady(framing.span,neighborTop,false,actual.physicalProjector()),"The true settled native detail shot is accepted");
  actual.presentedCamera.velocity.set(0,0,-7);assert(!actual.projectionEntryReady(framing.span,neighborTop,false,actual.physicalProjector()),"A moving ordinary camera cannot be frozen then sent backwards by a transient offset");actual.presentedCamera.velocity.set(0,0,0);
  const originalPosition=camera.position.clone(),originalAim=actual.cameraAim.clone();
  camera.position.addScaledVector(baselineUp,-framing.span);actual.cameraAim.addScaledVector(baselineUp,-framing.span);camera.lookAt(actual.cameraAim);camera.updateMatrixWorld();
  const offscreen=actual.physicalProjector();
  assert(offscreen.corners.every(corner=>corner.clone().project(camera).y>1),"A physically clear raised aperture can still be above the viewport");
  assert(!actual.projectionEntryReady(framing.span,neighborTop,false,offscreen),"Screen visibility is an independent entry condition");
  camera.position.copy(originalPosition);actual.cameraAim.copy(originalAim);camera.lookAt(actual.cameraAim);camera.updateMatrixWorld();
  model.rotation.y=Math.PI;model.updateMatrixWorld(true);
  assert(!actual.projectionEntryReady(framing.span,neighborTop,false,actual.physicalProjector()),"A back-facing real port cannot be substituted by a painted source");
  model.rotation.y=0;model.updateMatrixWorld(true);
  for(const rotation of [-.8,.8]) {
    actual.rotation=actual.targetRotation=rotation;model.rotation.y=rotation;
    actual.prepareProjection();
    assert.equal(actual.rotation,rotation,"Preparation never snaps the currently displayed archive");assert.equal(actual.targetRotation,0);
    actual.cancelProjectionPreparation();assert.equal(actual.targetRotation,rotation,"Cancellation restores the observer's rotation target");
    actual.prepareProjection();
    for(let frame=0;frame<160;frame++)actual.rotation=THREE.MathUtils.lerp(actual.rotation,actual.targetRotation,1-Math.exp(-1/60*2.8));
    model.rotation.y=actual.rotation;model.updateMatrixWorld(true);
    assert(actual.projectionEntryReady(framing.span,neighborTop,false,actual.physicalProjector()),"Native smooth preparation makes a rotated reading entry physically ready");
    actual.cancelProjectionPreparation();assert.equal(actual.targetRotation,rotation);
  }
  actual.rotation=actual.targetRotation=0;model.rotation.y=0;model.updateMatrixWorld(true);
  actual.prepareProjection();actual.beginProjection();
  const initial=actual.projectionCamera,heldPlane=initial.plane,heldReceiver=initial.receiver.map(point=>point.clone());
  assert(heldPlane&&heldReceiver.length===4);
  let distance=Infinity;
  for(const ms of [0,550,1350,1850,2750,3600,3900,4200,5000,6000,6800]) {
    actual.setProjectionPresentation(carrierCue(ms));
    const sample=actual.advance(originalPosition,originalAim,fov,.1,1/60);
    assert(actual.projectionCamera,"A zero camera-progress hold does not release a still-running presentation");
    assert.equal(actual.projectionCamera.plane,heldPlane,"The physical receiving plane stays frozen throughout an unchanged viewport");
    heldReceiver.forEach((point,index)=>close(point.distanceTo(actual.projectionCamera.receiver[index]),0,"Receiver world corners do not follow the camera"));
    close(camera.fov,fov,"No finite FOV offset can advance then undo the native camera");
    if(ms<=4200)close(camera.position.distanceTo(originalPosition),0,"The actual Scene camera holds the completed native shot",1e-10);
    const centre=initial.aim.clone().addScaledVector(initial.right,heldPlane.centre.x*initial.span).addScaledVector(initial.vertical,heldPlane.centre.y*initial.span).addScaledVector(initial.backward,heldPlane.centre.z*initial.span);
    const nextDistance=camera.position.distanceTo(centre);assert(nextDistance<=distance+1e-9,"Actual Scene approach is one-way in world space");distance=nextDistance;
    const frame=carrierFrame(carrierCue(ms),size,{left:0,top:0,width:size.width,height:size.height},sample);
    initial.receiver.forEach((point,index)=>{const screen=point.clone().project(camera);close(frame.corners[index].x,(screen.x+1)*size.width/2,"Actual Scene beam and DOM share receiver X",1e-6);close(frame.corners[index].y,(1-screen.y)*size.height/2,"Actual Scene beam and DOM share receiver Y",1e-6);});
    actual.rememberPresentedFrame(ms/1000,sample);
    assert.equal(actual.projectorPresented.physicalSource,true);assert.equal(actual.projectorPresented.sceneBeam,true);
    actualSceneCases++;
  }
  // Recreate the previous camera-only plane with the same actual entry basis.
  // These rays really enter the original GLB cover almost immediately.
  const portrait=size.width/size.height<1.05,normal=new THREE.Vector3(portrait?.09:.18,portrait?-.12:.055,1).normalize();
  const right=new THREE.Vector3(0,1,0).cross(normal).normalize(),up=normal.clone().cross(right);
  const old={centre:{x:size.width/size.height*(portrait?.025:.255),y:portrait?-.245:.035,z:-.52},normal,right,up,scale:portrait?.49:.46};
  const oldReceiver=carrierPlaneCorners(old,size).map(point=>initial.aim.clone().addScaledVector(initial.right,point.x*initial.span).addScaledVector(initial.vertical,point.y*initial.span).addScaledVector(initial.backward,point.z*initial.span));
  const aperture=actual.physicalProjector(),coverZ=realCoverBounds.max.z+model.position.z;
  oldReceiver.forEach((target,index)=>{
    const source=aperture.corners[index],ray=target.clone().sub(source);
    assert(ray.dot(aperture.normal)<0,"The fixture detects the previous receiver behind the real glass");
    const fraction=(coverZ-source.z)/ray.z,hit=source.clone().addScaledVector(ray,fraction).sub(model.position);
    assert(fraction>0&&fraction<.06&&hit.x>realCoverBounds.min.x&&hit.x<realCoverBounds.max.x&&hit.y>realCoverBounds.min.y&&hit.y<realCoverBounds.max.y,"The old ray crosses the actual GLB cover in its first 6%");oldBackwardsRayCases++;
  });
  // A mid-flight orientation change rebuilds both optical layers atomically.
  const resized={width:size.height,height:size.width};actual.container.clientWidth=resized.width;actual.container.clientHeight=resized.height;camera.aspect=resized.width/resized.height;
  actual.setProjectionPresentation(carrierCue(5000));const resizedSample=actual.advance(originalPosition,originalAim,fov,.1,1/60);
  const resizedFrame=carrierFrame(carrierCue(5000),resized,{left:0,top:0,width:resized.width,height:resized.height},resizedSample);
  actual.projectionCamera.receiver.forEach((point,index)=>{const screen=point.clone().project(camera);close(resizedFrame.corners[index].x,(screen.x+1)*resized.width/2,"Resize keeps actual beam and DOM receiver X together",1e-6);close(resizedFrame.corners[index].y,(1-screen.y)*resized.height/2,"Resize keeps actual beam and DOM receiver Y together",1e-6);for(const source of aperture.corners)assert(point.clone().sub(source).dot(aperture.normal)>=.9-1e-8,"Responsive reconstruction preserves physical forward clearance");});
  actual.setProjectionPresentation(0);actual.advance(originalPosition,originalAim,fov,.1,1/60);
  assert.equal(actual.projectionCamera,undefined,"Only the completed return releases the fixed rig");actual.endProjection();assert.equal(actual.projectionPreparation,undefined);
}
appearance.dispose(selectedPort);appearance.dispose(returningPort);appearance.disposeSources();
for(const inst of backgroundPorts){inst.material.dispose();inst.dispose();}
for(const geometry of new Set(portMeshes.map(mesh=>mesh.geometry)))geometry.dispose();

console.log(JSON.stringify({checks:"Uniform presentation time, source/beam/frame/image causal timing, 600ms completed-image hold, C2 one-way camera approach, stall-safe time, exact landing and bounded reversals; actual Scene methods with GLB-derived front glass, on-screen/front-facing/stable-camera gating, smooth rotated-entry preparation/cancellation, positive forward rays against the original cover, fixed world plane, physical beam/DOM agreement through resize, scaled-stage synchronization and complete optical cleanup",reversalCases,actualSceneCases,oldBackwardsRayCases,scaledPainterCases,opticalLifecycleCases:2,projectorBackgroundGroups:backgroundPorts.length,minimumPhysicalClearance,maxProjectionErrorPx:maxProjectionError,maxExposedOverlap},null,2));
