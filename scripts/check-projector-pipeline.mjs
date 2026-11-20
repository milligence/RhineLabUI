// Verify the actual Scene pipeline binding and its quality/scale choices.
// Component GPU rendering is covered by browser review; this does not claim it.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';

const source=readFileSync(new URL('../src/scene.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('scene.ts',source,ts.ScriptTarget.Latest,true);
const scene=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='ArchiveScene');
const constructor=scene.members.find(node=>ts.isConstructorDeclaration(node));
const statements=constructor.body.statements;
const start=statements.findIndex(node=>node.getText(ast).startsWith('this.composer = new EffectComposer'));
const end=statements.findIndex(node=>node.getText(ast).startsWith('this.bindPointer'));
assert(start>=0&&end>start);
const methods=['resize','updateProjectorPass'].map(name=>scene.members.find(node=>node.name?.getText(ast)===name));
assert(methods.every(Boolean));

class Composer { passes=[]; addPass(pass){this.passes.push(pass);} }
class Render { constructor(scene,camera){this.scene=scene;this.camera=camera;} }
class AO { enabled=true;setSize(width,height){this.width=width;this.height=height;}setSharing(value){this.sharing=value;} }
class Bokeh { enabled=true;lastDepthTexture=new THREE.Texture();constructor(scene,camera,params,source){Object.assign(this,{scene,camera,params,source});} }
class OpticalPass { enabled=true;constructor(scene,camera,beam,depth){Object.assign(this,{scene,camera,beam,depth});} }
class SMAA {enabled=true;}
class Output {}
const context={exports:{},THREE,EffectComposer:Composer,RenderPass:Render,SharedDepthAO:AO,SharedDepthBokeh:Bokeh,ProjectorBeamPass:OpticalPass,OutputPass:Output,
  resizeQuality:(renderer,composer,container)=>({width:container.clientWidth*renderer.getPixelRatio(),height:container.clientHeight*renderer.getPixelRatio()})};
vm.runInNewContext(ts.transpileModule(`export class Pipeline {
  install(){const container=this.container,lightingLook=this.lightingLook;${statements.slice(start,end).map(node=>node.getText(ast)).join('\n')}}
  ${methods.map(method=>method.getText(ast)).join('\n')}
}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);

const calls=[];
const state=Object.assign(Object.create(context.exports.Pipeline.prototype),{
  scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(6,16/9,5,300),renderer:{getPixelRatio:()=>1.5,shadowMap:{enabled:true}},smaa:new SMAA(),
  projectorBeam:{setPostProcessingEnabled:value=>calls.push(value)},
  container:{clientWidth:1920,clientHeight:1080,closest:()=>({dataset:{layout:'desktop'}}),getBoundingClientRect:()=>({width:1920,height:1080}),dataset:{renderQuality:'{}'}},
  lightingLook:'baseline',renderState:{invalidate(){}},quality:{aoResolution:1,depthOfField:100},aoKernelSize:32,light:{shadow:{mapSize:{x:2048}}},superPerformance:false,
});
state.install();
assert.deepEqual(state.composer.passes.map(pass=>pass.constructor),[Render,AO,Bokeh,OpticalPass,SMAA,Output],
  'The actual Scene composites physical light after depth of field and before anti-aliasing/output');
assert.equal(state.bokeh.params.maxblur,.011,'The original global depth-of-field blur limit is preserved');
assert.equal(state.projectorBeamPass.beam,state.projectorBeam);
assert.equal(state.projectorBeamPass.scene,state.scene);assert.equal(state.projectorBeamPass.camera,state.camera);
assert.equal(state.projectorBeamPass.depth(),state.bokeh.lastDepthTexture,'The overlay samples the exact Bokeh depth source used by the current frame');
const renewedDepth=new THREE.Texture();state.bokeh.lastDepthTexture=renewedDepth;
assert.equal(state.projectorBeamPass.depth(),renewedDepth,'AO-sharing/fallback changes cannot leave a captured stale depth texture');

let qualityCases=0;
for(const [bokeh,superPerformance,expected] of [[true,false,true],[false,false,false],[true,true,false],[false,true,false]]){
  state.bokeh.enabled=bokeh;state.superPerformance=superPerformance;
  state.updateProjectorPass();
  assert.equal(calls.at(-1),expected,'Scene routes light to postprocessing only while depth of field is actually composited');
  assert.equal(state.projectorBeamPass.enabled,expected);
  assert.equal(state.bokeh.enabled,bokeh,'Optical clarity never disables the selected scene depth of field');
  qualityCases++;
}

let scaleCases=0;
for(const [width,height,displayScale,bufferRatio] of [[1920,1080,1,1.5],[1920,1080,2/3,1],[1920,1080,4/3,2],[390,780,1,2],[1920,1080,.5,.4]]){
  state.container.clientWidth=width;state.container.clientHeight=height;
  state.container.getBoundingClientRect=()=>({width:width*displayScale,height:height*displayScale});
  state.renderer.getPixelRatio=()=>bufferRatio;state.superPerformance=false;state.bokeh.enabled=true;
  state.resize();
  assert(Math.abs(state.projectorPixelRatio-bufferRatio/displayScale)<1e-12,'Beam fringe widths use rendered pixels per displayed CSS pixel, including stage scale');
  assert.equal(state.ao.sharing,true,'The existing full-quality shared-depth optimization remains active');
  scaleCases++;
}
renewedDepth.dispose();
console.log(JSON.stringify({passed:true,scope:'Actual Scene constructor/quality/resize binding with inert pipeline components; no GPU or visual acceptance claim.',qualityCases,scaleCases,checks:['post-Bokeh/pre-SMAA ordering','current packed depth binding','original DOF preserved','direct/DOF-off hardware-depth route','drawing-buffer and displayed-stage ratio']},null,2));
