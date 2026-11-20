import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { buildResearchFormation, sampleResearchNode, sampleResearchEdge } from "../src/research-formation.ts";

// Exercise the actual public 36-node review fixture without importing its DOM
// entry point. Private content is neither opened nor reproduced in this check.
const source = readFileSync(new URL("../reference/projection-cinematic-review.ts", import.meta.url), "utf8");
const start = source.indexOf("const titles ="), end = source.indexOf("const researchRecord =");
assert(start >= 0 && end > start, "The public review fixture must be located explicitly");
const context = {};
vm.runInNewContext(ts.transpileModule(source.slice(start, end) + "\nglobalThis.fixture = research;", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText, context, { timeout: 2000 });
const fixture = JSON.parse(JSON.stringify(context.fixture));
assert.equal(fixture.nodes.length, 36);

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (a, b, c, d, t) => {
  const u = 1 - t;
  return { x: u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x,
    y: u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y };
};
function curveLength(a, b, c, d) {
  let previous = a, length = 0;
  for (let i = 1; i <= 128; i++) { const current = point(a, b, c, d, i / 128); length += distance(previous, current); previous = current; }
  return length;
}
// Offline arc estimates of the real review paths. Runtime integration passes
// the browser's exact getTotalLength() instead; this check needs no browser.
function pathLength(a, b, kind) {
  if (b.x - a.x > 620) {
    const rail = kind === "branch" ? Math.min(a.y, b.y) - 100 : Math.max(a.y, b.y) + 100;
    const first = { x: a.x + 160, y: rail }, last = { x: b.x - 160, y: rail };
    return curveLength(a, {x:a.x+80,y:a.y}, {x:a.x+70,y:rail}, first) + distance(first,last) +
      curveLength(last, {x:b.x-70,y:rail}, {x:b.x-80,y:b.y}, b);
  }
  const bend = Math.max(36, Math.abs(b.x - a.x) * .48);
  return curveLength(a, { x:a.x+bend, y:a.y }, { x:b.x-bend, y:b.y }, b);
}
const nodes = fixture.nodes.map(n => ({ id:n.id, ...n.position, stage:n.stage, lane:n.lane, role:n.role }));
const positions = new Map(nodes.map(n => [n.id,n]));
const edges = fixture.edges.map(e => ({ ...e, length:pathLength(positions.get(e.from),positions.get(e.to),e.kind) }));
const options = { entryNodeId:fixture.entryNodeId, narrativePath:fixture.narrativePath };
const input = JSON.stringify({nodes,edges,options});
const schedule = buildResearchFormation(nodes,edges,options);
assert.equal(JSON.stringify({nodes,edges,options}),input,"Building cues must not rewrite the content or geometry");
assert.equal(schedule.nodes.size,36); assert.equal(schedule.edges.length,edges.length);
assert.deepEqual(schedule.roots,["T01"],"A selected mid-history node cannot become the formation root");

function validate(s) {
  for (const cue of s.nodes.values()) {
    assert(cue.arrival >= 0 && cue.arrival < cue.coreEnd && cue.coreEnd <= .93);
    assert(cue.labelStart >= cue.arrival && cue.labelStart < cue.labelEnd && cue.labelEnd <= .93);
    assert.deepEqual(sampleResearchNode(cue,0),{core:0,label:0});
    assert.deepEqual(sampleResearchNode(cue,1),{core:1,label:1});
    let previous = {core:0,label:0};
    for (let i=0;i<=200;i++) {
      const p=i/200, value=sampleResearchNode(cue,p);
      assert(value.core >= previous.core-1e-12 && value.label >= previous.label-1e-12);
      const saved={...value};sampleResearchNode(cue,1-p);assert.deepEqual(sampleResearchNode(cue,p),saved,"Reverse seeks must revisit the same exposure");
      previous=value;
    }
  }
  for (const cue of s.edges) {
    if(!cue.valid)continue;
    assert(cue.start >= s.nodes.get(cue.from).arrival-1e-12,"A stroke cannot depart before its source exists");
    assert(cue.end > cue.start && cue.end <= .93);
    if(!cue.feedback) assert(s.nodes.get(cue.to).arrival >= cue.end-1e-12,"Merges wait for every forward incoming stroke");
    else assert(cue.start >= s.nodes.get(cue.to).arrival-1e-12,"A feedback stroke follows both established endpoints");
    assert.deepEqual(sampleResearchEdge(cue,0),{growth:0,distance:0,head:0});
    assert.deepEqual(sampleResearchEdge(cue,1),{growth:1,distance:cue.length,head:0});
    for(const fraction of [.1,.25,.5,.75,.9]) {
      const sample=sampleResearchEdge(cue,cue.start+(cue.end-cue.start)*fraction);
      assert(Math.abs(sample.growth-fraction)<1e-10,"Only the front light may ease; true arc-length growth stays linear");
      assert(Math.abs(sample.distance-cue.length*fraction)<1e-7);
      assert(sample.head>=0&&sample.head<=1);
    }
  }
}
validate(schedule);
for(const node of nodes) {
  const outgoing=schedule.edges.filter(e=>e.valid&&!e.feedback&&e.from===node.id);
  const primary=outgoing.filter(e=>e.primary), secondary=outgoing.filter(e=>!e.primary);
  if(primary.length&&secondary.length) assert(Math.min(...primary.map(e=>e.start))<Math.min(...secondary.map(e=>e.start)));
}
assert(Math.min(...schedule.edges.filter(e=>!e.primary).map(e=>e.start))<Math.max(...schedule.edges.filter(e=>e.primary).map(e=>e.end)),"Local branches develop while the trunk continues");
const snapshot=s=>({nodes:[...s.nodes.values()],edges:s.edges.map(({index,...cue})=>cue).sort((a,b)=>`${a.from}/${a.to}`.localeCompare(`${b.from}/${b.to}`)),roots:s.roots});
assert.deepEqual(snapshot(schedule),snapshot(buildResearchFormation([...nodes].reverse(),[...edges].reverse(),options)),"Scheduling cannot depend on data enumeration order");

const specimen=(id,stage=0,lane=0,role="branch")=>({id,stage,lane,role,x:100,y:lane*100});
const complexNodes=[specimen("A",0,0,"spine"),specimen("B",1,0,"spine"),specimen("C",2,0,"spine"),specimen("D",1,1),specimen("isolated",3,3),specimen("E",0,4),specimen("F",1,4)];
const complexEdges=[
  {from:"A",to:"B",length:100,weight:"primary"},{from:"B",to:"C",length:130,weight:"primary"},
  {from:"C",to:"A",length:330,kind:"correction"},{from:"B",to:"D",length:200,kind:"branch"},
  {from:"D",to:"C",length:200,kind:"merge"},{from:"D",to:"B",length:200,kind:"correction"},
  {from:"E",to:"F",length:0},{from:"F",to:"F",length:30},{from:"absent",to:"A",length:100},
];
const complex=buildResearchFormation(complexNodes,complexEdges);
validate(complex);
assert.equal(complex.nodes.size,complexNodes.length);
assert(complex.edges.filter(e=>e.feedback).length>=3,"Feedback cycles and a self-loop must all finish");
assert.equal(complex.edges.at(-1).valid,false,"Missing references are excluded without changing edge/SVG indices");
assert.equal(complex.edges.at(-1).index,complexEdges.length-1);
assert.deepEqual(snapshot(complex),snapshot(buildResearchFormation([...complexNodes].reverse(),[...complexEdges].reverse())));

const siblings=[specimen("source",0,0,"spine"),...Array.from({length:8},(_,i)=>specimen(`s${i}`,1,i+1))];
const siblingEdges=siblings.slice(1).map(n=>({from:"source",to:n.id,length:200,kind:"branch"}));
const sameColumn=buildResearchFormation(siblings,siblingEdges);
validate(sameColumn);
assert.equal(new Set([...sameColumn.nodes.values()].map(n=>n.arrival)).size,siblings.length,"Equal-column, equal-length siblings cannot flash on together");
assert.equal(buildResearchFormation([],[]).nodes.size,0);
validate(buildResearchFormation([specimen("alone")],[]));
assert.throws(()=>buildResearchFormation([specimen("same"),specimen("same")],[]),/Duplicate/);

console.log(JSON.stringify({check:"research formation",publicNodes:schedule.nodes.size,publicEdges:schedule.edges.length,complexNodes:complex.nodes.size,feedbackEdges:complex.edges.filter(e=>e.feedback).length,latestExposure:Math.max(...[...schedule.nodes.values()].map(n=>n.labelEnd)),coreDurationMs:[...schedule.nodes.values()].reduce((range,n)=>[Math.min(range[0],2300*(n.coreEnd-n.arrival)),Math.max(range[1],2300*(n.coreEnd-n.arrival))],[Infinity,0]),result:"passed"}));
