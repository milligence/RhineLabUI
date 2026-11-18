import type { ArchiveRecord } from "./data";
import { escapeHtml } from "./html";
import { ResearchProjection, sourceMarkup, type ResearchViewState } from "./research-projection";
import { CubeProjection } from "./cube-projection";
import type { CubeProjectionData } from "./projection-types";

type ProjectionOptions = { reducedMotion: boolean; onClose: () => void; origin?: { x: number; y: number } };

/** A single optical work surface is shared by both kinds of archive. */
export class ProjectionViewer {
  readonly root: HTMLElement;
  private host: HTMLElement;
  private research?: ResearchProjection;
  private cube?: CubeProjection;
  private snapshots = new Map<string, ResearchViewState>();
  private cubeSnapshots = new Map<string, unknown>();
  private cubeViews = new Map<string, unknown>();
  private presetMemory = new Map<string, number>();
  private record?: ArchiveRecord;
  private opener: HTMLElement | null = null;
  private siblings: { node: HTMLElement; inert: boolean }[] = [];
  private closing = false;
  private transition?: Animation;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private options: ProjectionOptions = { reducedMotion: false, onClose: () => {} };
  isOpen = false;

  constructor(private parent: HTMLElement) {
    this.root = document.createElement("section");
    this.root.className = "projection-shell";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "projection-title");
    this.root.innerHTML = `<header class="projection-header"><button type="button" class="projection-back" data-projection="close">← <span>返回档案</span><kbd>ESC</kbd></button><div class="projection-identity"><span class="projection-eyebrow"></span><h1 id="projection-title"></h1></div><span class="projection-mode-label"></span></header><div class="projection-content"></div><div class="projection-announcement" role="status" aria-live="polite"></div>`;
    this.host = this.root.querySelector(".projection-content")!;
    parent.appendChild(this.root);
    this.root.addEventListener("click", event => {
      if ((event.target as Element).closest('[data-projection="close"]')) this.close();
    });
    this.root.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.close(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...this.root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(n => n.getClientRects().length && !n.closest("[inert]"));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
  }

  open(record: ArchiveRecord, options: ProjectionOptions) {
    if (!record.projection) return;
    const sameOpen = this.isOpen && this.record?.id === record.id;
    this.generation++;
    clearTimeout(this.closeTimer); this.transition?.cancel();
    this.closing = false;
    this.options = options;
    if (!this.isOpen) {
      this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.siblings = [...this.parent.children].filter(node => node !== this.root && node instanceof HTMLElement).map(node => ({ node: node as HTMLElement, inert: (node as HTMLElement).inert }));
      this.siblings.forEach(({ node }) => node.inert = true);
    }
    this.isOpen = true;
    this.root.hidden = false;
    this.root.inert = false;
    this.root.dataset.kind = record.projection.kind;
    this.root.dataset.reduced = String(options.reducedMotion);
    this.root.dataset.state = "open";
    this.root.querySelector(".projection-eyebrow")!.textContent = `${record.id} / ${record.projection.kind === "research" ? "RESEARCH RECORD" : "EXPERIMENT RECORD"}`;
    this.root.querySelector("h1")!.textContent = record.en;
    this.root.querySelector(".projection-mode-label")!.textContent = record.projection.label;
    if (!sameOpen) {
      this.saveState(); this.research?.dispose(); this.cube?.dispose();
      this.research = undefined; this.cube = undefined;
      this.record = record;
      if (record.projection.kind === "research") {
        this.research = new ResearchProjection(this.host, record.projection, { reducedMotion: options.reducedMotion, state: this.snapshots.get(record.id) });
      } else this.openCube(record.projection);
    }
    if (!options.reducedMotion) this.transition = this.root.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 360, easing: "cubic-bezier(.2,.7,.2,1)" });
    this.root.querySelector(".projection-source-trace")?.remove();
    if (!options.reducedMotion && options.origin) {
      const rect = this.parent.getBoundingClientRect();
      const destination = this.root.querySelector(".projection-identity")!.getBoundingClientRect();
      const x = options.origin.x - rect.left, y = options.origin.y - rect.top;
      const tx = destination.left - rect.left - 12, ty = destination.top - rect.top + destination.height / 2;
      const trace = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      trace.classList.add("projection-source-trace"); trace.setAttribute("aria-hidden", "true");
      trace.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
      trace.innerHTML = `<path d="M ${x} ${y} L ${tx} ${y} L ${tx} ${ty}"/>`;
      this.root.appendChild(trace);
      const path = trace.querySelector("path")!, length = path.getTotalLength();
      path.style.strokeDasharray = String(length);
      path.animate([{ strokeDashoffset: length, opacity: .5 }, { strokeDashoffset: 0, opacity: .45, offset: .72 }, { strokeDashoffset: 0, opacity: 0 }], { duration: 620, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" }).finished.then(() => trace.remove()).catch(() => {});
    }
    this.root.querySelector<HTMLButtonElement>(".projection-back")!.focus({ preventScroll: true });
  }

  private openCube(data: CubeProjectionData) {
    const record = this.record!;
    let selected = Math.min(data.experiments.length - 1, this.presetMemory.get(record.id) ?? 0);
    this.host.innerHTML = `<div class="cube-preset-rail"><label><span>EXPERIMENT / 构造</span><select aria-label="载入实验构造">${data.experiments.map((experiment, i) => `<option value="${i}">${escapeHtml(experiment.title)}</option>`).join("")}</select></label><p></p></div><div class="cube-host"></div><details class="cube-experiment-recap"><summary>${data.retrospectiveLabel ? "EXPERIMENT NOTES" : "RETROSPECTIVE"} / ${escapeHtml(data.retrospectiveLabel ?? "构造复盘")}<span>展开记录 ＋</span></summary><div class="cube-recap-content"></div></details>`;
    const select = this.host.querySelector<HTMLSelectElement>(".cube-preset-rail select")!;
    const recap = this.host.querySelector<HTMLDetailsElement>(".cube-experiment-recap")!;
    recap.addEventListener("toggle", () => {
      recap.querySelector("summary span")!.textContent = recap.open ? "收起记录 −" : "展开记录 ＋";
    });
    select.value = String(selected);
    const paintRecap = () => {
      const experiment = data.experiments[selected]; if (!experiment) return;
      this.host.querySelector(".cube-preset-rail p")!.textContent = experiment.description;
      this.host.querySelector(".cube-recap-content")!.innerHTML = `<div class="projection-recap">${experiment.retrospective.map(p => `<p>${escapeHtml(p)}</p>`).join("")}</div><div class="projection-sources">${sourceMarkup(experiment.sources)}</div>`;
      this.host.querySelector<HTMLElement>(".cube-experiment-recap")!.dataset.experiment = experiment.id;
    };
    paintRecap();
    this.cube = new CubeProjection(this.host.querySelector(".cube-host")!, { experiment: this.cubeSnapshots.get(record.id) ?? data.experiments[selected]?.state, reducedMotion: this.options.reducedMotion });
    const view = this.cubeViews.get(record.id);
    if (view) this.cube.restoreInspectionState(view);
    select.addEventListener("change", () => {
      selected = Number(select.value); this.presetMemory.set(record.id, selected);
      this.cube?.loadExperiment(data.experiments[selected]?.state); paintRecap();
      this.root.querySelector(".projection-announcement")!.textContent = `已载入${data.experiments[selected].title}，复盘已同步。`;
    });
  }

  private saveState() {
    if (!this.record) return;
    if (this.research) this.snapshots.set(this.record.id, this.research.getState());
    if (this.cube) {
      this.cubeSnapshots.set(this.record.id, this.cube.getState());
      this.cubeViews.set(this.record.id, this.cube.getInspectionState());
    }
  }

  close(immediate = false) {
    if (!this.isOpen || (this.closing && !immediate)) return;
    this.closing = true; this.saveState();
    const generation = ++this.generation;
    this.root.dataset.state = "closing";
    const finish = () => {
      if (this.generation !== generation) return;
      this.research?.dispose(); this.cube?.dispose(); this.research = undefined; this.cube = undefined;
      this.root.hidden = true; this.isOpen = false; this.closing = false; this.host.replaceChildren();
      this.siblings.forEach(({ node, inert }) => node.inert = inert); this.siblings = [];
      if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
      this.options.onClose();
    };
    this.transition?.cancel();
    if (immediate || this.options.reducedMotion) finish();
    else {
      this.transition = this.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "forwards" });
      this.closeTimer = setTimeout(finish, 220);
    }
  }
  setReducedMotion(value: boolean) { this.options.reducedMotion = value; this.root.dataset.reduced = String(value); this.research?.setReducedMotion(value); this.cube?.setReducedMotion(value); }
  refreshTheme() { this.cube?.refreshTheme(); }
  getStats() { return { open: this.isOpen, kind: this.record?.projection?.kind, record: this.record?.id, research: this.research?.getStats(), cube: this.cube?.getStats() }; }
  dispose() { this.close(true); this.transition?.cancel(); clearTimeout(this.closeTimer); this.root.remove(); }
}
