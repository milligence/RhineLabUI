// Public fixture copied from projection-ui-review.ts to keep both entry points free of import side effects.
// Keep the production surface styles in the same order as src/main.ts.
// archive-template owns the optical tokens used by every projection surface.
import "../src/style.css";
import "../src/quality-settings.css";
import "../src/responsive.css";
import "../src/archive-template.css";
import "../src/projection.css";
import "../src/archive-entry.css";
import "./projection-cinematic-review.css";
import { carrierCamera, carrierCameraProgress, projectOpticalPoint, CARRIER_ENTRANCE_MS, CARRIER_RETURN_MS, type CarrierSample } from "../src/carrier-flight";
import { ProjectionViewer } from "../src/projection-viewer";
import { paintTheme } from "../src/theme-ui";
import type { ArchiveRecord } from "../src/data";
import type { ResearchNode, ResearchProjectionData } from "../src/projection-types";
import collection from "../content/fixtures/array-5x10.json";

// Deliberately fictional. The review bundle must never import private records.
const titles = [
  "最初记录", "建立参照", "偏离的样本", "重新测量", "暂缓试作", "材料分歧",
  "独立核对", "交接记录", "第一次修正", "重复观察", "保留疑问", "重新选取条件",
  "在新的观察条件下重新检查旧方案", "边界试验", "撤回判断", "限制变量", "第二次试作", "不完整的对照",
  "确定观察点", "共同检验", "保留旧样本", "拆分问题", "修订顺序", "未通过的方案",
  "回到起点", "另一条路径", "对照的缺口", "重新解释", "暂停记录", "两线合流",
  "复核结果", "复现构造", "留下边界", "编入档案", "继续观察", "未完成的方向",
];
const sideIndices = new Set([2, 5, 8, 11, 14, 17, 20, 23, 26, 28, 29, 32, 35]);
const sourceUrl = "https://github.com/milligence/RhineLabUI/blob/f82e1d2cf6419fa029fb488ade88f90574e83399/README.md";
const longRecord = [
  "观察员将前一轮留下的样本重新排列。记录中的差异仍然存在，但原来的比较方式同时改变了两项条件。她暂停后续试作，要求每一份结果都能对应到同一份参照。",
  "负责复核的记录员提出保留旧方案，再补充一次测量。观察员选择先拆开问题：只改变观察位置，材料、光照和记录方法沿用原来的设置。新的记录因此能够回答一个更窄的问题。",
  "第二天的测量没有重现最初的优势。团队保留了这项负结果，并将旧结论退回待验证状态。失效的是那次解释，已有样本仍然可以用于检查下一项猜想。",
  "两名记录员交换了工作。先前负责制作的人重新阅读原始笔记，先前负责观察的人独立重建样本。他们在交接中发现，两个相同的名称曾指向不同的操作。",
  "新的记录先写出操作，再记录结果。每一项修订都留下日期和提出者。下一轮试作开始之前，两人分别复述了彼此的理解，并核对了所有被保留的条件。",
  "这次对照缩小了差异。仍然没有解释的部分被单独标出，没有随整份方案一同归档。研究的下一步由这些余下的问题决定。",
  "本段为公开排版与交互样本。它用于检查长正文、连续段落、滚动区域和来源定位；其中的人物、事件与观察结果均为合成内容。",
];
const nodes: ResearchNode[] = titles.map((title, i) => {
  const branch = sideIndices.has(i);
  const stamp = new Date(Date.UTC(2000, 0, i + 1)).toISOString().slice(0, 10).replaceAll("-", ".");
  return {
    id: `T${String(i + 1).padStart(2, "0")}`, title, date: stamp, stage: i, lane: branch ? 1 : 0,
    phase: Math.min(4, Math.floor(i / 8)), thread: branch ? "旁支观察" : "主要记录",
    role: branch ? (i % 2 ? "component" : "branch") : "spine",
    position: { x: 120 + i * 94, y: branch ? (i % 2 ? 740 : 150) : 450 + (Math.floor(i / 8) % 2) * 36 },
    status: i === 14 ? "negative" : i === 28 ? "paused" : i === 35 ? "open" : i % 5 === 0 ? "question" : "tested",
    evidence: "公开合成记录 · 用于观察布局与交互",
    question: i === 12 ? "当比较条件已经发生变化，旧结论是否仍然成立？" : "当前记录改变了下一次观察的哪项条件？",
    attempt: "固定参照后重复观察。", result: "保留结果并重新安排下一次试作。",
    interpretation: "先核对能够复现的部分，再决定下一项工作。",
    record: i === 12 ? longRecord : longRecord.slice(i % 3, i % 3 + 2),
    retrospective: i === 2 || i === 35 ? [] : ["这份记录改变了工作的顺序。结论被重新检查时，角色也开始明确各自承担的判断。", "后来的复核将当时混在一起的条件分开，保留了原始观察，也收窄了可以成立的解释。"],
    retrospectiveDate: "2000.03.01",
    sources: Array.from({ length: i === 12 ? 4 : 1 }, (_, j) => ({ label: `公开依据 ${j + 1} · 样本与编排说明`, url: sourceUrl })),
    retrospectiveSources: i === 2 || i === 35 ? [] : [{ label: "公开复盘 · 记录层次说明", url: sourceUrl }],
  };
});
const route = nodes.filter((_, i) => !sideIndices.has(i));
const edges: ResearchProjectionData["edges"] = route.slice(1).map((node, i) => ({ from: route[i].id, to: node.id, kind: "continuation", weight: "primary" }));
let mergeCount = 0;
for (const index of sideIndices) {
  const previous = route.filter(node => node.stage < index).at(-1)!;
  const next = route.find(node => node.stage > index);
  edges.push({ from: previous.id, to: nodes[index].id, kind: index % 4 === 2 ? "correction" : "branch", weight: "secondary", label: index % 4 === 2 ? "重新检查" : "旁支试验" });
  if (next && mergeCount++ < 4) edges.push({ from: nodes[index].id, to: next.id, kind: "merge", weight: "secondary", label: "带回观察结果" });
}
const research: ResearchProjectionData = {
  kind: "research", label: "研究进程", description: "36 个公开合成节点，包含主线、旁支、修正、合流、长记录和未留复盘的记录。",
  layout: "evolution", entryNodeId: "T13", nodes, edges, narrativePath: route.map(node => node.id),
  retrospectiveDate: "2000.03.01",
  phases: ["建立参照", "重新检查", "拆开问题", "合并线索", "留下记录"].map((title, id) => ({ id, title, date: `2000 / ${String(id + 1).padStart(2, "0")}`, entryNodeId: nodes[Math.min(id * 8, 35)].id, summary: `第 ${id + 1} 阶段的公开合成阅读样本。` })),
};
const researchRecord = {
  id: "Q-001", title: "观察记录", en: "A RECORD OF OBSERVATIONS", department: "公开布局样本", category: "研究记录",
  date: "2000.01—03", lead: "合成角色", clearance: "REVIEW", image: "", source: sourceUrl,
  abstract: "公开合成记录，仅用于界面验收。", findings: ["本样本没有载入私人研究正文。"], projection: research,
} as ArchiveRecord;
const publicCube = collection.records.find(record => record.projection?.kind === "cube");
if (!publicCube) throw new Error("The public collection has no Cube fixture");
const cubeRecord = structuredClone(publicCube) as ArchiveRecord;
cubeRecord.id = "Q-002"; cubeRecord.title = "空间构造"; cubeRecord.en = "SPATIAL OBSERVATORY";
if (cubeRecord.projection?.kind === "cube") {
  cubeRecord.projection.label = "空间操作台";
  const base = cubeRecord.projection.experiments[0];
  const passage = structuredClone(base), interior = structuredClone(base);
  passage.id = "public-passage"; passage.title = "贯通孔道 · 合成构造";
  passage.description = "从公开完整格阵移除同一条直线上的三格，观察开口、内壁与遮挡。";
  const passageState = passage.state as { present: number[] };
  for (const index of [4, 13, 22]) passageState.present[index] = 0;
  passage.retrospective = ["本构造仅由公开格阵删去三格，用于界面与不透明内壁检查，不附数学最优性主张。"];
  interior.id = "public-interior"; interior.title = "中心空格 · 内部观察";
  interior.description = "仅移除中心格，将观察位置置于中心，区分自由检视与内部取景。";
  const interiorState = interior.state as { present: number[]; observer: { mode: string; eye: number[]; target: number[]; fov: number } };
  interiorState.present[13] = 0;
  Object.assign(interiorState.observer, { mode: "fixed", eye: [0, 0, 0], target: [1, .2, .6], fov: 90 });
  interior.retrospective = ["观察位置保持在空格内。转动自由检视镜头不会改变 O，进入取景后才能检查观察方向。"];
  cubeRecord.projection.experiments.push(passage, interior);
}

const scope = "rhine-projection-cinematic-review";
const stage = document.querySelector<HTMLElement>("#viewport")!;
const calibration = document.createElement("div");
calibration.className = "cinematic-calibration";
calibration.setAttribute("aria-hidden", "true");
calibration.innerHTML = `<svg preserveAspectRatio="none"><polygon class="cinematic-calibration-plate"/><path class="cinematic-calibration-inset"/><path class="cinematic-calibration-markers"/><path class="cinematic-calibration-aperture"/><g class="cinematic-calibration-label"><text class="cinematic-calibration-code" x="0" y="0">OPTICAL CALIBRATION / 01</text><text class="cinematic-calibration-title" x="0" y="22">合成光源标定</text></g></svg><div class="cinematic-calibration-caption"><strong>PUBLIC OPTICAL REVIEW</strong><span>此平面仅提供光源标定，未载入档案实体。投影、成像与镜头计算来自生产组件；实体与三维遮挡另行验收。</span></div>`;
stage.appendChild(calibration);
paintTheme(0);
const viewer = new ProjectionViewer(stage);
let active: "research" | "cube" = "research";
let elapsedMs = 0, cameraProgress = 0, running = false, reduced = false, speed = 1;
let raf = 0, previousRaf = 0, lastReport = 0;
let mode: "entrance" | "return" | "reopen" = "entrance";
let intents: { at: number; action: "return" | "reopen" }[] = [];
const record = () => active === "research" ? researchRecord : cubeRecord;
const stepMs = 1000 / 60;

function calibrationGeometry() {
  const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
  const viewport = { width, height }, aspect = width / height, portrait = aspect < 1.05;
  const rig = carrierCamera(cameraProgress, viewport, 12);
  const centre = { x: aspect * (portrait ? -.055 : -.27), y: portrait ? .235 : -.13, z: 0 };
  const halfWidth = portrait ? Math.min(.18, aspect * .20) : Math.min(.22, aspect * .115), halfHeight = portrait ? .042 : .065;
  const project = (x: number, y: number) => projectOpticalPoint({ x: centre.x + x, y: centre.y + y, z: centre.z }, rig, viewport);
  const aperture = [project(halfWidth * .28, halfHeight + .004), project(halfWidth * .82, halfHeight + .004),
    project(halfWidth * .82, halfHeight - .008), project(halfWidth * .28, halfHeight - .008)] as NonNullable<CarrierSample["corners"]>;
  const edge = [aperture[0], aperture[1]] as NonNullable<CarrierSample["edge"]>;
  const outline = [project(-halfWidth, halfHeight), project(halfWidth, halfHeight), project(halfWidth, -halfHeight), project(-halfWidth, -halfHeight)];
  return { viewport, project, halfWidth, halfHeight, edge, aperture, outline, origin: project(halfWidth * .55, halfHeight - .002) };
}

function drawCalibration() {
  const { viewport, project, halfWidth: w, halfHeight: h, aperture } = calibrationGeometry();
  const svg = calibration.querySelector("svg")!;
  svg.setAttribute("viewBox", `0 0 ${viewport.width} ${viewport.height}`);
  const point = (p: { x: number; y: number }) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  const corners = [project(-w, h), project(w, h), project(w, -h), project(-w, -h)];
  calibration.querySelector("polygon")!.setAttribute("points", corners.map(point).join(" "));
  const path = (points: { x: number; y: number }[]) => "M" + points.map(point).join(" L");
  calibration.querySelector(".cinematic-calibration-inset")!.setAttribute("d", path([project(-w + .007, h - .007), project(w - .007, h - .007), project(w - .007, -h + .007), project(-w + .007, -h + .007)]) + " Z");
  calibration.querySelector(".cinematic-calibration-aperture")!.setAttribute("d", path(aperture) + " Z");
  const ticks = Array.from({ length: 13 }, (_, i) => {
    const x = -w * .82 + w * 1.64 * i / 12;
    return path([project(x, -h + .01), project(x, -h + (i % 3 ? .015 : .021))]);
  });
  calibration.querySelector(".cinematic-calibration-markers")!.setAttribute("d", ticks.join(" "));
  const anchor = project(-w * .78, h * .3), across = project(w * .78, h * .3);
  const scale = Math.hypot(across.x - anchor.x, across.y - anchor.y) / Math.max(1, w * 1.56 * viewport.height);
  const angle = Math.atan2(across.y - anchor.y, across.x - anchor.x) * 180 / Math.PI;
  calibration.querySelector(".cinematic-calibration-label")!.setAttribute("transform", `translate(${anchor.x},${anchor.y}) rotate(${angle}) scale(${scale})`);
  const opacity = Math.max(0, 1 - viewer.getStats().flight.environment!);
  calibration.style.opacity = Number.isFinite(opacity) ? String(opacity) : "1";
}

function sampleCalibration(): CarrierSample {
  const { origin, edge, aperture, outline } = calibrationGeometry();
  const bounds = stage.getBoundingClientRect();
  const screen = (p: { x: number; y: number }) => ({ x: bounds.left + p.x * bounds.width / stage.clientWidth, y: bounds.top + p.y * bounds.height / stage.clientHeight });
  return { origin: screen(origin), edge: edge.map(screen) as NonNullable<CarrierSample["edge"]>,
    corners: aperture.map(screen) as NonNullable<CarrierSample["corners"]>, outline: outline.map(screen) };
}

function report() {
  window.parent.postMessage({ scope, event: "state", width: innerWidth, height: innerHeight,
    elapsedMs, running, reduced, speed, mode, entranceMs: CARRIER_ENTRANCE_MS, returnMs: CARRIER_RETURN_MS,
    source: "labelled synthetic calibration plane; no archive GLB", stats: viewer.getStats() }, "*");
}

function stop() { running = false; cancelAnimationFrame(raf); raf = 0; previousRaf = 0; }
function options() {
  return {
    reducedMotion: reduced, manualClock: true,
    onClose: () => { stop(); drawCalibration(); report(); },
    onPresentation: (phase: number) => { cameraProgress = carrierCameraProgress(phase); return { phase, progress: cameraProgress, perspective: 12 }; },
    sampleCarrier: sampleCalibration,
  };
}

function restart(kind = active) {
  stop(); viewer.close(true);
  active = kind; elapsedMs = 0; cameraProgress = 0; mode = "entrance"; intents = [];
  viewer.open(record(), options());
  drawCalibration(); report();
}

function advanceTo(target: number) {
  // The real clock deliberately clamps long stalls. Seeking therefore replays
  // fixed display-sized steps, rather than writing an artificial flight value.
  while (elapsedMs < target - .00001 && viewer.isOpen) {
    elapsedMs = Math.min(target, elapsedMs + stepMs);
    viewer.advancePresentation(elapsedMs);
  }
  drawCalibration();
}

function seek(value: number) {
  if (!Number.isFinite(value)) throw new Error("入场时间必须为有效数字。");
  const target = Math.max(0, Math.min(CARRIER_ENTRANCE_MS, value));
  restart(); advanceTo(target); report();
}

function applyIntent(action: "return" | "reopen") {
  if (action === "return") { viewer.close(); mode = "return"; }
  else { viewer.open(record(), options()); mode = "reopen"; }
}

function previousFrame() {
  const target = Math.max(0, elapsedMs - stepMs);
  const history = intents.filter(intent => intent.at <= target);
  restart();
  for (const intent of history) { advanceTo(intent.at); applyIntent(intent.action); }
  advanceTo(target); intents = history;
}

function tick(now: number) {
  if (!running) return;
  const delta = previousRaf ? Math.min(64, Math.max(0, now - previousRaf) * speed) : 0;
  previousRaf = now;
  // Continuous playback submits one production frame per display frame.
  // Only explicit seeks need the replay loop above; using it here would paint
  // twice whenever a real RAF interval slightly exceeds the 60 Hz step.
  elapsedMs += delta;
  viewer.advancePresentation(elapsedMs);
  drawCalibration();
  const state = viewer.getStats();
  if (!state.open || state.phase === "open") stop();
  if (now - lastReport > 80 || !running) { lastReport = now; report(); }
  if (running) raf = requestAnimationFrame(tick);
}

function play() {
  if (running) return;
  if (!viewer.isOpen || viewer.getStats().phase === "open") restart();
  running = true; previousRaf = 0; raf = requestAnimationFrame(tick); report();
}

window.addEventListener("message", event => {
  if (event.source !== window.parent || event.data?.scope !== scope) return;
  const { command, value } = event.data;
  try {
    if (command === "restart") { restart(value === "cube" ? "cube" : value === "research" ? "research" : active); play(); }
    if (command === "play") { if (running) stop(); else play(); }
    if (command === "pause") stop();
    if (command === "seek") seek(Number(value));
    if (command === "step") { stop(); if (Number(value) < 0) previousFrame(); else advanceTo(elapsedMs + stepMs); }
    if (command === "return") { stop(); if (viewer.isOpen) { intents.push({ at: elapsedMs, action: "return" }); applyIntent("return"); running = true; previousRaf = 0; raf = requestAnimationFrame(tick); } }
    if (command === "reopen") { stop(); if (!viewer.isOpen) restart(); else { intents.push({ at: elapsedMs, action: "reopen" }); applyIntent("reopen"); } running = true; previousRaf = 0; raf = requestAnimationFrame(tick); }
    if (command === "theme") { paintTheme(value ? 1 : 0); viewer.refreshTheme(); if (viewer.isOpen) viewer.advancePresentation(elapsedMs); drawCalibration(); }
    if (command === "reduced") { reduced = Boolean(value); viewer.setReducedMotion(reduced); if (reduced) stop(); drawCalibration(); }
    if (command === "speed") speed = Math.max(.1, Math.min(2, Number(value) || 1));
    if (command === "focus" && active === "research") viewer.root.querySelector<HTMLButtonElement>('[data-node="T13"]')?.click();
    report();
  } catch (error) { window.parent.postMessage({ scope, event: "error", message: String(error) }, "*"); }
});
window.addEventListener("error", event => window.parent.postMessage({ scope, event: "error", message: event.message }, "*"));
window.addEventListener("unhandledrejection", event => window.parent.postMessage({ scope, event: "error", message: String(event.reason) }, "*"));
window.addEventListener("resize", () => { if (viewer.isOpen) viewer.advancePresentation(elapsedMs); drawCalibration(); report(); });
document.addEventListener("visibilitychange", () => { previousRaf = 0; });
document.addEventListener("click", () => requestAnimationFrame(report));
restart();
document.fonts.ready.then(() => { if (viewer.isOpen) viewer.advancePresentation(elapsedMs); report(); });

