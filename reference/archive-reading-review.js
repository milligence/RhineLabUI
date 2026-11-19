import "../src/style.css";
import "../src/responsive.css";
import "../src/archive-template.css";
import "../src/archive-entry.css";
import "../src/projection.css";
import { records } from "../src/data";
import { viewportLayout } from "../src/viewport-layout";
import { paintTheme } from "../src/theme-ui";
import { ProjectionViewer } from "../src/projection-viewer";
import { archiveNarrativeMarkup } from "../src/archive-narrative";
import { sourceMarkup } from "../src/research-projection";
import { escapeHtml } from "../src/html";
import { detailMarkup } from "./flow-review-markup.generated";

const $ = selector => document.querySelector(selector);
const stage = $("#stage"), detail = $("#detail-content"), recordSelect = $("#reading-record"), chapterSelect = $("#reading-chapter");
let selected = Math.max(0, records.findIndex(record => record.projection?.kind === "research")), viewer;
function layout() {
  const viewport = $("#viewport"), v = viewportLayout(viewport.clientWidth, viewport.clientHeight, matchMedia("(pointer: coarse)").matches);
  stage.style.width = `${v.width}px`; stage.style.height = `${v.height}px`;
  stage.style.transform = `translate(-50%,-50%) scale(${v.scale})`; stage.dataset.layout = v.kind;
  stage.style.setProperty("--stage-scale", String(v.scale));
}
function showDocument() { viewer?.close(true); $("#reading-status").textContent = `${records[selected].id} · 正文 · ${(records[selected].chapters ?? []).length} 章`; }
function setTab(tab = "overview") {
  const record = records[selected], panel = $("#tab-panel");
  detail.querySelectorAll("[data-tab]").forEach(button => { const active = button.dataset.tab === tab; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
  const active = detail.querySelector(`[data-tab="${tab}"]`);
  detail.querySelector(".tab-indicator").style.transform = `translateX(${active.offsetLeft}px) scaleX(${active.offsetWidth})`;
  panel.setAttribute("aria-labelledby", active.id);
  panel.innerHTML = tab === "overview" ? archiveNarrativeMarkup(record) : tab === "notes"
    ? `<div class="panel-label">RECORDS / 文字记录</div><ol class="research-notes">${record.findings.map((finding,i) => `<li><span>${String(i+1).padStart(2,"0")}</span>${escapeHtml(finding)}</li>`).join("")}</ol>`
    : `<div class="panel-label">SOURCES / 资料来源</div><div class="projection-sources">${sourceMarkup(record.sources ?? (record.source ? [{label:"原始资料",url:record.source}] : []))}</div>`;
}
function renderDocument() {
  viewer?.dispose(); viewer = undefined;
  const record = records[selected]; recordSelect.value = String(selected);
  detail.innerHTML = detailMarkup(record, selected, records.length); detail.style.opacity = "1"; detail.scrollTop = 0;
  chapterSelect.replaceChildren(new Option("概览与摘要", ""), ...(record.chapters ?? []).map((chapter,i) => new Option(`${String(i+1).padStart(2,"0")} · ${chapter.title}`, chapter.id)));
  chapterSelect.disabled = !record.chapters?.length;
  $("#reading-tree").disabled = record.projection?.kind !== "research";
  const projectionEntry = detail.querySelector('[data-action="projection"]');
  if (projectionEntry && record.projection?.kind !== "research") { projectionEntry.disabled = true; projectionEntry.title = "此静态页面只核查该档案正文"; }
  setTab(); showDocument();
}
function showTree() {
  const record = records[selected]; if (record.projection?.kind !== "research") return;
  viewer?.dispose(); viewer = new ProjectionViewer($("#viewport"));
  viewer.open(record, { reducedMotion:true, onClose:() => { $("#reading-status").textContent = `${record.id} · 正文`; } });
  $("#reading-status").textContent = `${record.id} · 实际研究树模块 · 选择节点核查记录、复盘与依据`;
}
recordSelect.replaceChildren(...records.map((record,i) => new Option(`${record.id} · ${record.title}`, String(i))));
recordSelect.addEventListener("change", () => { selected = Number(recordSelect.value); renderDocument(); });
$("#reading-document").addEventListener("click", showDocument);
$("#reading-tree").addEventListener("click", showTree);
chapterSelect.addEventListener("change", () => {
  showDocument(); setTab();
  const chapter = chapterSelect.value && document.getElementById(`chapter-${chapterSelect.value}`);
  if (chapter) { const scale = detail.getBoundingClientRect().height / detail.offsetHeight; detail.scrollTop += (chapter.getBoundingClientRect().top - detail.getBoundingClientRect().top) / scale - 28; }
  else detail.scrollTop = 0;
});
detail.addEventListener("click", event => { const target = event.target.closest("[data-tab],[data-action]"); if (target?.dataset.tab) setTab(target.dataset.tab); if (target?.dataset.action === "projection") showTree(); });
$("#reading-hide").addEventListener("click", () => { $("#reading-controls").hidden = true; });
document.addEventListener("keydown", event => { if (event.key.toLowerCase() === "h" && !["INPUT","SELECT","TEXTAREA"].includes(event.target.tagName)) $("#reading-controls").hidden = !$("#reading-controls").hidden; });
window.addEventListener("resize", layout);
paintTheme(0); layout(); renderDocument();
