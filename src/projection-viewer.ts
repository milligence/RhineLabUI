import type { ArchiveRecord } from "./data";
import { escapeHtml } from "./html";
import { ResearchProjection, sourceMarkup, type ResearchViewState } from "./research-projection";
import { CubeProjection } from "./cube-projection";
import type { CubeProjectionData } from "./projection-types";
import "./projection-atmosphere.css";
import "./cube-optics.css";

type ProjectionOptions = { reducedMotion: boolean; onClose: () => void; origin?: { x: number; y: number } };
type OpticalFrame = { element: HTMLElement; opacity: string; transform: string; clipPath: string };

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
  private entranceAnimations: Animation[] = [];
  private entryTimer?: ReturnType<typeof setTimeout>;
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
    this.root.innerHTML = `<div class="projection-environment" aria-hidden="true"><div class="projection-depth-plane"></div><div class="projection-horizon"></div><div class="projection-collimator"></div></div><div class="projection-ignition" aria-hidden="true"></div><header class="projection-header"><button type="button" class="projection-back" data-projection="close">← <span>返回档案</span><kbd>ESC</kbd></button><div class="projection-identity"><span class="projection-eyebrow"></span><h1 id="projection-title"></h1></div><span class="projection-mode-label"></span></header><div class="projection-content"></div><div class="projection-announcement" role="status" aria-live="polite"></div>`;
    this.host = this.root.querySelector(".projection-content")!;
    parent.appendChild(this.root);
    this.root.addEventListener("click", event => {
      if ((event.target as Element).closest('[data-projection="close"]')) this.close();
    });
    this.root.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.close(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...this.root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(n => n.tabIndex >= 0 && n.getClientRects().length && !n.closest("[inert]"));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
  }

  open(record: ArchiveRecord, options: ProjectionOptions) {
    if (!record.projection) return;
    const sameOpen = this.isOpen && this.record?.id === record.id;
    const resume = this.isOpen ? [".projection-environment", ".projection-header", ".projection-content", ".projection-ignition"].map(selector => {
      const element = this.root.querySelector<HTMLElement>(selector)!;
      const computed = getComputedStyle(element);
      return { element, opacity: computed.opacity, transform: computed.transform, clipPath: computed.clipPath };
    }) : undefined;
    this.freezeIgnitionRays();
    this.generation++;
    clearTimeout(this.closeTimer); clearTimeout(this.entryTimer); this.transition?.cancel();
    this.entranceAnimations.forEach(animation => animation.cancel()); this.entranceAnimations = [];
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
    this.root.dataset.state = options.reducedMotion ? "open" : "opening";
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
    } else { this.research?.setReducedMotion(options.reducedMotion); this.cube?.setReducedMotion(options.reducedMotion); }
    this.enterFromCarrier(options, resume);
    this.root.querySelector<HTMLButtonElement>(".projection-back")!.focus({ preventScroll: true });
  }

  private freezeIgnitionRays() {
    const rays = this.root.querySelector<SVGPathElement>(".carrier-rays");
    if (rays) rays.style.strokeDashoffset = getComputedStyle(rays).strokeDashoffset;
  }

  private enterFromCarrier(options: ProjectionOptions, resume?: OpticalFrame[]) {
    const environment = this.root.querySelector<HTMLElement>(".projection-environment")!;
    const header = this.root.querySelector<HTMLElement>(".projection-header")!;
    const ignition = this.root.querySelector<HTMLElement>(".projection-ignition")!;
    const rect = this.parent.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, (options.origin?.x ?? rect.left + rect.width * .25) - rect.left));
    const y = Math.max(0, Math.min(rect.height, (options.origin?.y ?? rect.top + rect.height * .65) - rect.top));
    this.root.style.setProperty("--projection-origin-x", `${x}px`);
    this.root.style.setProperty("--projection-origin-y", `${y}px`);
    if (options.reducedMotion) { ignition.replaceChildren(); this.host.inert = false; return; }
    this.host.inert = true;
    const generation = this.generation;
    if (resume) {
      resume.forEach(({ element, opacity, transform, clipPath }) => this.entranceAnimations.push(element.animate([{ opacity, transform, clipPath }, { opacity: element === ignition ? 0 : 1, transform: "none", clipPath }], { duration: 360, easing: "cubic-bezier(.18,.7,.18,1)", fill: "both" })));
      this.entryTimer = setTimeout(() => {
        if (this.generation !== generation || this.closing) return;
        this.root.dataset.state = "open"; this.host.inert = false;
        this.entranceAnimations.forEach(animation => animation.cancel()); this.entranceAnimations = []; ignition.replaceChildren();
      }, 370);
      return;
    }
    const width = rect.width, height = rect.height;
    const left = { x: width * .19, y: height * .13 }, right = { x: width * .94, y: height * .28 };
    ignition.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><linearGradient id="carrier-light" x1="0" y1="1" x2=".5" y2="0"><stop stop-color="var(--optical-accent)" stop-opacity=".32"/><stop offset=".45" stop-color="var(--optical-accent)" stop-opacity=".06"/><stop offset="1" stop-color="white" stop-opacity=".015"/></linearGradient><radialGradient id="carrier-aperture"><stop stop-color="white" stop-opacity=".9"/><stop offset=".14" stop-color="var(--optical-accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--optical-accent)" stop-opacity="0"/></radialGradient></defs><path class="carrier-volume" d="M${x},${y} L${left.x},${left.y} Q${width * .55},${height * .02} ${right.x},${right.y} Z" fill="url(#carrier-light)"/><path class="carrier-rays" pathLength="1" d="M${left.x},${left.y} L${x},${y} L${right.x},${right.y}"/><ellipse class="carrier-emitter" cx="${x}" cy="${y}" rx="44" ry="18" fill="url(#carrier-aperture)"/><path class="carrier-wavefront" d="M${left.x},${left.y} Q${width * .55},${height * .02} ${right.x},${right.y}"/></svg>`;
    const easing = "cubic-bezier(.18,.7,.18,1)";
    this.entranceAnimations.push(
      environment.animate([{ opacity: 0 }, { opacity: 0, offset: .16 }, { opacity: 1 }], { duration: 1120, easing, fill: "both" }),
      header.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { delay: 410, duration: 640, easing, fill: "both" }),
      this.host.animate([{ opacity: 0, transform: "translateY(9px)" }, { opacity: 1, transform: "none" }], { delay: 490, duration: 720, easing, fill: "both" }),
      ignition.animate([{ opacity: 0, clipPath: `circle(0px at ${x}px ${y}px)` }, { opacity: 1, clipPath: `circle(${Math.hypot(width, height)}px at ${x}px ${y}px)`, offset: .58 }, { opacity: 0, clipPath: `circle(${Math.hypot(width, height)}px at ${x}px ${y}px)` }], { duration: 1350, easing: "ease-out", fill: "both" }),
    );
    const rays = ignition.querySelector(".carrier-rays")!;
    this.entranceAnimations.push(rays.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 730, easing, fill: "both" }));
    this.entryTimer = setTimeout(() => {
      if (this.generation !== generation || this.closing) return;
      this.root.dataset.state = "open"; this.host.inert = false;
      this.entranceAnimations.forEach(animation => animation.cancel()); this.entranceAnimations = []; ignition.replaceChildren();
    }, 1360);
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
    clearTimeout(this.entryTimer);
    const environment = this.root.querySelector<HTMLElement>(".projection-environment")!;
    const header = this.root.querySelector<HTMLElement>(".projection-header")!;
    const ignition = this.root.querySelector<HTMLElement>(".projection-ignition")!;
    const current = [environment, header, this.host, ignition].map(element => {
      const computed = getComputedStyle(element);
      return { element, opacity: computed.opacity, transform: computed.transform, clipPath: computed.clipPath };
    });
    this.freezeIgnitionRays();
    this.entranceAnimations.forEach(animation => animation.cancel()); this.entranceAnimations = [];
    this.host.inert = true;
    const finish = () => {
      if (this.generation !== generation) return;
      this.research?.dispose(); this.cube?.dispose(); this.research = undefined; this.cube = undefined;
      this.entranceAnimations.forEach(animation => animation.cancel()); this.entranceAnimations = [];
      ignition.replaceChildren();
      this.root.hidden = true; this.isOpen = false; this.closing = false; this.host.replaceChildren();
      this.siblings.forEach(({ node, inert }) => node.inert = inert); this.siblings = [];
      if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
      this.options.onClose();
    };
    this.transition?.cancel();
    if (immediate || this.options.reducedMotion) finish();
    else {
      current.forEach(({ element, opacity, transform, clipPath }, index) => {
        this.entranceAnimations.push(element.animate([{ opacity, transform, clipPath }, { opacity: 0, transform: index === 0 || element === ignition ? "none" : "translateY(5px)", clipPath }], { duration: index === 0 ? 420 : 220, delay: index === 0 ? 100 : 0, easing: "ease-out", fill: "both" }));
      });
      this.closeTimer = setTimeout(finish, 530);
    }
  }
  setReducedMotion(value: boolean) {
    this.options.reducedMotion = value; this.root.dataset.reduced = String(value); this.research?.setReducedMotion(value); this.cube?.setReducedMotion(value);
    if (value && this.root.dataset.state === "opening") {
      clearTimeout(this.entryTimer); this.entranceAnimations.forEach(animation => animation.cancel()); this.entranceAnimations = [];
      this.root.querySelector(".projection-ignition")!.replaceChildren(); this.host.inert = false; this.root.dataset.state = "open";
    }
  }
  refreshTheme() { this.cube?.refreshTheme(); }
  getStats() { return { open: this.isOpen, kind: this.record?.projection?.kind, phase: this.root.dataset.state, record: this.record?.id, research: this.research?.getStats(), cube: this.cube?.getStats() }; }
  dispose() { this.close(true); this.transition?.cancel(); clearTimeout(this.closeTimer); clearTimeout(this.entryTimer); this.entranceAnimations.forEach(animation => animation.cancel()); this.root.remove(); }
}
