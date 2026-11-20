import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { installProjectorAperture, setProjectorAperturePower, PROJECTOR_APERTURE } from "../src/projector-aperture.ts";
import { themeMaterial } from "../src/theme-material.ts";
import { CarrierFlight, CarrierPresentationClock, CARRIER_ENTRANCE_MS, CARRIER_RETURN_MS, carrierCameraProgress, carrierCamera, carrierFrame, carrierLocalPoint, projectOpticalPoint, carrierCue, carrierInertiaOffset } from "../src/carrier-flight.ts";
import { archiveFraming, viewportLayout } from "../src/viewport-layout.ts";

const close = (a, b, message, epsilon = 1e-7) => assert(Math.abs(a - b) < epsilon, message + ": " + a + " / " + b);
const viewport = { width: 1440, height: 960 };
const box = { left: 46, top: 98, width: 1348, height: 824 };
const flight = new CarrierFlight();
flight.move(1, 0, CARRIER_ENTRANCE_MS);
const sample = time => carrierFrame(flight.step(time), viewport, box);
const ignition = sample(600), beam = sample(700), beamArrived = sample(1100), frameClosed = sample(1750), forming = sample(2300), held = sample(3300), transfer = sample(4800), arrived = sample(CARRIER_ENTRANCE_MS);
assert.equal(ignition.image, 0, "The physical source lights before any image appears");
assert(ignition.sourcePower > .9 && ignition.environment === 0);
assert(ignition.camera > 0 && ignition.camera < .01, "Ignition has a quiet drift rather than another stationary camera start");
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
const coexistStart = carrierFrame(carrierCue(3000), viewport, box), coexistEnd = carrierFrame(carrierCue(3650), viewport, box);
assert.equal(coexistStart.contentResolve, 1); assert.equal(coexistEnd.contentResolve, 1);
assert(coexistEnd.camera > coexistStart.camera, "The 650ms coexistence keeps a continuous low-speed drift");
assert.deepEqual(coexistStart.rig.centre, coexistEnd.rig.centre, "The receiving plane stays fixed while the camera drifts");
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

// Finite entry inertia retains the displayed camera's first two derivatives,
// then rejoins the fixed plane path without translating that plane.
const velocity = {x:.12,y:-.07,z:.2}, acceleration = {x:-.03,y:.04,z:-.09};
const h=1e-5, q0=carrierInertiaOffset(0,velocity,acceleration), q1=carrierInertiaOffset(h,velocity,acceleration), q2=carrierInertiaOffset(2*h,velocity,acceleration);
for (const axis of ["x","y","z"]) {
  close(q0[axis],0,"Entry inertia starts at the displayed position");
  close((q1[axis]-q0[axis])/h,velocity[axis],"Entry camera velocity continues",1e-5);
  close((q2[axis]-2*q1[axis]+q0[axis])/(h*h),acceleration[axis],"Entry camera acceleration continues",1e-3);
}
assert.deepEqual(carrierInertiaOffset(.8,velocity,acceleration),{x:0,y:0,z:0});
assert.deepEqual(carrierInertiaOffset(1.2,velocity,acceleration),{x:0,y:0,z:0});

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
  const run = new CarrierFlight(); run.move(1,0,CARRIER_ENTRANCE_MS); run.step(closing);
  run.move(0,closing,Math.max(850,run.value*CARRIER_RETURN_MS)); run.step(closing+reopening);
  run.move(1,closing+reopening,Math.max(900,(1-run.value)*CARRIER_ENTRANCE_MS));
  for (let time=closing+reopening;time<closing+reopening+CARRIER_ENTRANCE_MS+300;time+=10) {
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
  assert(last.backward.x > .05, "The camera actually orbits towards the image");
  assert(Math.abs(last.backward.y) > .04, "Focal transfer also changes elevation");
  close(last.perspective,first.perspective,"Dolly must not be cancelled by changing the lens");
  const lastDistance = Math.hypot(last.position.x-last.aim.x,last.position.y-last.aim.y,last.position.z-last.aim.z);
  assert(lastDistance < perspective*.51, "The camera approaches the optical plane in depth");

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
    const p=step/200, progress=carrierCameraProgress(p);
    const pose=carrierCamera(progress,size,perspective);
    const presented={perspective,progress,phase:p};
    // The entry camera may still carry finite inertia. Exercise its real
    // normalized pose override, including a noncanonical up vector.
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
  optics:{dispose:()=>{disposedOptics++;}},research:{dispose:()=>{disposedContent++;}},
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
appearance.dispose(selectedPort);appearance.dispose(returningPort);appearance.disposeSources();
for(const inst of backgroundPorts){inst.material.dispose();inst.dispose();}
for(const geometry of new Set(portMeshes.map(mesh=>mesh.geometry)))geometry.dispose();

console.log(JSON.stringify({checks:"Readable ignition, geometric beam growth, closed-frame-first image reveal and continuous coexistence drift, stall-safe presentation time, real orbit and fixed-lens dolly, exact landing, C2 reversals, bounded braking, Three/CSS alignment, responsive carrier separation, drawn-frame synchronization, finite entry inertia, complete drawn-phase synchronization, scaled-stage production painting and rectangular optical-source alignment, settled mask removal and resource/input cleanup",reversalCases,scaledPainterCases,opticalLifecycleCases:2,projectorBackgroundGroups:backgroundPorts.length,maxProjectionErrorPx:maxProjectionError,maxExposedOverlap},null,2));
