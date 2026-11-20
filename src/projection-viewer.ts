import type { ArchiveRecord } from "./data";
import { escapeHtml } from "./html";
import { ResearchProjection, sourceMarkup, type ResearchViewState } from "./research-projection";
import { CubeProjection } from "./cube-projection";
import type { CubeProjectionData } from "./projection-types";
import { CarrierFlight, CarrierPresentationClock, CARRIER_ENTRANCE_MS, CARRIER_RETURN_MS, carrierFrame, carrierCameraProgress, carrierLocalPoint, type CarrierCameraSample, type CarrierSample, type FlightBox } from "./carrier-flight";
import "./projection-atmosphere.css";
import "./cube-optics.css";

type ProjectionOptions = {
  reducedMotion: boolean;
  /** Explicit frame-review pages may drive the real flight at fixed steps.
   * Production entry never sets this; it does not change scene callbacks. */
  manualClock?: boolean;
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
  private clock = new CarrierPresentationClock();
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
    this.root.innerHTML = `<div class="projection-environment" aria-hidden="true"><div class="projection-horizon"></div></div><div class="projection-ignition" aria-hidden="true"></div><header class="projection-header"><button type="button" class="projection-back" data-projection="close"><span aria-hidden="true">←</span><span>返回档案</span><kbd>ESC</kbd></button><div class="projection-identity"><span class="projection-eyebrow"></span><div class="projection-title-group"><h1 id="projection-title"></h1><span class="projection-subtitle"></span></div></div><span class="projection-mode-label"></span></header><div class="projection-content"></div><div class="projection-announcement" role="status" aria-live="polite"></div>`;
    this.host = this.root.querySelector(".projection-content")!;
    parent.appendChild(this.root);
    this.root.addEventListener("click", event => {
      const target = event.target as Element;
      const recap = this.root.querySelector<HTMLDetailsElement>(".cube-experiment-recap");
      if (recap?.open && (!recap.contains(target) || target.closest("[data-recap-close]"))) {
        recap.open = false;
        if (target.closest("[data-recap-close]")) recap.querySelector("summary")?.focus();
      }
      if ((event.target as Element).closest('[data-projection="close"]')) this.close();
    });
    this.root.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        const recap = this.root.querySelector<HTMLDetailsElement>(".cube-experiment-recap[open]");
        if (recap) { recap.open = false; recap.querySelector("summary")?.focus(); }
        else this.close();
        return;
      }
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
    this.root.querySelector(".projection-announcement")!.textContent = "";
    this.root.dataset.kind = record.projection.kind;
    this.root.dataset.reduced = String(options.reducedMotion);
    this.root.dataset.state = options.reducedMotion ? "open" : "opening";
    if (!resume) {
      // Content can create a WebGL context. Even if that preparation stalls,
      // no full-sized work surface may appear before its light has formed.
      this.host.style.opacity = "0";
      this.host.style.clipPath = "inset(100% 0 0 0)";
      this.root.querySelector<HTMLElement>(".projection-header")!.style.opacity = "0";
      this.root.querySelector<HTMLElement>(".projection-environment")!.style.opacity = "0";
    }
    this.root.querySelector(".projection-eyebrow")!.textContent = `${record.id} / ${record.projection.kind === "research" ? "RESEARCH" : "EXPERIMENT"}`;
    this.root.querySelector("h1")!.textContent = record.title;
    const subtitle = this.root.querySelector<HTMLElement>(".projection-subtitle")!;
    subtitle.textContent = record.en;
    subtitle.hidden = record.title.toLocaleUpperCase() === record.en.toLocaleUpperCase();
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
      ignition.innerHTML = `<svg preserveAspectRatio="none"><defs>
        <linearGradient id="carrier-light" x1="0" y1="1" x2=".6" y2="0"><stop stop-color="var(--optical-accent)" stop-opacity=".32"/><stop offset=".42" stop-color="var(--optical-accent)" stop-opacity=".075"/><stop offset="1" stop-color="white" stop-opacity=".16"/></linearGradient>
        <radialGradient id="carrier-aperture"><stop stop-color="white" stop-opacity="1"/><stop offset=".12" stop-color="var(--optical-accent)" stop-opacity=".8"/><stop offset="1" stop-color="var(--optical-accent)" stop-opacity="0"/></radialGradient>
        </defs><path class="carrier-volume" fill="url(#carrier-light)"/><path class="carrier-inner-volume" fill="url(#carrier-light)"/>
        <path class="carrier-rays"/><path class="carrier-cross-sections"/><path class="carrier-image-outline" pathLength="1"/><path class="carrier-image-scan"/>
        <g class="carrier-source"><ellipse class="carrier-emitter" rx="12" ry="6" fill="url(#carrier-aperture)"/><path class="carrier-aperture-edge"/><ellipse class="carrier-aperture-ring" rx="8" ry="4"/><circle r="3.2" fill="var(--optical-accent)"/></g>
        </svg><div class="carrier-channel"><span class="carrier-channel-id"></span><span class="carrier-channel-state">投影开启</span><i><b></b></i></div>`;
      ignition.querySelector(".carrier-channel-id")!.textContent = this.record!.id;
    }
    this.host.inert = true;
    if (options.reducedMotion) {
      this.flight.jump(1); this.paintFlight(); this.finishEntrance(); return;
    }
    const now = options.manualClock ? 0 : performance.now();
    if (!resume) { this.clock.reset(now); this.flightStarted = now; }
    else if (!options.manualClock) this.clock.step(now, !document.hidden);
    this.flight.move(1, this.clock.value, resume ? Math.max(900, (1 - this.flight.value) * CARRIER_ENTRANCE_MS) : CARRIER_ENTRANCE_MS);
    this.paintFlight();
    if (!options.manualClock) this.flightRaf = requestAnimationFrame(this.advanceFlight);
  }

  private setBeat(beat: string) {
    if (beat === this.currentBeat) return;
    this.currentBeat = beat; this.root.dataset.beat = beat;
    this.beatTrace.push({ beat, elapsed: Math.round(this.options.manualClock ? this.clock.value : performance.now() - this.flightStarted), progress: this.flight.value });
    this.options.onBeat?.(beat);
  }

  private paintFlight() {
    const rect = this.parent.getBoundingClientRect();
    const surface = { width: Math.max(1, this.parent.clientWidth), height: Math.max(1, this.parent.clientHeight) };
    this.imageBox = { left: this.host.offsetLeft, top: this.host.offsetTop, width: this.host.offsetWidth, height: this.host.offsetHeight };
    // Queue the desired phase, then use the scene's returned *drawn* phase for
    // both plane projection and carrier sampling. The scene and DOM have
    // separate RAF callbacks; neither is allowed to run one visible frame ahead.
    const rendered = this.options.onCameraProgress?.(carrierCameraProgress(this.flight.value));
    const sample = this.options.sampleCarrier?.();
    const screenOrigin = sample?.origin ?? this.options.origin ?? { x: rect.left + rect.width * .25, y: rect.top + rect.height * .65 };
    const origin = carrierLocalPoint(screenOrigin, rect, surface);
    const { x, y } = origin;
    this.root.style.setProperty("--projection-origin-x", x + "px");
    this.root.style.setProperty("--projection-origin-y", y + "px");
    const f = this.frameState = carrierFrame(this.flight.value, surface, this.imageBox, this.options.reducedMotion ? undefined : rendered || undefined);
    const environment = this.root.querySelector<HTMLElement>(".projection-environment")!;
    const header = this.root.querySelector<HTMLElement>(".projection-header")!;
    const ignition = this.root.querySelector<HTMLElement>(".projection-ignition")!;
    environment.style.opacity = String(f.environment);
    header.style.opacity = String(f.header);
    header.style.transform = "translateY(" + ((1-f.header)*8).toFixed(2) + "px)";
    this.host.style.opacity = String(f.image);
    this.host.style.transform = f.transform;
    this.host.style.clipPath = `inset(${((1 - f.reveal) * 100).toFixed(3)}% 0 0 0)`;
    this.host.style.setProperty("--carrier-plane-frame", String(f.frame));
    this.root.style.setProperty("--carrier-interface", String(f.interface));
    this.root.style.setProperty("--carrier-light", String(f.light));
    ignition.style.opacity = String(f.light);
    const svg = ignition.querySelector("svg");
    if (svg) {
      svg.setAttribute("viewBox", "0 0 " + surface.width + " " + surface.height);
      const [a,b,c,d] = f.corners;
      const point = (v: { x: number; y: number }) => v.x.toFixed(2) + "," + v.y.toFixed(2);
      const originText = x.toFixed(2) + "," + y.toFixed(2);
      const lerp = (from: { x: number; y: number }, to: { x: number; y: number }, t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      const centre = { x: (a.x + b.x + c.x + d.x) / 4, y: (a.y + b.y + c.y + d.y) / 4 };
      const sourcePoint = { x, y }, tip = lerp(sourcePoint, centre, f.beamReach);
      const ends = f.corners.map(corner => ({ x: tip.x + (corner.x - centre.x) * f.beamReach * f.beamSpread, y: tip.y + (corner.y - centre.y) * f.beamReach * f.beamSpread }));
      const [la,lb,lc,ld] = ends;
      // Extend the actual light volume from the source before widening its
      // aperture. Opacity alone would make a complete triangle simply pop in.
      ignition.querySelector(".carrier-volume")!.setAttribute("d", "M" + originText + " L" + point(la) + " L" + point(lb) + " Z");
      ignition.querySelector(".carrier-inner-volume")!.setAttribute("d", "M" + originText + " L" + point(ld) + " L" + point(lc) + " Z");
      ignition.querySelector(".carrier-rays")!.setAttribute("d", "M" + point(la) + " L" + originText + " L" + point(lb) + " M" + point(ld) + " L" + originText + " L" + point(lc));
      const sections = [.34,.61,.83].map(distance => "M" + point(lerp(sourcePoint,la,distance)) + " L" + point(lerp(sourcePoint,lb,distance)) + " M" + point(lerp(sourcePoint,ld,distance)) + " L" + point(lerp(sourcePoint,lc,distance))).join(" ");
      ignition.querySelector(".carrier-cross-sections")!.setAttribute("d", sections);
      const rim = ignition.querySelector(".carrier-image-outline") as SVGElement;
      rim.setAttribute("d", "M" + point(la) + " L" + point(lb) + " L" + point(lc) + " L" + point(ld) + " Z");
      rim.style.opacity = String(f.frame * .7);
      rim.style.strokeDashoffset = String(1 - f.frame);
      const scan = ignition.querySelector(".carrier-image-scan") as SVGElement;
      scan.setAttribute("d", "M" + point(f.scanLine[0]) + " L" + point(f.scanLine[1]));
      scan.style.opacity = String(Math.sin(Math.PI * f.reveal) * .8);
      const source = ignition.querySelector(".carrier-source") as SVGGElement;
      source.setAttribute("transform", "translate(" + x + "," + y + ")");
      source.style.opacity = String(f.emitter);
      const halo = ignition.querySelector(".carrier-emitter")!;
      halo.setAttribute("rx", String(12 + 43 * f.charge)); halo.setAttribute("ry", String(6 + 19 * f.charge));
      const ring = ignition.querySelector(".carrier-aperture-ring")!;
      ring.setAttribute("rx", String(8 + 16 * f.charge)); ring.setAttribute("ry", String(4 + 6 * f.charge));
      const edge = sample?.edge?.map(p => carrierLocalPoint(p, rect, surface));
      const edgePoints = edge ? edge.map(p => ({ x: (p.x - origin.x) * f.charge, y: (p.y - origin.y) * f.charge })) : [{ x: -30*f.charge, y: 0 }, { x: 30*f.charge, y: 0 }];
      ignition.querySelector(".carrier-aperture-edge")!.setAttribute("d", "M" + point(edgePoints[0]) + " L" + point(edgePoints[1]));
      const channel = ignition.querySelector<HTMLElement>(".carrier-channel")!;
      channel.style.left = (x + 26) + "px";
      channel.style.top = (y + 28) + "px";
      channel.style.opacity = String(f.emitter);
      channel.querySelector(".carrier-channel-state")!.textContent = this.closing ? "投影收束" : f.beat === "ignition" ? "投影开启" : f.beat === "beam-forming" ? "光场展开" : f.beat === "image-forming" ? "影像形成" : "投影已建立";
      channel.querySelector<HTMLElement>("b")!.style.transform = `scaleX(${Math.min(1, this.flight.value / .38)})`;
    }
    this.setBeat(this.closing ? "returning" : f.beat);
  }

  private advanceFlight = (now: number) => {
    this.flight.step(this.clock.step(now, this.options.manualClock || !document.hidden));
    this.paintFlight();
    if (this.flight.active || Math.abs((this.frameState?.camera ?? this.flight.target) - this.flight.target) > 1e-9) {
      if (!this.options.manualClock) this.flightRaf = requestAnimationFrame(this.advanceFlight);
    }
    else if (this.closing) this.finishClose();
    else this.finishEntrance();
  };

  /** Milliseconds since the first manual open; keep increasing across return
   * and reopen. A capture can repaint at the same time after drawing the scene
   * so its image uses exactly that drawn camera and real carrier source. */
  advancePresentation(elapsedMs: number) {
    if (!this.options.manualClock) throw new Error("Manual projection stepping requires an explicit frame-review clock");
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("Projection review time must be a finite nonnegative value");
    if (this.isOpen) this.advanceFlight(elapsedMs);
    return this.getStats();
  }

  private finishEntrance() {
    this.flight.jump(1);
    this.host.style.transform = "none";
    this.host.style.opacity = "1";
    this.host.style.clipPath = "none";
    this.root.style.setProperty("--carrier-interface", "1");
    this.host.inert = false;
    this.root.dataset.state = "open";
    this.root.querySelector<HTMLElement>(".projection-ignition")!.style.opacity = "0";
    this.setBeat("open");
  }

  private openCube(data: CubeProjectionData) {
    const record = this.record!;
    let selected = Math.min(data.experiments.length - 1, this.presetMemory.get(record.id) ?? 0);
    this.host.innerHTML = `<div class="cube-preset-rail"><label><span>构造</span><select aria-label="载入实验构造">${data.experiments.map((experiment, i) => `<option value="${i}">${escapeHtml(experiment.title)}</option>`).join("")}</select></label><span class="cube-preset-count" aria-hidden="true"></span><details class="cube-experiment-recap"><summary><span>${escapeHtml(data.retrospectiveLabel ?? "构造记录")}</span><span class="cube-recap-toggle" aria-hidden="true">＋</span></summary><div class="cube-recap-content"><header class="cube-recap-heading"><div><small>EXPERIMENT RECORD</small><h2></h2></div><button type="button" data-recap-close aria-label="关闭构造记录">×</button></header><div class="cube-recap-reading"></div></div></details></div><div class="cube-host"></div>`;
    const select = this.host.querySelector<HTMLSelectElement>(".cube-preset-rail select")!;
    const recap = this.host.querySelector<HTMLDetailsElement>(".cube-experiment-recap")!;
    recap.addEventListener("toggle", () => {
      recap.querySelector(".cube-recap-toggle")!.textContent = recap.open ? "−" : "＋";
    });
    select.value = String(selected);
    const paintRecap = () => {
      const experiment = data.experiments[selected]; if (!experiment) return;
      this.host.querySelector(".cube-preset-count")!.textContent = `${String(selected + 1).padStart(2, "0")} / ${String(data.experiments.length).padStart(2, "0")}`;
      this.host.querySelector(".cube-recap-heading h2")!.textContent = experiment.title;
      this.host.querySelector(".cube-recap-reading")!.innerHTML = `<div class="projection-recap">${experiment.retrospective.map(p => `<p>${escapeHtml(p)}</p>`).join("")}</div><div class="projection-sources">${sourceMarkup(experiment.sources)}</div>`;
      this.host.querySelector<HTMLElement>(".cube-experiment-recap")!.dataset.experiment = experiment.id;
      this.cube?.setArchiveContext(experiment.title, experiment.description, experiment.state);
    };
    this.cube = new CubeProjection(this.host.querySelector(".cube-host")!, { experiment: this.cubeSnapshots.get(record.id) ?? data.experiments[selected]?.state, reducedMotion: this.options.reducedMotion });
    paintRecap();
    const view = this.cubeViews.get(record.id);
    if (view) this.cube.restoreInspectionState(view);
    select.addEventListener("change", () => {
      selected = Number(select.value); this.presetMemory.set(record.id, selected);
      this.cube?.loadExperiment(data.experiments[selected]?.state, { resetHistory: true }); paintRecap();
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
      if (!this.options.manualClock) this.clock.step(performance.now(), !document.hidden);
      this.flight.move(0, this.clock.value, Math.max(850, this.flight.value * CARRIER_RETURN_MS));
      this.setBeat("returning");
      if (!this.options.manualClock) this.flightRaf = requestAnimationFrame(this.advanceFlight);
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
  getStats() { return { open: this.isOpen, kind: this.record?.projection?.kind, phase: this.root.dataset.state, beat: this.currentBeat, flight: { progress: this.flight.value, velocity: this.flight.velocity, presentedMs: this.clock.value, camera: this.frameState?.camera, requestedCamera: this.frameState?.requestedCamera, perspective: this.frameState?.rig.perspective, position: this.frameState?.rig.position, aim: this.frameState?.rig.aim, image: this.frameState?.image, reveal: this.frameState?.reveal, beamReach: this.frameState?.beamReach, environment: this.frameState?.environment, corners: this.frameState?.corners, trace: [...this.beatTrace] }, record: this.record?.id, research: this.research?.getStats(), cube: this.cube?.getStats() }; }
  dispose() { this.close(true); cancelAnimationFrame(this.flightRaf); this.root.remove(); }
}
