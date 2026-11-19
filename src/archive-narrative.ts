import type { ArchiveRecord } from "./data";
import { escapeHtml } from "./html";

const isResearch = (record: ArchiveRecord) => record.kind === "research" || record.projection?.kind === "research";

function abstractMarkup(record: ArchiveRecord) {
  return `<div class="record-abstract">${record.abstract.split(/\n\s*\n/).filter(p => p.trim()).map(p => `<p>${escapeHtml(p)}</p>`).join("")}</div>`;
}

/** The reader learns what the research is before catalogue fields and history. */
export function archiveBriefMarkup(record: ArchiveRecord) {
  return isResearch(record) ? `<section class="record-brief" aria-label="研究概览"><div class="panel-label">RESEARCH BRIEF / 研究概览</div>${abstractMarkup(record)}</section>` : "";
}

export function archiveNarrativeMarkup(record: ArchiveRecord) {
  const story = record.chapters?.length ? `<div class="record-story">${record.chapters.map((chapter, index) => `<section id="chapter-${escapeHtml(chapter.id)}"><div class="record-chapter-meta"><span>${String(index + 1).padStart(2, "0")}</span>${chapter.date ? `<span>${escapeHtml(chapter.date)}</span>` : ""}</div><h3>${escapeHtml(chapter.title)}</h3>${chapter.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join("")}</section>`).join("")}</div>` : "";
  return `<div class="panel-label">ARCHIVE NARRATIVE / 档案记录</div>${isResearch(record) ? "" : abstractMarkup(record)}${story}`;
}
