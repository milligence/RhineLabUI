// Read-only numerical observation of the native interactive entry, not a
// renderer substitute or visual acceptance test. Run from repository root:
// node --experimental-strip-types verification/projector-world-2026-11/checks/entry-readiness.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {damp,settlingWave,INSPECTION_LIFT,smooth} from '../../../src/motion.ts';
import {archiveFraming} from '../../../src/viewport-layout.ts';
import {PROJECTOR_APERTURE} from '../../../src/projector-aperture.ts';

const source=readFileSync(new URL('../../../src/scene.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('scene.ts',source,ts.ScriptTarget.Latest,true);
const scene=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='ArchiveScene');
const methods=['physicalProjector','projectionEntryReady'].map(name=>scene.members.find(node=>node.name?.getText(ast)===name).getText(ast));
const context={exports:{},THREE,PROJECTOR_APERTURE,INSPECTION_LIFT};
vm.runInNewContext(ts.transpileModule(`export class EntryGate {${methods.join('\n')}}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);

const selectedBase=-4.6+settlingWave(0,26.56);
const neighborTop=Math.max(...[-5,-4,-3,-2,-1,1,2,3,4,5].map(row=>-4.6+settlingWave(row,26.56)+3.76));
const yaw=THREE.MathUtils.degToRad(59),elevation=THREE.MathUtils.degToRad(19);
const baseDirection=new THREE.Vector3(-Math.sin(yaw)*Math.cos(elevation),Math.sin(elevation),Math.cos(yaw)*Math.cos(elevation));

// The native ordinary-camera equations in ArchiveScene.update, with the
// selected track, shoulder, field, pointer and settled array already at rest.
// The imported production damp/smooth/framing functions remain authoritative.
function targets(state,size){
  const detail=state.detail,distance=THREE.MathUtils.lerp(140,72,detail);
  const direction=baseDirection.clone().lerp(new THREE.Vector3(-.277,.238,.931),detail).normalize();
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
  const up=new THREE.Vector3().crossVectors(direction,right).normalize();
  const framing=archiveFraming(size.width,size.height,7.33,detail,size.width<1100&&size.width/size.height>=1.05);
  const aim=new THREE.Vector3(-1.091,-.045,.481);
  if(framing.portrait)aim.set(0,selectedBase+.4+1.85,-2.17).addScaledVector(up,(framing.previewY-.5)*framing.span);
  const detailAim=state.model.position.clone().add(new THREE.Vector3(0,1.85,0))
    .addScaledVector(right,(.5-framing.detailX)*size.width/size.height*framing.span)
    .addScaledVector(up,(framing.detailY-.5)*framing.span);
  aim.lerp(detailAim,detail);
  return {framing,aim,position:aim.clone().addScaledVector(direction,distance),fov:THREE.MathUtils.radToDeg(2*Math.atan(framing.span/(2*distance)))};
}

function simulate({size,route='array',rotation=0,hz=60,detailTransition=true}){
  const dt=1/hz,model=new THREE.Group();
  const state=Object.assign(Object.create(context.exports.EntryGate.prototype),{
    model,camera:new THREE.PerspectiveCamera(34,size.width/size.height,5,300),cameraAim:new THREE.Vector3(),
    lift:{value:route==='array'?.4:INSPECTION_LIFT,velocity:0},detail:route==='array'?0:1,
    rotation,targetRotation:0,targetDetail:1,returnY:null,cameraResidual:0,
  });
  model.position.set(0,selectedBase+state.lift.value,-2.17);model.rotation.y=rotation;
  const initial=targets(state,size);state.camera.position.copy(initial.position);state.cameraAim.copy(initial.aim);state.camera.fov=initial.fov;
  state.camera.lookAt(state.cameraAim);state.camera.updateProjectionMatrix();state.camera.updateMatrixWorld();
  state.presentedCamera={velocity:new THREE.Vector3(),aimVelocity:new THREE.Vector3(),fovVelocity:0};
  const initialAperture=state.physicalProjector();
  const initialSourceInFrame=initialAperture.corners.every(corner=>{const point=corner.clone().project(state.camera);return Math.abs(point.x)<.94&&Math.abs(point.y)<.94&&point.z>-1&&point.z<1;});
  const lastFailures={},thresholdFirstPass={},trace=[];
  let readyMs,earlyGate;
  for(let index=1;index<=hz*8;index++){
    const time=index*dt,previousPosition=state.camera.position.clone(),previousAim=state.cameraAim.clone(),previousFov=state.camera.fov;
    state.rotation=THREE.MathUtils.lerp(state.rotation,0,1-Math.exp(-dt*(detailTransition?2.8:35)));
    damp(state.lift,INSPECTION_LIFT,detailTransition?4.2:35,dt);
    state.detail=THREE.MathUtils.lerp(state.detail,smooth((state.lift.value-.8)/2.4),1-Math.exp(-dt*(detailTransition?2.8:35)));
    model.position.set(0,selectedBase+state.lift.value,-2.17);model.rotation.y=state.rotation;model.updateMatrixWorld(true);
    const target=targets(state,size),blend=detailTransition?1-Math.exp(-dt*5):1;
    state.camera.position.lerp(target.position,blend);state.cameraAim.lerp(target.aim,blend);state.camera.fov=THREE.MathUtils.lerp(state.camera.fov,target.fov,blend);
    state.camera.lookAt(state.cameraAim);state.camera.updateProjectionMatrix();state.camera.updateMatrixWorld();
    state.cameraResidual=Math.max(state.camera.position.distanceTo(target.position),state.cameraAim.distanceTo(target.aim))/target.framing.span;
    const aperture=state.physicalProjector(),corners=aperture.corners.map(corner=>corner.clone().project(state.camera));
    const facing=aperture.normal.dot(state.camera.position.clone().sub(aperture.centre).normalize());
    const motion=Math.max(state.presentedCamera.velocity.length(),state.presentedCamera.aimVelocity.length())/target.framing.span;
    const checks={lift:state.lift.value>=INSPECTION_LIFT-.01,detail:state.detail>.997,cameraResidual:state.cameraResidual<.004,
      cameraSpeed:motion<.025,fovSpeed:Math.abs(state.presentedCamera.fovVelocity)<.02,rotation:Math.abs(state.rotation)<.002,
      facing:facing>.45,inFrame:corners.every(point=>Math.abs(point.x)<.94&&Math.abs(point.y)<.94&&point.z>-1&&point.z<1),
      clearance:aperture.centre.y>neighborTop+.25};
    for(const [key,pass] of Object.entries(checks)){if(!pass)lastFailures[key]=time;else thresholdFirstPass[key]??=time;}
    const origin=aperture.centre.clone().project(state.camera);
    const row={ms:+(time*1000).toFixed(3),lift:state.lift.value,detail:state.detail,cameraResidual:state.cameraResidual,cameraSpeed:motion,
      fovSpeed:Math.abs(state.presentedCamera.fovVelocity),rotation:state.rotation,facing,originPx:{x:(origin.x+1)*size.width/2,y:(1-origin.y)*size.height/2},failed:Object.keys(checks).filter(key=>!checks[key])};
    trace.push(row);
    if(!earlyGate&&state.lift.value>3.25&&state.detail>.62&&aperture.centre.y>neighborTop+.25)earlyGate=row;
    if(state.projectionEntryReady(target.framing.span,neighborTop,false,aperture)){
      readyMs=time*1000;
      break;
    }
    // Readiness uses the previous *presented* frame's measured derivatives,
    // because ArchiveScene.rememberPresentedFrame runs after the gate.
    state.presentedCamera={velocity:state.camera.position.clone().sub(previousPosition).divideScalar(dt),
      aimVelocity:state.cameraAim.clone().sub(previousAim).divideScalar(dt),fovVelocity:(state.camera.fov-previousFov)/dt};
  }
  const outOfFrameIntervals=[];let outSince;
  for(const frame of trace){if(frame.failed.includes('inFrame'))outSince??=frame.ms;else if(outSince!==undefined){outOfFrameIntervals.push({from:outSince,to:frame.ms});outSince=undefined;}}
  return {size,route,rotation,hz,detailTransition,readyMs:+readyMs.toFixed(3),dominant:trace.at(-2)?.failed??[],
    initialSourceInFrame,firstClearVisibleMs:trace.find(frame=>!frame.failed.some(key=>['inFrame','facing','clearance'].includes(key)))?.ms,outOfFrameIntervals,
    stableThresholdMs:Object.fromEntries(Object.keys(thresholdFirstPass).map(key=>[key,+((lastFailures[key]??0)*1000+1000/hz).toFixed(3)])),
    ready:trace.at(-1),previous:trace.at(-2),oldEarlyGate:earlyGate,
    trace};
}

const results=[];
for(const size of [{width:1920,height:1080},{width:390,height:780}]){
  for(const hz of [30,60,144])results.push(simulate({size,hz}));
  for(const rotation of [0,-.8,.8,Math.PI])results.push(simulate({size,route:'reading',rotation}));
  results.push(simulate({size,detailTransition:false}));
  results.push(simulate({size,route:'reading',rotation:.8,detailTransition:false}));
}
const output={generatedAt:new Date().toISOString(),scope:'Numerical native interactive path; stable selected track and shoulder, no remaining selection wave, no idle displacement, centered pointer, no GPU stalls. Production gate method executed directly. Native damp/detail/framing/camera equations used; not visual acceptance.',
  rotationNote:'Archive inspection input is clamped to +/-0.8 radians (about45.8deg). Pi is a programmatic stress case, not a reachable native reading drag.',selectedBase,neighborTop,results:results.map(({trace,...result})=>result)};
writeFileSync(new URL('./entry-readiness.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
if(process.argv.includes('--trace'))writeFileSync(new URL('../../../.tools/entry-readiness-full-trace.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(output.results.map(({size,route,rotation,hz,detailTransition,readyMs,dominant})=>({size,route,rotation,hz,detailTransition,readyMs,dominant})),null,2));
