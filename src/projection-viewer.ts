import type { ArchiveRecord } from "./data";
import { escapeHtml } from "./html";
import { ResearchProjection, sourceMarkup, type ResearchViewState } from "./research-projection";
import { CubeProjection } from "./cube-projection";
import type { CubeProjectionData } from "./projection-types";
import { CarrierFlight, carrierFrame, carrierCameraProgress, type CarrierCameraSample, type CarrierSample, type FlightBox } from "./carrier-flight";
import "./projection-atmosphere.css";
import "./cube-optics.css";

type ProjectionOptions = {
  reducedMotion: boolean;
  onClose: () => void;
  origin?: { x: number; y: number };
  /** Sample the physical carrier after the main scene has drawn its current camera. */
  sampleCarrier?: () => CarrierSample | undefined;
  onCameraProgress?: (progress: number) => CarrierCameraSample | void;
  onBeat?: (beat: string) => void;
};

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
  private flight = new CarrierFlight();
  private flightRaf = 0;
  private imageBox: FlightBox = { left: 0, top: 0, width: 1, height: 1 };
  private currentBeat = "";
  private beatTrace: { beat: string; elapsed: number; progress: number }[] = [];
  private flightStarted = 0;
  private frameState?: ReturnType<typeof carrierFrame>;
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
    const resume = this.isOpen;
    cancelAnimationFrame(this.flightRaf);
    this.closing = false;
    this.options = options;
    if (!this.isOpen) {
      this.flight.jump(0);
      this.currentBeat = "";
      this.beatTrace = [];
      this.flightStarted = performance.now();
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

  private enterFromCarrier(options: ProjectionOptions, resume: boolean) {
    const ignition = this.root.querySelector<HTMLElement>(".projection-ignition")!;
    this.imageBox = { left: this.host.offsetLeft, top: this.host.offsetTop, width: this.host.offsetWidth, height: this.host.offsetHeight };
    if (!resume || !ignition.firstChild) {
      ignition.innerHTML = '<svg preserveAspectRatio="none"><defs><linearGradient id="carrier-light" x1="0" y1="1" x2=".6" y2="0"><stop stop-color="var(--optical-accent)" stop-opacity=".34"/><stop offset=".45" stop-color="var(--optical-accent)" stop-opacity=".07"/><stop offset="1" stop-color="white" stop-opacity=".08"/></linearGradient><radialGradient id="carrier-aperture"><stop stop-color="white" stop-opacity="1"/><stop offset=".12" stop-color="var(--optical-accent)" stop-opacity=".8"/><stop offset="1" stop-color="var(--optical-accent)" stop-opacity="0"/></radialGradient></defs><path class="carrier-volume" fill="url(#carrier-light)"/><path class="carrier-inner-volume" fill="url(#carrier-light)"/><path class="carrier-rays" pathLength="1"/><path class="carrier-image-outline"/><g class="carrier-source"><ellipse class="carrier-emitter" rx="55" ry="25" fill="url(#carrier-aperture)"/><path class="carrier-aperture-edge"/><circle r="3.2" fill="var(--optical-accent)"/><circle r="8" fill="none" stroke="var(--optical-accent)" stroke-width=".65"/></g></svg><div class="carrier-channel"><span class="carrier-channel-id"></span><span>OPTICAL CHANNEL</span><i></i></div>';
      ignition.querySelector(".carrier-channel-id")!.textContent = this.record!.id;
    }
    this.host.inert = true;
    if (options.reducedMotion) {
      this.flight.jump(1); this.paintFlight(); this.finishEntrance(); return;
    }
    this.flight.move(1, performance.now(), resume ? Math.max(450, (1 - this.flight.value) * 2200) : 2200);
    this.paintFlight();
    this.flightRaf = requestAnimationFrame(this.advanceFlight);
  }

  private setBeat(beat: string) {
    if (beat === this.currentBeat) return;
    this.currentBeat = beat; this.root.dataset.beat = beat;
    this.beatTrace.push({ beat, elapsed: Math.round(performance.now() - this.flightStarted), progress: this.flight.value });
    this.options.onBeat?.(beat);
  }

  private paintFlight() {
    const rect = this.parent.getBoundingClientRect();
    this.imageBox = { left: this.host.offsetLeft, top: this.host.offsetTop, width: this.host.offsetWidth, height: this.host.offsetHeight };
    // Queue the desired phase, then use the scene's returned *drawn* phase for
    // both plane projection and carrier sampling. The scene and DOM have
    // separate RAF callbacks; neither is allowed to run one visible frame ahead.
    const rendered = this.options.onCameraProgress?.(carrierCameraProgress(this.flight.value));
    const sample = this.options.sampleCarrier?.();
    const origin = sample?.origin ?? this.options.origin ?? { x: rect.left + rect.width * .25, y: rect.top + rect.height * .65 };
    const x = origin.x - rect.left, y = origin.y - rect.top;
    this.root.style.setProperty("--projection-origin-x", x + "px");
    this.root.style.setProperty("--projection-origin-y", y + "px");
    const f = this.frameState = carrierFrame(this.flight.value, rect, this.imageBox, this.options.reducedMotion ? undefined : rendered || undefined);
    const environment = this.root.querySelector<HTMLElement>(".projection-environment")!;
    const header = this.root.querySelector<HTMLElement>(".projection-header")!;
    const ignition = this.root.querySelector<HTMLElement>(".projection-ignition")!;
    environment.style.opacity = String(f.environment);
    header.style.opacity = String(f.header);
    header.style.transform = "translateY(" + ((1-f.header)*8).toFixed(2) + "px)";
    this.host.style.opacity = String(f.image);
    this.host.style.transform = f.transform;
    this.host.style.setProperty("--carrier-plane-frame", String(f.frame));
    this.root.style.setProperty("--carrier-light", String(f.light));
    ignition.style.opacity = String(f.light);
    const svg = ignition.querySelector("svg");
    if (svg) {
      svg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
      const [a,b,c,d] = f.corners;
      const point = (v: { x: number; y: number }) => v.x.toFixed(2) + "," + v.y.toFixed(2);
      const originText = x.toFixed(2) + "," + y.toFixed(2);
      ignition.querySelector(".carrier-volume")!.setAttribute("d", "M" + originText + " L" + point(a) + " L" + point(b) + " Z");
      ignition.querySelector(".carrier-inner-volume")!.setAttribute("d", "M" + originText + " L" + point(d) + " L" + point(c) + " Z");
      ignition.querySelector(".carrier-rays")!.setAttribute("d", "M" + point(a) + " L" + originText + " L" + point(b) + " M" + point(d) + " L" + originText + " L" + point(c));
      (ignition.querySelector(".carrier-rays") as SVGElement).style.strokeDashoffset = String(1-f.rayLength);
      ignition.querySelector(".carrier-image-outline")!.setAttribute("d", "M" + point(a) + " L" + point(b) + " L" + point(c) + " L" + point(d) + " Z");
      const source = ignition.querySelector(".carrier-source") as SVGGElement;
      source.setAttribute("transform", "translate(" + x + "," + y + ")");
      source.style.opacity = String(f.emitter);
      const edge = sample?.edge;
      ignition.querySelector(".carrier-aperture-edge")!.setAttribute("d", edge ? "M" + (edge[0].x - origin.x) + "," + (edge[0].y - origin.y) + " L" + (edge[1].x - origin.x) + "," + (edge[1].y - origin.y) : "M-30,0 L30,0");
      const channel = ignition.querySelector<HTMLElement>(".carrier-channel")!;
      channel.style.left = (x + 26) + "px";
      channel.style.top = (y + 28) + "px";
      channel.style.opacity = String(f.emitter);
    }
    this.setBeat(this.closing ? "returning" : f.beat);
  }

  private advanceFlight = (now: number) => {
    this.flight.step(now);
    this.paintFlight();
    if (this.flight.active || Math.abs((this.frameState?.camera ?? this.flight.target) - this.flight.target) > 1e-9) this.flightRaf = requestAnimationFrame(this.advanceFlight);
    else if (this.closing) this.finishClose();
    else this.finishEntrance();
  };

  private finishEntrance() {
    this.flight.jump(1);
    this.host.style.transform = "none";
    this.host.style.opacity = "1";
    this.host.inert = false;
    this.root.dataset.state = "open";
    this.root.querySelector<HTMLElement>(".projection-ignition")!.style.opacity = "0";
    this.setBeat("open");
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
    this.root.dataset.state = "closing";
    cancelAnimationFrame(this.flightRaf);
    this.host.inert = true;
    if (immediate || this.options.reducedMotion) {
      this.flight.jump(0); this.options.onCameraProgress?.(0); this.finishClose();
    }
    else {
      // Leave the current painted frame untouched until the next RAF. Its
      // derivatives are retained by CarrierFlight when the intent reverses.
      this.flight.move(0, performance.now(), Math.max(650, this.flight.value * 1500));
      this.setBeat("returning");
      this.flightRaf = requestAnimationFrame(this.advanceFlight);
    }
  }
  private finishClose() {
    cancelAnimationFrame(this.flightRaf);
    this.flight.jump(0);
    this.options.onCameraProgress?.(0);
    this.research?.dispose(); this.cube?.dispose(); this.research = undefined; this.cube = undefined;
    this.root.querySelector(".projection-ignition")!.replaceChildren();
    this.root.hidden = true; this.isOpen = false; this.closing = false; this.host.replaceChildren();
    this.siblings.forEach(({ node, inert }) => node.inert = inert); this.siblings = [];
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.options.onClose();
  }
  setReducedMotion(value: boolean) {
    this.options.reducedMotion = value; this.root.dataset.reduced = String(value); this.research?.setReducedMotion(value); this.cube?.setReducedMotion(value);
    if (value && this.root.dataset.state === "opening") {
      cancelAnimationFrame(this.flightRaf); this.flight.jump(1); this.paintFlight(); this.finishEntrance();
    }
    if (value && this.closing) this.close(true);
  }
  refreshTheme() { this.cube?.refreshTheme(); }
  get needsCarrierScene() { return this.isOpen && this.root.dataset.state !== "open"; }
  getStats() { return { open: this.isOpen, kind: this.record?.projection?.kind, phase: this.root.dataset.state, beat: this.currentBeat, flight: { progress: this.flight.value, velocity: this.flight.velocity, camera: this.frameState?.camera, requestedCamera: this.frameState?.requestedCamera, perspective: this.frameState?.rig.perspective, position: this.frameState?.rig.position, aim: this.frameState?.rig.aim, image: this.frameState?.image, environment: this.frameState?.environment, corners: this.frameState?.corners, trace: [...this.beatTrace] }, record: this.record?.id, research: this.research?.getStats(), cube: this.cube?.getStats() }; }
  dispose() { this.close(true); cancelAnimationFrame(this.flightRaf); this.root.remove(); }
}
