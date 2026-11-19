import "../src/style.css";
import "../src/responsive.css";
import "../src/archive-template.css";
import "../src/archive-entry.css";
import "../src/projection.css";
import "../src/document-decryption.css";
import "../src/decryption.css";
import "./archive-flow-review.css";
import { ArchiveScene } from "../src/scene";
import { ProjectionViewer } from "../src/projection-viewer";
import { DocumentDecryption } from "../src/document-decryption";
import { InspectionOverlay } from "../src/inspection-overlay";
import { viewportLayout, openingLayout } from "../src/viewport-layout";
import { BootSequence } from "../src/boot";
import { webArrayArrival } from "../src/archive-arrival";
import { ARRAY_REVEAL_START } from "../src/boot-motion";
import { ARRAY_OPENING_END } from "../src/wallpaper-opening";
import { superPerformanceQuality } from "../src/wallpaper-quality";
import { fullMotion } from "../src/motion-preferences";
import { paintTheme } from "../src/theme-ui";
import { records, columnFiles, archiveColumns, fileLocation } from "../src/data";
import { fileAtCell } from "../src/archive-loop";
import { detailMarkup, stageMarkup } from "./flow-review-markup.generated";

const $ = selector => document.querySelector(selector);
paintTheme(0);
const stage = $("#stage"), status = $("#review-status"), selector = $("#review-record");
stage.innerHTML = stageMarkup();
$("#loading").remove();$("#skip").hidden=true;$("#pwa-update-notice").hidden=true;
$("#boot-background").insertAdjacentHTML("beforeend",'<div class="boot-white"></div>');
const boot = new BootSequence(stage);
stage.dataset.arrival="web";
const host = $("#three-scene"), detail = $("#detail-content");
const paper = new DocumentDecryption(), inspection = new InspectionOverlay();
let scene, viewer, selected = 0, time = 0, flightElapsed = 0, arrivalTime = null, mode = "archive", playing = false, pendingProjection = false, projectionFromArchive = false, auditing = false;
const history = [], checks = [], failures = [];
selector.innerHTML = records.map((r,i) => `<option value="${i}">${r.id} · ${r.category} · ${r.title}</option>`).join("");
function layout() {
  const coarse=matchMedia("(pointer: coarse)").matches;
  const v = arrivalTime === null ? viewportLayout(innerWidth, innerHeight, coarse) : openingLayout(innerWidth,innerHeight);
  stage.style.width = `${v.width}px`; stage.style.height = `${v.height}px`;
  stage.style.transform = `translate(-50%,-50%) scale(${v.scale})`; stage.dataset.layout = v.kind;
  stage.style.setProperty("--stage-scale",String(v.scale));
  stage.style.setProperty("--opening-width",`${v.width}px`);
  stage.style.setProperty("--opening-height",`${v.height}px`);
  stage.style.setProperty("--opening-scan-scale",String(Math.min(1,v.width/1920)));
  stage.dataset.openingPortrait=String(v.width<v.height);
  $("#viewport").dataset.mobileBoot=String(arrivalTime!==null && (coarse || innerWidth<1100));
  scene?.resize();
}
layout();
window.addEventListener("resize", () => { layout(); if (scene) draw(); });

function stamp(label) {
  const stats = { label, time, flightElapsed, selected: records[selected].id, mode, scene: scene.getStats(), projection: viewer.getStats() };
  history.push(stats); $("#review-stats").textContent = JSON.stringify(stats, null, 2);
  status.textContent = `${records[selected].id} · ${mode} · ${time.toFixed(2)}s · paper ${scene.detailVisibility.toFixed(3)} · ${stats.projection?.beat ?? "—"}`;
  return stats;
}
function cinematic() {
  if (arrivalTime === null) return undefined;
  const arrival = webArrayArrival(arrivalTime, ARRAY_REVEAL_START, ARRAY_OPENING_END);
  return { time: arrivalTime, reveal: arrival.opacity, lift: 0, zoom: 0, arrival };
}
function paintPaper() {
  if (mode === "detail" && !viewer.isOpen) {
    paper.update(time, scene.decryptionFrame, false, scene.detailVisibility);
    detail.style.opacity = String(scene.detailVisibility);
    detail.style.translate = `0 ${(1 - scene.detailVisibility) * 18}px`;
  } else if (mode === "archive") detail.style.opacity = String(scene.detailVisibility);
  detail.inert = scene.detailVisibility < .1 || pendingProjection || viewer.isOpen;
  $("#detail-ui").hidden = mode === "archive" && scene.detailVisibility === 0;
  stage.style.setProperty("--detail-shade", String(scene.detailVisibility));
  inspection.render(scene.decryptionFrame, (x,y) => scene.projectCard(x,y), false);
  if(arrivalTime!==null) {boot.update(arrivalTime,cinematic().arrival);stage.dataset.boot=arrivalTime<25.68?"array":"select";}
  else $("#boot-background").style.opacity="0";
  host.style.opacity = String(arrivalTime === null ? 1 : cinematic().arrival.opacity);
}
function integrate(seconds) {
  const frames = Math.round(seconds * 60);
  for (let i=0;i<frames;i++) {
    time += 1/60;
    if (arrivalTime !== null) {
      arrivalTime += 1/60;
      if (arrivalTime >= ARRAY_OPENING_END) { arrivalTime = null; scene.setMode("archive");stage.dataset.mode="archive";layout(); }
    }
    if (viewer.isOpen) { flightElapsed += 1000/60; viewer.advancePresentation(flightElapsed); }
    scene.update(time, cinematic(), false);
    paintPaper();
    if (pendingProjection && !viewer.isOpen && scene.projectionReady) startProjection();
  }
}
function draw() {
  scene.update(time, cinematic(), true);
  if (viewer.isOpen) viewer.advancePresentation(flightElapsed);
  paintPaper();
  stamp("draw");
}
function advance(seconds, render = true) { integrate(seconds); if (render) draw(); }
function choose(index, navigation) {
  selected = (index + records.length) % records.length;
  selector.value = String(selected); scene.select(selected, navigation);
  const r=records[selected],location=fileLocation(selected),files=columnFiles(location.lane);
  $("#selected-code").textContent=r.id.slice(2);$("#selected-title").textContent=r.title;$("#selected-clearance").textContent=r.clearance;
  $("#archive-category").textContent=r.category;$("#selected-number").textContent=String(files.indexOf(selected)+1).padStart(2,"0");
  $(".count-total").textContent=String(files.length).padStart(2,"0");$("#column-name").textContent=r.category;$("#column-index").textContent=String(location.lane+1).padStart(2,"0");
  $("#column-number").lastChild.textContent=` / ${archiveColumns.length}`;$(".archive-project-file").hidden=!r.projection;
  $("#file-ticks").innerHTML=files.map(i=>`<button data-review-select="${i}" aria-label="选择${records[i].id}" class="${i===selected?"selected":""}"></button>`).join("");
  if (mode === "detail") renderDocument();
}
function renderDocument() {
  detail.style.opacity = "0"; detail.innerHTML = detailMarkup(records[selected], selected, records.length); detail.scrollTop = 0;
  paper.reset(detail, scene.decryptionFrame.phase === "clear");
}
function open() {
  if (viewer.isOpen) return;
  mode = "detail"; stage.dataset.mode = mode; $("#detail-ui").hidden = false;
  scene.setMode("detail"); renderDocument(); stamp("open");
}
function close() {
  if (viewer.isOpen) { viewer.close(); return; }
  pendingProjection = false; delete stage.dataset.projectionPending;
  delete stage.dataset.projectionRoute;
  mode = "archive"; stage.dataset.mode = mode; scene.setMode("archive"); stamp("close");
}
function source() {
  const b = host.getBoundingClientRect();
  const point = (x,y) => { const p = scene.projectCard(x,y); return {x:b.left+p[0]*b.width/host.clientWidth,y:b.top+p[1]*b.height/host.clientHeight}; };
  return {origin:point(.72,2.18),edge:[point(.12,2.18),point(1.32,2.18)]};
}
function startProjection() {
  pendingProjection = false; flightElapsed = 0;
  viewer.open(records[selected], {reducedMotion:false, manualClock:true, sampleCarrier:source,
    onCameraProgress:p=>scene.setProjectionFocus(p), onClose:()=>{delete stage.dataset.projectionPending; if(projectionFromArchive) close(); stamp("projection returned");}});
  stamp("projection requested");
}
function project() {
  if (!records[selected].projection) { status.textContent = "此占位档案没有投影；请选择每组第1或第5份。"; return; }
  if (viewer.isOpen) {
    viewer.open(records[selected], {reducedMotion:false, manualClock:true, sampleCarrier:source,onCameraProgress:p=>scene.setProjectionFocus(p),onClose:()=>{delete stage.dataset.projectionPending;if(projectionFromArchive)close();}});
    return;
  }
  projectionFromArchive = mode !== "detail";
  stage.dataset.projectionRoute = projectionFromArchive ? "array" : "reading";
  stage.dataset.projectionPending = "true";
  if (mode !== "detail") open();
  pendingProjection = true;
  if (scene.projectionReady) startProjection();
}
function check(name, pass, context = {}) { const result={name,pass,...context}; checks.push(result); if(!pass) failures.push(result); }
async function audit() {
  if(auditing) return;
  if(records.length!==50 || archiveColumns.length!==5) {status.textContent="此项巡检需要 five-by-ten 占位集合。";return;}
  auditing=true;checks.length=0;failures.length=0;
  $("#review-controls").querySelectorAll("button,select").forEach(control=>control.disabled=true);
  try {
  playing = false; viewer.close(true); close(); advance(3,false);
  check("five groups of ten", archiveColumns.length === 5 && archiveColumns.every((_,i)=>columnFiles(i).length===10), {counts:archiveColumns.map((_,i)=>columnFiles(i).length)});
  for(let i=0;i<records.length;i++) {
    choose(i); advance(1.5,false);
    const before=scene.getStats();
    check("selection identity", fileAtCell(before.selectedCell)===i,{id:records[i].id,cell:before.selectedCell});
    open(); let firstPaper=null, crossedEarly=false;
    for(let frame=0;frame<480;frame++) {
      advance(1/60,false);
      const s=scene.getStats();
      if(s.paperVisibility>0 && firstPaper===null) firstPaper={after:(frame+1)/60,extraction:s.extraction,residual:s.documentArrival.cameraResidual,clarity:s.decryption.clarity};
      if(s.paperVisibility>0 && (!s.documentArrival.ready || !s.documentArrival.clear)) crossedEarly=true;
    }
    const opened=scene.getStats();
    check("paper follows carrier clearance",!crossedEarly && firstPaper!==null,{id:records[i].id,firstPaper});
    check("open reaches readable state",opened.paperVisibility>.999 && opened.projectionReady,{id:records[i].id,visibility:opened.paperVisibility,ready:opened.projectionReady});
    close(); advance(3,false); const closed=scene.getStats();
    check("return clears paper and outgoing copies",closed.paperVisibility===0 && closed.returningFiles===0 && closed.cameraDetail<.01,{id:records[i].id,paper:closed.paperVisibility,outgoing:closed.returningFiles,cameraDetail:closed.cameraDetail});
    status.textContent=`状态巡检 ${i+1}/${records.length} · ${failures.length} 项失败`;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  for(let lane=0;lane<5;lane++) {
    const files=columnFiles(lane); choose(files[9]); advance(1,false); const first=scene.getStats().selectedCell;
    choose(files[0],{axis:"row",direction:1}); advance(1.5,false); const wrapped=scene.getStats();
    check("forward seam continues physical row",wrapped.selectedCell.row===first.row+1,{lane,from:first,to:wrapped.selectedCell});
    choose(files[9],{axis:"row",direction:-1}); advance(1.5,false); check("reverse seam restores row",scene.getStats().selectedCell.row===first.row,{lane});
    for(const cutoff of [.15,.45,.9,1.6,2.4]) {
      open(); advance(cutoff,false); close(); advance(.2,false); open(); advance(8,false);
      check("interrupted opening resumes",scene.detailVisibility>.999 && scene.projectionReady,{lane,cutoff});
      close(); advance(3,false);
    }
  }
  choose(0); advance(2); stamp("50-record audit complete");
  status.textContent=`完成 ${checks.length} 项状态检查；${failures.length} 项失败。实际画面仍需逐帧审视。`;
  $("#review-stats").textContent=JSON.stringify({checks,failures},null,2);
  } finally { auditing=false;$("#review-controls").querySelectorAll("button,select").forEach(control=>control.disabled=false); }
}
async function download() {
  const report={created:new Date().toISOString(),fixture:{records:records.length,groups:archiveColumns},renderer:host.dataset.renderQuality,checks,failures,frames:history};
  try {
    const response=await fetch("/review-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(report,null,2)});
    if(response.ok) { status.textContent="检查报告已保存。";return; }
  } catch {}
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"})); a.download="archive-flow-review.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function action(name) {
  if(!scene || !viewer) return;
  if(name==="open") open();
  if(name==="close") close();
  if(name==="projection") project();
  if(name==="projection-close") viewer.close();
  if(name==="previous" || name==="next") { viewer.close(true); if(mode!=="archive") close(); choose(selected+(name==="next"?1:-1)); }
  if(name==="arrival") { viewer.close(true); close(); scene.setMode("hidden"); choose(0);arrivalTime=ARRAY_REVEAL_START;stage.dataset.mode="boot";layout();stamp("arrival start"); }
  if(name==="audit") await audit();
  if(name==="download") download();
  if(name==="hide") $("#review-controls").classList.add("collapsed");
  if(name==="play") { playing=!playing; let last=performance.now(),remainder=0; function frame(now) { if(!playing)return;remainder+=Math.min(.05,(now-last)/1000);last=now;const frames=Math.floor(remainder*60);if(frames){remainder-=frames/60;advance(frames/60);}requestAnimationFrame(frame); } requestAnimationFrame(frame); }
  if(!["audit","download","play","hide"].includes(name)) draw();
}
document.addEventListener("click",event=>{
  const production=event.target.closest("[data-action],[data-review-select]");
  if(production && !auditing) {
    if(production.dataset.reviewSelect){choose(Number(production.dataset.reviewSelect));draw();return;}
    const mapped={open:"open",back:"close",projection:"projection",prev:"previous",next:"next"}[production.dataset.action];
    if(mapped){action(mapped);return;}
  }
  const target=event.target.closest("[data-review-action],[data-step]");if(!target)return;
  if(target.dataset.step) advance(Number(target.dataset.step));else action(target.dataset.reviewAction);
});
selector.addEventListener("change",()=>{viewer.close(true);close();choose(Number(selector.value));draw();});
// Cube intentionally stops its own keyboard events from reaching archive
// navigation. Keep the review toolbar recoverable without stealing those keys.
document.addEventListener("keydown",event=>{
  if(event.key.toLowerCase()!=="h" || ["INPUT","SELECT","TEXTAREA"].includes(event.target.tagName) || auditing)return;
  event.preventDefault();event.stopPropagation();$("#review-controls").classList.toggle("collapsed");
},{capture:true});
document.addEventListener("keydown",event=>{if(["INPUT","SELECT","TEXTAREA"].includes(event.target.tagName)||auditing)return;if(event.key==="ArrowRight"){event.preventDefault();advance(.25);}});
// Read-only snapshot exposed for the browser's DOM-visible report. Controls
// above remain the only entry points used during browser acceptance.
Object.defineProperty(window,"flowReview",{get:()=>({records:records.length,checks:[...checks],failures:[...failures],last:history.at(-1)})});
try {
  scene=new ArchiveScene(host); scene.setQuality(superPerformanceQuality); scene.setSuperPerformance(true);scene.setMotion(fullMotion());
  await scene.load(); viewer=new ProjectionViewer($("#viewport"));choose(0);scene.setMode("archive");advance(3);status.textContent="原始 GLB 已载入。使用实际物理与光学模块；固定60Hz推进。";
} catch(error) { status.textContent=`载入失败：${error.message}`; throw error; }
