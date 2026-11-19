import assert from "node:assert/strict";
import { test } from "node:test";
import { validateContent } from "./archive-content.mjs";

// Independent synthetic records only. No private archive data is loaded here.
function specimen() {
  const node = (id, stage, role, phase) => ({
    id, title: id, date: "2020.01.01", stage, lane: 0, role, phase,
    position: { x: stage * 300, y: role === "component" ? 400 : 200 },
    status: "tested", evidence: "Synthetic evidence",
    question: "", attempt: "", result: "", interpretation: "",
    record: ["A synthetic observation."], retrospective: [], sources: [],
  });
  const projection = {
    kind: "research", label: "Synthetic research", description: "Schema fixture",
    layout: "evolution", entryNodeId: "begin", narrativePath: ["begin", "decision", "conclusion"],
    nodes: [
      node("begin", 0, "spine", 0), node("decision", 1, "spine", 0),
      node("experiment", 2, "component", 1), node("conclusion", 3, "spine", 1),
    ],
    edges: [
      { from: "begin", to: "decision", kind: "continuation", weight: "primary" },
      { from: "decision", to: "experiment", kind: "branch", weight: "secondary" },
      { from: "decision", to: "conclusion", kind: "continuation", weight: "primary" },
      { from: "experiment", to: "conclusion", kind: "merge", weight: "secondary" },
    ],
    phases: [
      { id: 0, title: "Question", date: "2020.01", entryNodeId: "begin" },
      { id: 1, title: "Experiment", date: "2020.02", entryNodeId: "experiment" },
    ],
  };
  return {
    layout: "collection", categories: ["Synthetic"], columns: ["Synthetic"],
    records: [{
      id: "X-001", title: "Synthetic", en: "SYNTHETIC", department: "Fixture",
      category: "Synthetic", date: "2020", lead: "Fixture", clearance: "Fixture",
      abstract: "A public synthetic validation fixture.", findings: ["Synthetic finding."],
      source: "", image: "", projection,
    }],
  };
}
function mutated(change) {
  const content = specimen();
  change(content.records[0].projection);
  return content;
}

test("a narrative route can omit a side experiment while preserving the full tree", () => {
  const content = specimen();
  assert.equal(validateContent(content), content);
  assert.equal(content.records[0].projection.nodes.length, 4);
  assert.equal(content.records[0].projection.narrativePath.length, 3);
});

test("legacy research catalogs remain valid without authored evolution fields", () => {
  const content = mutated(p => {
    delete p.layout; delete p.entryNodeId; delete p.narrativePath;
    for (const n of p.nodes) { delete n.role; delete n.position; delete n.record; }
    for (const edge of p.edges) { delete edge.kind; delete edge.weight; }
    for (const phase of p.phases) delete phase.entryNodeId;
  });
  assert.doesNotThrow(() => validateContent(content));
  delete content.records[0].projection;
  assert.doesNotThrow(() => validateContent(content), "Ordinary archives still do not require a projection");
});

test("main routes reject missing, repeated and too few node references", () => {
  for (const path of [["begin","missing"],["begin","decision","begin"],["begin"],[], "begin"]) {
    assert.throws(() => validateContent(mutated(p => { p.narrativePath = path; })), /研究主线节点无效或重复/);
  }
});

test("main routes cannot reverse chronology or conceal equal-time steps", () => {
  assert.throws(() => validateContent(mutated(p => { p.narrativePath = ["decision","begin"]; })), /研究主线必须沿时间推进/);
  assert.throws(() => validateContent(mutated(p => {
    p.nodes[2].stage = p.nodes[1].stage; p.edges = [];
    p.narrativePath = ["decision","experiment"];
  })), /研究主线必须沿时间推进/);
});

test("evolution layouts require a complete set of finite viewport coordinates", () => {
  assert.throws(() => validateContent(mutated(p => { delete p.nodes[2].position; })), /演化树需要完整布局坐标/);
  for (const position of [null, {}, {x:0}, {x:-1,y:0}, {x:0,y:20001}, {x:NaN,y:1}, {x:1,y:Infinity}, {x:"300",y:0}]) {
    assert.throws(() => validateContent(mutated(p => { p.nodes[2].position = position; })), /研究布局坐标无效/);
  }
  assert.doesNotThrow(() => validateContent(mutated(p => { p.nodes[2].position = {x:0,y:20000}; })));
  assert.doesNotThrow(() => validateContent(mutated(p => { p.nodes[2].position = {x:300.25,y:410.75}; })));
});

test("entry references and phase membership cannot silently target absent nodes", () => {
  assert.throws(() => validateContent(mutated(p => { p.entryNodeId = "missing"; })), /研究入口节点不存在/);
  assert.throws(() => validateContent(mutated(p => { p.phases[1].entryNodeId = "missing"; })), /研究阶段入口不存在/);
  assert.throws(() => validateContent(mutated(p => { p.nodes[2].phase = 77; })), /研究节点阶段不存在/);
});

test("unknown visual roles, line semantics and layouts fail explicitly", () => {
  assert.throws(() => validateContent(mutated(p => { p.nodes[2].role = "milestone"; })), /研究节点角色无效/);
  assert.throws(() => validateContent(mutated(p => { p.edges[1].kind = "speculative"; })), /研究连线类型无效/);
  assert.throws(() => validateContent(mutated(p => { p.edges[1].weight = "heavy"; })), /研究连线权重无效/);
  assert.throws(() => validateContent(mutated(p => { p.layout = "timeline"; })), /研究布局类型无效/);
});

test("contemporary records accept complete paragraphs and reject invalid members", () => {
  assert.doesNotThrow(() => validateContent(mutated(p => { p.nodes[2].record = ["A first observation.", "A later result."]; })));
  for (const record of ["A single string", [""], ["A paragraph.", null], [42]]) {
    assert.throws(() => validateContent(mutated(p => { p.nodes[2].record = record; })), /当时记录必须为段落数组/);
  }
});
