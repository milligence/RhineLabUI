import { escapeHtml } from "./html";
import { researchStatus, safeSourceUrl, type ArchiveSource, type ResearchProjectionData } from "./projection-types";
import { buildResearchFormation, sampleResearchEdge, sampleResearchNode, type ResearchNodeFormationCue, type ResearchEdgeFormationCue } from "./research-formation";
import { carrierReadingChannels } from "./carrier-flight";
import "./research-optics.css";
import "./research-tree.css";

export function sourceMarkup(sources: ArchiveSource[]) {
  return sources.map(source => {
    const href = safeSourceUrl(source.url);
    const label = escapeHtml(source.label);
    return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true">↗</span></a>`
      : `<span title="${escapeHtml(source.path ?? source.label)}">${label}</span>`;
  }).join("");
}

type ReadingPosition = { body: number; record: number; retrospective: number; evidence: number };
export interface ResearchViewState {
  selected: string; x: number; y: number; scale: number; focused?: boolean;
  reading?: Record<string, ReadingPosition>;
}
type Point = { x: number; y: number };
type Node = ResearchProjectionData["nodes"][number];
type FormingEdge = ResearchEdgeFormationCue & { path: SVGPathElement; mask: SVGPathElement; id: string; samples: Point[]; head: SVGCircleElement; trace: SVGPathElement; grains: SVGCircleElement[] };
let formationInstance = 0;
const exposure = (value: number, start: number, end: number) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

/** A complete research field and a carrier-anchored optical reading constellation. */
export class ResearchProjection {
  private stage: HTMLElement;
  private map: HTMLElement;
  private body: HTMLElement;
  private inspector: HTMLElement;
  private timeline: HTMLInputElement;
  private playButton: HTMLButtonElement;
  private nodes: HTMLButtonElement[];
  private ordered: Node[];
  private positions = new Map<string, Point>();
  private labelMetrics = new Map<string, { width: number; height: number }>();
  private phasePositions: { id: number; x: number; title: string; date: string; left?: number; width?: number }[] = [];
  private lanePositions: { lane: number; y: number; title: string }[] = [];
  private selected = 0;
  private reading = new Map<string, ReadingPosition>();
  private x = 0;
  private y = 0;
  private scale = 1;
  /** The held image may use more of the stage than the saved reading view. */
  private renderedMapScale = 1;
  private velocity = { x: 0, y: 0, scale: 0 };
  private target = { x: 0, y: 0, scale: 0 };
  private mapWidth = 1;
  private mapHeight = 1;
  private reduced: boolean;
  private focused = false;
  private settled = true;
  private flightFrame = 0;
  private flightLast = 0;
  private playing = false;
  private playPosition = 0;
  private route: number[];
  private playFrame = 0;
  private playLast = 0;
  private elapsed = 0;
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  private dragged = false;
  private pinchDistance = 0;
  private abort = new AbortController();
  private observer: ResizeObserver;
  private resizeFrame = 0;
  private formation = 1;
  private formationEdges: FormingEdge[] = [];
  private formationNodes: { node: HTMLElement; cue: ResearchNodeFormationCue }[] = [];
  private readingProgress = 1;
  private presentationSuspended = false;
  private suspendedTarget?: { x: number; y: number; scale: number };
  private suspendedReplay = false;
  private playTick?: FrameRequestCallback;
  private presentationScale = 1;
  private presentationDetail = 1;
  private presentationNames = 1;
  private presentationLabels = new Set<string>();

  constructor(private host: HTMLElement, private data: ResearchProjectionData, options: { reducedMotion?: boolean; state?: ResearchViewState } = {}) {
    this.reduced = options.reducedMotion ?? false;
    this.ordered = [...data.nodes].sort((a, b) => a.stage - b.stage || a.lane - b.lane);
    this.route = (data.narrativePath ?? this.ordered.map(n => n.id)).map(id => this.ordered.findIndex(n => n.id === id)).filter(i => i >= 0);
    this.reading = new Map(Object.entries(options.state?.reading ?? {}));
    this.layout();
    const edges = data.edges.map(edge => {
      const a = this.positions.get(edge.from), b = this.positions.get(edge.to);
      if (!a || !b) return "";
      const bend = Math.max(36, Math.abs(b.x - a.x) * .48);
      const result = this.ordered.find(node => node.id === edge.to)?.status;
      let path = `M${a.x},${a.y} C${a.x + bend},${a.y} ${b.x - bend},${b.y} ${b.x},${b.y}`;
      if (data.layout === "evolution" && b.x - a.x > 620) {
        const rail = edge.kind === "branch" ? Math.min(a.y, b.y) - 100 : Math.max(a.y, b.y) + 100;
        path = `M${a.x},${a.y} C${a.x + 80},${a.y} ${a.x + 70},${rail} ${a.x + 160},${rail} L${b.x - 160},${rail} C${b.x - 70},${rail} ${b.x - 80},${b.y} ${b.x},${b.y}`;
      }
      return `<path data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" data-kind="${edge.kind ?? "continuation"}" data-weight="${edge.weight ?? "secondary"}" data-result="${result ?? "tested"}" d="${path}"/>`;
    }).join("");
    host.innerHTML = `<div class="projection-body research-body" data-view="overview" data-layout="${data.layout ?? "catalogue"}" data-settled="true">
      <div class="research-optical-volume" aria-hidden="true"><div class="research-optical-floor"></div><div class="research-optical-plane"></div></div>
      <div class="research-stage" tabindex="0" aria-label="完整研究进化树。拖动浏览，滚轮缩放，选择节点展开记录。方向键切换，Home 返回全图。">
        <div class="research-stage-label"><span>RESEARCH LINEAGE <b>${String(this.ordered.length).padStart(2, "0")}</b></span><span>主干 · 分歧 · 合流</span></div>
        ${data.layout === "evolution" ? `<nav class="research-acts" aria-label="按研究阶段浏览" style="grid-template-columns:${(data.phases ?? []).map(phase => `${Math.max(7, phase.title.length + 2)}fr`).join(" ")}">${(data.phases ?? []).map((phase, i) => `<button type="button" data-phase="${phase.id}" aria-pressed="false" title="${escapeHtml(phase.summary ?? phase.title)}"><small>${String(i + 1).padStart(2, "0")}</small><span>${escapeHtml(phase.title)}</span><time>${escapeHtml(phase.date)}</time></button>`).join("")}</nav>` : ""}
        <div class="research-status-key" aria-label="节点状态图例"><span><i class="question"></i>问题</span><span><i class="tested"></i>已检验</span><span><i class="negative"></i>负结果</span><span><i class="paused"></i>暂缓</span></div>
        <div class="research-map-viewport"><div class="research-map" style="width:${this.mapWidth}px;height:${this.mapHeight}px">
          ${data.layout === "evolution" ? this.phasePositions.map(p => `<div class="research-era" data-phase-id="${p.id}" style="left:${p.left}px;width:${p.width}px;height:${this.mapHeight - 90}px"><span>${escapeHtml(p.title)}</span></div>`).join("") : ""}
          <svg class="research-links" width="${this.mapWidth}" height="${this.mapHeight}" aria-hidden="true">${edges}</svg>
          ${this.phasePositions.map(p => `<div class="research-phase" style="left:${p.x}px;top:8px"><small>${escapeHtml(p.date)}</small><span>${escapeHtml(p.title)}</span></div>`).join("")}
          ${this.lanePositions.map(p => `<div class="research-thread" style="left:0;top:${p.y}px">${escapeHtml(p.title)}</div>`).join("")}
          ${this.ordered.map(node => { const p = this.positions.get(node.id)!; return `<button type="button" class="research-node" data-node="${escapeHtml(node.id)}" data-status="${node.status}" data-role="${node.role ?? "branch"}" data-mainline="${data.narrativePath ? data.narrativePath.includes(node.id) : true}" style="left:${p.x}px;top:${p.y}px" aria-label="${escapeHtml(node.title)}，${escapeHtml(node.date)}，${escapeHtml(node.statusLabel ?? researchStatus[node.status])}" aria-pressed="false"><span class="research-node-core" aria-hidden="true"><i></i></span><strong class="research-node-title"><span class="research-node-ink">${escapeHtml(node.title)}</span></strong></button>`; }).join("")}
        </div></div>
      </div>
      <svg class="research-focus-light" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="focus-beam" x1="0" y1="1" x2=".45" y2="0"><stop stop-color="var(--optical-accent)" stop-opacity=".20"/><stop offset=".28" stop-color="var(--optical-accent)" stop-opacity=".055"/><stop offset="1" stop-color="var(--optical-accent)" stop-opacity="0"/></linearGradient><linearGradient id="focus-white" x1="0" y1="1" x2="0" y2="0"><stop stop-color="white" stop-opacity=".36"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs><path class="focus-cone-fill" d="M170 452 L290 55 Q530 5 765 130 Z" fill="url(#focus-beam)"/><path d="M170 452 L290 55 Q440 35 555 75 Z" fill="url(#focus-white)"/><path class="focus-cone-edge" d="M170 452 L290 55 M170 452 L765 130"/><path class="focus-section-rim" d="M290 55 Q530 5 765 130 Q520 84 290 55 Z"/><ellipse class="focus-aperture" cx="170" cy="458" rx="58" ry="12"/><ellipse class="focus-aperture inner" cx="170" cy="458" rx="37" ry="7"/><path class="focus-guide record-guide" d="M170 452 L280 247 L321 247"/><path class="focus-guide retrospective-guide" d="M170 452 L635 318 L692 318"/><path class="focus-guide evidence-guide" d="M170 452 L335 508 L408 508"/></svg>
      <aside class="projection-inspector" aria-label="节点的当时记录、事后复盘与依据" aria-hidden="true" inert></aside>
      <button type="button" class="research-current-record" data-research="open"><span class="research-current-meta"></span><strong></strong><span class="research-current-action">读取记录 <i aria-hidden="true">↗</i></span></button>
      <button type="button" class="research-navigator" data-map="navigate" aria-label="完整研究进化树定位图，点击区域移动主视图"><span>全树定位</span><svg viewBox="0 0 ${this.mapWidth} ${this.mapHeight}" preserveAspectRatio="none" aria-hidden="true">${edges}${this.ordered.map(node => { const p = this.positions.get(node.id)!; return `<circle cx="${p.x}" cy="${p.y}" r="10"/>`; }).join("")}<rect class="research-navigator-window" x="0" y="0" width="1" height="1"/></svg></button>
      <div class="research-map-tools"><button type="button" data-map="fit" class="research-overview-action">↖ 完整进化树</button><span class="research-map-hint">拖动浏览 · 滚轮缩放</span><button type="button" data-map="out" aria-label="缩小研究图">−</button><output class="research-zoom">100%</output><button type="button" data-map="in" aria-label="放大研究图">＋</button></div>
    </div>
    <footer class="projection-timeline"><div class="projection-play-controls"><button type="button" data-research="prev" aria-label="${data.narrativePath ? "主线上一节点" : "上一节点"}">←</button><button type="button" data-research="play" aria-pressed="false">${data.narrativePath ? "主线回放" : "历程回放"}</button><button type="button" data-research="next" aria-label="${data.narrativePath ? "主线下一节点" : "下一节点"}">→</button></div><label class="projection-scrubber"><span class="research-route-label">${data.narrativePath ? "主线" : "历程"}</span><input type="range" min="0" max="${Math.max(0, this.route.length - 1)}" step="0.01" value="0" aria-label="${data.narrativePath ? "研究主线进程" : "研究历程进程"}"/></label><output class="projection-step" aria-live="polite"></output></footer>`;
    this.body = host.querySelector(".research-body")!;
    this.stage = host.querySelector(".research-stage")!;
    this.body.dataset.narrow = String(this.stage.clientWidth < 760);
    this.body.dataset.short = String(this.body.clientHeight < 500);
    this.map = host.querySelector(".research-map")!;
    this.inspector = host.querySelector(".projection-inspector")!;
    this.timeline = host.querySelector(".projection-scrubber input")!;
    this.playButton = host.querySelector('[data-research="play"]')!;
    this.nodes = [...host.querySelectorAll<HTMLButtonElement>("[data-node]")];
    this.prepareFormation();
    this.host.dataset.reduced = String(this.reduced);
    this.bind();
    let previous = { width: this.stage.clientWidth, height: this.body.clientHeight };
    this.observer = new ResizeObserver(() => {
      if (this.resizeFrame) return;
      // A short reading view deliberately gives the stage a taller canvas.
      // Mutating it inside its own ResizeObserver delivery creates a loop.
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = 0;
        if (this.abort.signal.aborted) return;
        const width = this.stage.clientWidth, height = this.body.clientHeight;
        if (previous.width === width && previous.height === height) return;
        if (this.focused) this.captureReadingPosition();
        this.body.dataset.narrow = String(width < 760);
        this.body.dataset.short = String(height < 500);
        previous = { width, height };
        if (!this.pointers.size) {
          if (this.focused) this.focusCamera(false);
          else this.fit(false);
        } else {
          this.paintPresentationMap();
          if (this.formation < 1) this.setFormation(this.formation, true);
        }
      });
    });
    this.observer.observe(this.stage);
    this.observer.observe(this.body);
    void document.fonts.ready.then(() => { if (!this.abort.signal.aborted) { this.labelMetrics.clear(); this.paintMap(); } });
    this.selectNode(Math.max(0, this.ordered.findIndex(n => n.id === data.entryNodeId)), false);
    // The host is already attached and measurable. Establish its real map
    // layout before the first optical frame, including a synchronous seek.
    if (options.state && this.positions.has(options.state.selected)) {
      this.selected = this.ordered.findIndex(n => n.id === options.state!.selected);
      this.x = options.state.x; this.y = options.state.y; this.scale = Math.max(.06, Math.min(2.2, options.state.scale));
      this.selectNode(this.selected, false); this.paintMap();
      if (options.state.focused) this.enterFocus(false);
    } else this.fit(false);
  }

  private prepareFormation() {
    const svg = this.map.querySelector<SVGSVGElement>(".research-links")!;
    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, "defs");
    const heads = document.createElementNS(ns, "g");
    heads.classList.add("research-formation-heads"); heads.style.display = "none";
    const serial = ++formationInstance;
    const paths = [...svg.querySelectorAll<SVGPathElement>("path[data-from]")];
    const schedule = buildResearchFormation(this.ordered.map(node => ({
      ...this.positions.get(node.id)!, id: node.id, stage: node.stage, lane: node.lane,
      role: node.role, mainline: this.route.includes(this.ordered.indexOf(node)),
    })), paths.map(path => ({
      from: path.dataset.from!, to: path.dataset.to!, length: Math.max(1, path.getTotalLength()),
      weight: path.dataset.weight as ResearchProjectionData["edges"][number]["weight"],
      kind: path.dataset.kind as ResearchProjectionData["edges"][number]["kind"],
    })), { entryNodeId: this.data.entryNodeId, narrativePath: this.data.narrativePath });
    this.formationNodes = this.nodes.map(node => ({ node, cue: schedule.nodes.get(node.dataset.node!)! }));
    const phases = this.data.phases ?? this.phasePositions;
    const landmarkPhases = phases.length <= 5 ? phases : Array.from({ length: 5 }, (_, i) => phases[Math.round(i * (phases.length - 1) / 4)]);
    for (const phase of landmarkPhases) {
      const explicit = "entryNodeId" in phase ? phase.entryNodeId : undefined;
      const node = this.ordered.find(node => node.id === explicit) ?? this.ordered.find(node => node.phase === phase.id);
      if (node) this.presentationLabels.add(node.id);
    }
    // Outcomes, not an arbitrary sprinkling of names, provide two secondary
    // landmarks. The selected record already has its own larger caption.
    for (const status of ["negative", "paused"] as const) {
      const node = this.ordered.find(node => node.status === status);
      if (node && this.presentationLabels.size < 7) this.presentationLabels.add(node.id);
    }
    for (const index of [this.route[0], this.route.at(-1)]) {
      if (index !== undefined && this.presentationLabels.size < 6) this.presentationLabels.add(this.ordered[index].id);
    }
    paths.forEach((path, index) => {
      const id = `research-deposit-${serial}-${index}`;
      const cue = schedule.edges[index], length = cue.length;
      const mask = document.createElementNS(ns, "mask");
      mask.id = id; mask.setAttribute("maskUnits", "userSpaceOnUse"); mask.setAttribute("maskContentUnits", "userSpaceOnUse");
      mask.setAttribute("x", "-100"); mask.setAttribute("y", "-100");
      mask.setAttribute("width", String(this.mapWidth + 200)); mask.setAttribute("height", String(this.mapHeight + 200));
      const brush = document.createElementNS(ns, "path");
      brush.setAttribute("d", path.getAttribute("d")!);
      // A broad mask brush covers the path at every map zoom. Its dash length
      // stays in user units; non-scaling-stroke would break the measured arc.
      brush.style.cssText = "fill:none;stroke:white;stroke-width:64;stroke-linecap:butt;stroke-linejoin:round;vector-effect:none;transition:none;opacity:1;";
      brush.style.strokeDasharray = `${length} ${length + 1}`;
      brush.style.strokeDashoffset = String(length);
      mask.append(brush); defs.append(mask);
      // Sample the real arc once. The moving light and its microscopic edge
      // scatter use these same coordinates, never a second substitute drawing.
      const samples = Array.from({ length: 97 }, (_, i) => {
        const point = path.getPointAtLength(length * i / 96);
        return { x: point.x, y: point.y };
      });
      const trace = document.createElementNS(ns, "path");
      trace.setAttribute("d", path.getAttribute("d")!);
      trace.style.cssText = "fill:none;stroke:var(--optical-accent);stroke-linecap:round;vector-effect:none;transition:none;opacity:0;";
      const head = document.createElementNS(ns, "circle");
      head.style.cssText = "fill:var(--optical-accent);stroke:var(--theme-paper);stroke-width:0.45;vector-effect:non-scaling-stroke;opacity:0;";
      const grains = Array.from({ length: cue.primary ? 3 : 2 }, () => {
        const grain = document.createElementNS(ns, "circle");
        grain.style.cssText = "fill:var(--optical-accent);stroke:none;opacity:0;";
        return grain;
      });
      heads.append(trace, ...grains, head);
      const edge: FormingEdge = { ...cue, path, mask: brush, id, samples, head, trace, grains };
      this.formationEdges.push(edge);
    });
    for (const { node, cue } of this.formationNodes) {
      const incoming = this.formationEdges.filter(edge => edge.to === cue.id && !edge.feedback).sort((a, b) => b.end - a.end)[0];
      if (incoming) {
        const end = incoming.samples.at(-1)!, before = incoming.samples.at(-2)!;
        node.style.setProperty("--formation-origin", `${Math.atan2(before.x - end.x, end.y - before.y) * 180 / Math.PI}deg`);
      }
    }
    svg.prepend(defs); svg.append(heads);
  }

  /** The same measured tree is deposited and withdrawn by a pure clock.
   * Reading has its own camera channel and never becomes part of this image. */
  setFormation(value: number, force = false) {
    const progress = this.reduced ? 1 : Math.max(0, Math.min(1, value));
    if (this.formation === progress && !force) return;
    this.formation = progress;
    const forming = progress < 1;
    this.body.dataset.forming = String(forming);
    const heads = this.map.querySelector<SVGGElement>(".research-formation-heads")!;
    heads.style.display = forming ? "" : "none";
    for (const { node, cue } of this.formationNodes) {
      const { core } = sampleResearchNode(cue, progress);
      node.style.setProperty("--formation-core", String(exposure(core, 0, .24)));
      node.style.setProperty("--formation-sweep", `${(core * 390).toFixed(4)}deg`);
      node.style.setProperty("--formation-fill", String(exposure(core, .38, 1)));
    }
    for (const edge of this.formationEdges) {
      if (!forming) { edge.path.removeAttribute("mask"); continue; }
      edge.path.setAttribute("mask", `url(#${edge.id})`);
      const sample = sampleResearchEdge(edge, progress);
      edge.mask.style.strokeDashoffset = String(edge.length - sample.distance);
      const pixelScale = Math.max(.04, (this.renderedMapScale ?? this.scale) * this.presentationScale);
      const energy = sample.head * (edge.primary ? .90 : .52);
      edge.head.style.opacity = String(energy);
      edge.trace.style.opacity = String(energy * .46);
      if (energy < .0001) { edge.grains.forEach(grain => grain.style.opacity = "0"); continue; }
      const point = this.formationPoint(edge, sample.growth);
      edge.head.setAttribute("cx", String(point.x)); edge.head.setAttribute("cy", String(point.y));
      edge.head.setAttribute("r", String((edge.primary ? 1.05 : .72) / pixelScale));
      const tail = Math.min(sample.distance, (edge.primary ? 12 : 8) / pixelScale);
      edge.trace.style.strokeDasharray = `0 ${Math.max(0, sample.distance - tail)} ${tail} ${edge.length + 1}`;
      edge.trace.style.strokeWidth = String((edge.primary ? 1.35 : .85) / pixelScale);
      edge.grains.forEach((grain, i) => {
        // Fixed phase and a bounded distance from the real front: no per-frame
        // random noise, lingering cloud, independent particle clock or flicker.
        const phase = sample.growth * Math.PI * 2 + edge.index * .73 + i * 2.1;
        const distance = Math.max(0, sample.distance - (2.2 + i * 3.1) / pixelScale);
        const at = this.formationPoint(edge, distance / edge.length);
        const spread = Math.sin(phase) * (1.1 + i * .45) / pixelScale;
        grain.setAttribute("cx", String(at.x - at.dy * spread));
        grain.setAttribute("cy", String(at.y + at.dx * spread));
        grain.setAttribute("r", String((.30 + i * .09) / pixelScale));
        grain.style.opacity = String(energy * (.22 + .22 * (1 + Math.cos(phase)) / 2));
      });
    }
  }

  private formationPoint(edge: FormingEdge, progress: number) {
    const index = Math.max(0, Math.min(1, progress)) * (edge.samples.length - 1);
    const before = Math.min(edge.samples.length - 2, Math.floor(index)), t = index - before;
    const a = edge.samples[before], b = edge.samples[before + 1];
    const length = Math.max(.001, Math.hypot(b.x - a.x, b.y - a.y));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / length, dy: (b.y - a.y) / length };
  }

  /** Text is made readable by approach, after the complete tree has formed.
   * A nested ink span preserves the existing collision/focus visibility. */
  setReadingProgress(value: number, force = false) {
    const progress = this.reduced ? 1 : Math.max(0, Math.min(1, value));
    if (this.readingProgress === progress && !force) return;
    this.readingProgress = progress;
    this.paintPresentationMap();
    const channels = carrierReadingChannels(progress);
    this.body.style.setProperty("--reading-context", String(channels.context));
    this.body.style.setProperty("--reading-content", String(channels.reading));
    for (const { node, cue } of this.formationNodes) {
      const landmark = this.presentationLabels.has(cue.id);
      const start = (landmark ? .12 : .34) + cue.arrival * .13;
      const end = (landmark ? .54 : .80) + cue.arrival * .12;
      node.style.setProperty("--reading-node", String(exposure(progress, start, end)));
    }
    if (this.formation < 1) this.setFormation(this.formation, true);
  }

  /** Keep the held image optically legible without moving a single graph
   * anchor. More names become readable as this same plate approaches. */
  setPresentationScale(value: number, force = false) {
    const scale = this.reduced ? 1 : Math.max(.15, Math.min(1, value));
    if (!force && (scale === this.presentationScale || (scale !== 1 && Math.abs(scale - this.presentationScale) < .0001))) return;
    this.presentationScale = scale;
    this.presentationDetail = exposure(scale, .60, .94);
    this.presentationNames = exposure(scale, .80, .96);
    this.body.dataset.projecting = String(scale < .9999);
    const style = this.body.style;
    style.setProperty("--projection-label-size", String(Math.min(2, 1 / scale)));
    style.setProperty("--projection-caption-size", String(Math.min(1.5, 1 / Math.sqrt(scale))));
    style.setProperty("--projection-core-main", String(Math.min(1.22, 1 / Math.sqrt(scale))));
    style.setProperty("--projection-core-selected", String(Math.min(1.65, 1 / Math.sqrt(scale))));
    style.setProperty("--projection-line-main", String(Math.min(1.9, 1 / scale)));
    style.setProperty("--projection-line-secondary", String(Math.min(1.6, 1 / scale)));
    style.setProperty("--projection-detail", String(this.presentationDetail));
    style.setProperty("--projection-name-clip", `${((1 - this.presentationNames) * 100).toFixed(4)}%`);
    this.paintPresentationMap();
    this.paintPresentationLabels();
    if (this.formation < 1) this.setFormation(this.formation, true);
  }

  private paintPresentationLabels() {
    if (this.presentationScale >= .9999) {
      this.nodes.forEach(node => { delete node.dataset.projectionLandmark; });
      return;
    }
    let landmarks = this.presentationLabels;
    if (this.stage.clientWidth < 760 && !this.focused) {
      const bounds = this.overviewViewport(), width = this.stage.clientWidth;
      const boost = Math.min(2, 1 / this.presentationScale), textScale = Math.max(this.scale, .92) * boost;
      const selectedId = this.ordered[this.selected]?.id;
      const candidates = this.nodes.flatMap(node => {
        const id = node.dataset.node!;
        if (id === selectedId) return [];
        const p = this.positions.get(id)!, metrics = this.labelMetrics.get(id);
        if (!metrics) return [];
        const x = this.x + p.x * this.scale, y = this.y + p.y * this.scale;
        const offset = parseFloat(node.style.getPropertyValue("--label-offset")) * this.scale;
        const top = y + (Number.isFinite(offset) ? offset : 14);
        const box = { left: x - metrics.width * textScale / 2, right: x + metrics.width * textScale / 2, top, bottom: top + metrics.height * textScale };
        // A label counts as visible only when the complete boosted name fits;
        // a core near the viewport edge cannot justify half a clipped name.
        if (box.left < 12 || box.right > width - 12 || box.top < bounds.top + 4 || box.bottom > bounds.top + bounds.height - 4) return [];
        const index = this.ordered.findIndex(n => n.id === id);
        return [{ id, node, index, box, mainline: this.route.includes(index) }];
      });
      const chosen: typeof candidates = [];
      const add = (candidate: typeof candidates[number] | undefined) => {
        if (!candidate || chosen.some(n => n.id === candidate.id)) return;
        if (chosen.some(({ box }) => candidate.box.left < box.right + 7 && candidate.box.right > box.left - 7 && candidate.box.top < box.bottom + 6 && candidate.box.bottom > box.top - 6)) return;
        chosen.push(candidate);
      };
      add(candidates.filter(n => n.mainline && n.index < this.selected).sort((a, b) => b.index - a.index)[0]);
      add(candidates.filter(n => n.mainline && n.index > this.selected).sort((a, b) => a.index - b.index)[0]);
      const secondary = candidates.filter(n => !n.mainline).sort((a, b) => {
        const significance = (n: typeof a) => ["negative", "paused"].includes(n.node.dataset.status ?? "") ? 1 : 0;
        return significance(b) - significance(a) || Math.abs(a.index - this.selected) - Math.abs(b.index - this.selected);
      });
      for (const candidate of secondary) { if (chosen.length >= 3) break; add(candidate); }
      if (chosen.length < 2) for (const candidate of [...candidates].sort((a, b) => Math.abs(a.index - this.selected) - Math.abs(b.index - this.selected))) {
        if (chosen.length >= 2) break; add(candidate);
      }
      landmarks = new Set(chosen.map(n => n.id));
    }
    this.nodes.forEach(node => { node.dataset.projectionLandmark = String(landmarks.has(node.dataset.node!)); });
  }

  private layout() {
    if (this.data.layout === "evolution" && this.ordered.every(n => n.position)) {
      this.ordered.forEach(node => this.positions.set(node.id, { x: node.position!.x, y: node.position!.y + 105 }));
      this.mapWidth = Math.max(...this.ordered.map(n => n.position!.x)) + 160;
      this.mapHeight = Math.max(...this.ordered.map(n => n.position!.y)) + 240;
      this.phasePositions = (this.data.phases ?? []).map(phase => {
        const group = this.ordered.filter(n => n.phase === phase.id);
        const min = Math.min(...group.map(n => n.position!.x)), max = Math.max(...group.map(n => n.position!.x));
        return { ...phase, x: (min + max) / 2, left: min - 65, width: max - min + 130 };
      });
      return;
    }
    const phases = [...new Set(this.ordered.map(n => n.phase ?? Math.floor(n.stage / 5)))].sort((a, b) => a - b);
    const lanes = [...new Set(this.ordered.map(n => n.lane))].sort((a, b) => a - b);
    // Extra vertical slots preserve every node in dense phases without stacking labels.
    let y = 130;
    for (const lane of lanes) {
      const count = Math.max(...phases.map(phase => this.ordered.filter(n => n.lane === lane && (n.phase ?? Math.floor(n.stage / 5)) === phase).length), 1);
      const height = Math.max(115, count * 68 + 38);
      this.lanePositions.push({ lane, y: y + height / 2, title: this.ordered.find(n => n.lane === lane)?.thread ?? `研究线 ${lanes.indexOf(lane) + 1}` });
      for (const phase of phases) {
        const group = this.ordered.filter(n => n.lane === lane && (n.phase ?? Math.floor(n.stage / 5)) === phase);
        group.forEach((node, i) => this.positions.set(node.id, { x: 160 + phases.indexOf(phase) * 255 + (group.length > 1 ? (i / (group.length - 1) - .5) * 62 : 0), y: y + height / 2 + (i - (group.length - 1) / 2) * 68 }));
      }
      y += height;
    }
    this.phasePositions = phases.map((id, i) => {
      const phase = this.data.phases?.find(p => p.id === id);
      const first = this.ordered.find(n => (n.phase ?? Math.floor(n.stage / 5)) === id)!;
      return { id, x: 160 + i * 255, title: phase?.title ?? `阶段 ${i + 1}`, date: phase?.date ?? first.date };
    });
    this.mapWidth = Math.max(550, 320 + (phases.length - 1) * 255);
    this.mapHeight = Math.max(360, y + 62);
  }

  private bind() {
    const signal = this.abort.signal;
    this.host.addEventListener("click", event => {
      const button = (event.target as Element).closest<HTMLButtonElement>("button");
      if (!button) return;
      const id = button.dataset.node ?? button.dataset.related;
      if (id) {
        if (this.dragged) { this.dragged = false; event.preventDefault(); return; }
        this.pause(); this.selectNode(this.ordered.findIndex(n => n.id === id), true);
        this.stage.focus({ preventScroll: true });
      }
      if (button.dataset.research === "play") this.playing ? this.pause() : this.play();
      if (button.dataset.research === "open") { this.pause(); this.selectNode(this.selected, true); }
      if (button.dataset.phase !== undefined) { this.pause(); this.framePhase(Number(button.dataset.phase)); }
      if (["prev", "next"].includes(button.dataset.research ?? "")) {
        this.pause(); this.stepRoute(button.dataset.research === "next" ? 1 : -1);
      }
      if (button.dataset.map === "fit") { this.pause(); this.fit(); }
      if (button.dataset.map === "navigate") {
        const rect = button.querySelector("svg")!.getBoundingClientRect();
        const worldX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * this.mapWidth;
        const worldY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * this.mapHeight;
        this.flyTo(this.stage.clientWidth / 2 - worldX * this.scale, this.overviewViewport().centerY - worldY * this.scale, this.scale);
      }
      if (["in", "out"].includes(button.dataset.map ?? "")) { if (this.focused) this.fit(); else this.zoom(button.dataset.map === "in" ? 1.25 : .8); }
      if (button.dataset.layer) this.highlightLayer(button.dataset.layer);
      if (button.dataset.sourceRef) this.highlightSource(button.dataset.sourceRef, true);
      if (button.dataset.layerJump) {
        this.highlightLayer(button.dataset.layerJump);
        const pane = this.inspector.querySelector<HTMLElement>(`[data-layer="${button.dataset.layerJump}"]`);
        pane?.querySelector<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
        if (this.stage.clientWidth < 760) pane?.scrollIntoView({ block: "start", behavior: this.reduced ? "instant" : "smooth" });
      }
    }, { signal });
    this.inspector.addEventListener("pointerover", event => {
      const layer = (event.target as Element).closest<HTMLElement>("[data-layer]");
      if (layer) this.highlightLayer(layer.dataset.layer!);
      const source = (event.target as Element).closest<HTMLElement>("[data-source-ref], [data-source-id]");
      if (source) this.highlightSource(source.dataset.sourceRef ?? source.dataset.sourceId!, false);
    }, { signal });
    this.inspector.addEventListener("focusin", event => {
      const layer = (event.target as Element).closest<HTMLElement>("[data-layer]");
      if (layer) this.highlightLayer(layer.dataset.layer!);
      const source = (event.target as Element).closest<HTMLElement>("[data-source-ref], [data-source-id]");
      if (source) this.highlightSource(source.dataset.sourceRef ?? source.dataset.sourceId!, false);
    }, { signal });
    this.timeline.addEventListener("input", () => { this.pause(); this.selectNode(this.route[Math.round(Number(this.timeline.value))] ?? this.selected, true); }, { signal });
    this.host.addEventListener("keydown", event => {
      if (event.key === "Escape" && this.focused) { event.preventDefault(); event.stopPropagation(); this.pause(); this.fit(); return; }
      if ((event.target as Element).closest("input, select, a, .projection-inspector")) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "+", "=", "-"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Home") { this.pause(); this.fit(); }
      else if (["+", "=", "-"].includes(event.key)) this.zoom(event.key === "-" ? .8 : 1.25);
      else { this.pause(); this.stepRoute(["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1); }
    }, { signal });
    this.stage.addEventListener("wheel", event => {
      if (this.focused) return;
      event.preventDefault(); const rect = this.stage.getBoundingClientRect();
      this.zoom(Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * .002), event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false, signal });
    this.stage.addEventListener("pointerdown", event => {
      if (event.button !== 0 || this.focused) return;
      this.stopFlight();
      if (!this.pointers.size) this.dragged = false;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
      this.pinchDistance = this.pointerDistance();
    }, { signal });
    this.stage.addEventListener("pointermove", event => {
      const p = this.pointers.get(event.pointerId); if (!p) return;
      const dx = event.clientX - p.x, dy = event.clientY - p.y;
      p.x = event.clientX; p.y = event.clientY;
      if (Math.hypot(p.x - p.startX, p.y - p.startY) > 6) this.dragged = true;
      if (this.dragged && !this.stage.hasPointerCapture(event.pointerId)) this.stage.setPointerCapture(event.pointerId);
      if (this.pointers.size > 1) {
        this.dragged = true; const distance = this.pointerDistance();
        if (this.pinchDistance > 0) this.zoom(distance / this.pinchDistance);
        this.pinchDistance = distance;
      } else if (this.dragged) { this.x += dx; this.y += dy; this.paintMap(); }
    }, { signal });
    const release = (event: PointerEvent) => { this.pointers.delete(event.pointerId); this.pinchDistance = 0; if (event.type === "pointercancel") this.dragged = true; };
    this.stage.addEventListener("pointerup", release, { signal });
    this.stage.addEventListener("pointercancel", release, { signal });
    this.stage.addEventListener("lostpointercapture", release, { signal });
  }

  private pointerDistance() { const p = [...this.pointers.values()]; return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
  private routeNeighbour(direction: 1 | -1) {
    const position = this.route.indexOf(this.selected);
    if (position >= 0) return this.route[position + direction];
    // A branch rejoins the surrounding mainline, while remaining directly
    // reachable from the map and the related-record links.
    const candidates = this.route.filter(index => direction > 0 ? index > this.selected : index < this.selected);
    return direction > 0 ? candidates[0] : candidates[candidates.length - 1];
  }
  private stepRoute(direction: 1 | -1) {
    const index = this.routeNeighbour(direction);
    if (index !== undefined) this.selectNode(index, true);
  }
  private captureReadingPosition() {
    const id = this.inspector.dataset.nodeId;
    // During a node transfer the new DOM is still at zero and its saved
    // position has not been restored. It must not replace that saved reading.
    if (!id || !this.focused || !this.settled || this.presentationSuspended) return;
    const top = (selector: string) => this.inspector.querySelector<HTMLElement>(selector)?.scrollTop ?? 0;
    this.reading.set(id, { body: this.body.scrollTop, record: top(".research-contemporary .research-plane-scroll"), retrospective: top(".research-hindsight .research-plane-scroll"), evidence: top(".research-evidence-scroll") });
  }
  private restoreReadingPosition() {
    const position = this.reading.get(this.ordered[this.selected]?.id);
    if (!position || !this.focused) return;
    this.body.scrollTop = position.body;
    for (const [selector, value] of [[".research-contemporary .research-plane-scroll", position.record], [".research-hindsight .research-plane-scroll", position.retrospective], [".research-evidence-scroll", position.evidence]] as const) {
      const pane = this.inspector.querySelector<HTMLElement>(selector);
      if (pane) pane.scrollTop = value;
    }
  }
  private overviewViewport() {
    const top = this.data.layout === "evolution" ? 126 : 70;
    const bottom = this.stage.clientWidth < 760 && this.data.layout === "evolution" ? 180 : 116;
    const height = Math.max(1, this.stage.clientHeight - top - bottom);
    return { top, bottom, height, centerY: top + height / 2 };
  }
  /** The image gets the stage while it forms; reading later reserves its rails.
   * Only this presented transform changes. The saved camera, world positions,
   * navigator and text collision layout continue to use the base x/y/scale.
   * The already-presented carrier camera is the sole interpolation clock. */
  private paintPresentationMap() {
    this.renderedMapScale = this.scale;
    const width = this.stage?.clientWidth, height = this.stage?.clientHeight;
    // Before attachment (and in isolated channel checks), layout may not yet
    // exist. Do not invent a viewport or mutate the user's reading snapshot.
    if (!this.map?.style || !Number.isFinite(width) || !Number.isFinite(height) ||
        width <= 0 || height <= 0 || !(this.mapWidth > 0) || !(this.mapHeight > 0)) return;
    const bounds = this.overviewViewport();
    let x = this.x, y = this.y, scale = this.scale;
    let top = bounds.top, bottom = bounds.bottom;
    if (!this.focused && width >= 760 && this.readingProgress < .58) {
      const transfer = exposure(this.readingProgress, .04, .58);
      const heldScale = Math.max(.001, Math.min((width - 70) / this.mapWidth, (height - 48) / this.mapHeight));
      const heldX = (width - this.mapWidth * heldScale) / 2;
      const heldY = (height - this.mapHeight * heldScale) / 2;
      x = heldX + (this.x - heldX) * transfer;
      y = heldY + (this.y - heldY) * transfer;
      scale = heldScale + (this.scale - heldScale) * transfer;
      top = 24 + (bounds.top - 24) * transfer;
      bottom = 24 + (bounds.bottom - 24) * transfer;
    }
    // At reading arrival, write the untouched base numbers verbatim rather
    // than interpolating at t=1 and accumulating a floating-point remainder.
    this.renderedMapScale = scale;
    this.map.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
    this.map.style.setProperty("--label-scale", String(Math.max(1, .92 / scale)));
    this.map.style.setProperty("--focus-label-scale", String(1 / scale));
    this.body.style.setProperty("--projection-clip-top", `${top}px`);
    this.body.style.setProperty("--projection-clip-bottom", `${bottom}px`);
    // SVG non-scaling-stroke does not cancel the CSS transforms on its map
    // and optical plate. Keep the held lineage a fine screen-space drawing,
    // then hand ink weight back to the unchanged reading theme.
    const pixelScale = Math.max(.04, scale * this.presentationScale);
    const heldInk = 1 - exposure(this.readingProgress, .40, .94);
    const mainInk = this.focused ? Math.min(1.9, 1 / this.presentationScale) : 1 + (Math.max(1, .9 / (1.7 * pixelScale)) - 1) * heldInk;
    const secondaryInk = this.focused ? Math.min(1.6, 1 / this.presentationScale) : 1 + (Math.max(1, .55 / (.8 * pixelScale)) - 1) * heldInk;
    this.body.style.setProperty("--projection-line-main", String(mainInk));
    this.body.style.setProperty("--projection-line-secondary", String(secondaryInk));
  }
  private paintMap() {
    this.paintPresentationMap();
    this.host.querySelector(".research-zoom")!.textContent = `${Math.round(this.scale * 100)}%`;
    this.body.dataset.density = this.scale < (this.data.layout === "evolution" ? .21 : .3) ? "compact" : "readable";
    this.placeLabels();
    this.paintPresentationLabels();
    const viewport = this.host.querySelector<SVGRectElement>(".research-navigator-window")!;
    const bounds = this.overviewViewport();
    const clampX = (x: number) => Math.max(0, Math.min(this.mapWidth, x));
    const clampY = (y: number) => Math.max(0, Math.min(this.mapHeight, y));
    const left = clampX(-this.x / this.scale), top = clampY((bounds.top - this.y) / this.scale);
    const right = clampX((this.stage.clientWidth - this.x) / this.scale), bottom = clampY((bounds.top + bounds.height - this.y) / this.scale);
    viewport.setAttribute("x", String(left)); viewport.setAttribute("y", String(top));
    viewport.setAttribute("width", String(Math.max(0, right - left)));
    viewport.setAttribute("height", String(Math.max(0, bottom - top)));
    // A fit, restored snapshot or font/layout change also changes the real
    // scale of the deposit heads, even when the optical clock is paused.
    if (this.formation < 1) this.setFormation(this.formation, true);
  }
  private placeLabels() {
    if (this.data.layout !== "evolution" || this.focused) return;
    // Names remain legible in screen space. Reserve space for the selected
    // record and the spine first; minor labels yield only when no clear slot
    // remains, and are always revealed by hover or keyboard focus.
    const boxes: { left: number; right: number; top: number; bottom: number }[] = [];
    const textScale = Math.max(this.scale, .92);
    const priority = (node: HTMLButtonElement) => (node.classList.contains("is-selected") ? 100 : 0) + (node.dataset.mainline === "true" ? 20 : 0) + (node.dataset.role === "spine" ? 20 : node.dataset.role === "component" ? 10 : 0);
    const labels = [...this.nodes].sort((a, b) => priority(b) - priority(a));
    for (const node of labels) {
      const p = this.positions.get(node.dataset.node!)!;
      const label = node.querySelector<HTMLElement>(".research-node-title")!;
      let metrics = this.labelMetrics.get(node.dataset.node!);
      if (!metrics) { metrics = { width: label.offsetWidth, height: label.offsetHeight }; this.labelMetrics.set(node.dataset.node!, metrics); }
      const width = metrics.width * textScale, height = metrics.height * textScale;
      const x = p.x * this.scale, y = p.y * this.scale;
      const offsets = [14, -14 - height, 22 + height, -22 - height * 2, 30 + height * 2, -30 - height * 3];
      let chosen = offsets[0], minimumOverlap = Infinity;
      let chosenBox = { left: x - width / 2 - 5, right: x + width / 2 + 5, top: y + chosen - 4, bottom: y + chosen + height + 4 };
      for (const offset of offsets) {
        const box = { left: x - width / 2 - 5, right: x + width / 2 + 5, top: y + offset - 4, bottom: y + offset + height + 4 };
        const overlap = boxes.reduce((sum, b) => sum + Math.max(0, Math.min(box.right, b.right) - Math.max(box.left, b.left)) * Math.max(0, Math.min(box.bottom, b.bottom) - Math.max(box.top, b.top)), 0);
        if (overlap < minimumOverlap) { minimumOverlap = overlap; chosen = offset; chosenBox = box; }
        if (!overlap) break;
      }
      const hidden = (minimumOverlap > 0 && node.dataset.mainline !== "true" && node.dataset.role === "branch" && !node.classList.contains("is-selected")) || (this.scale < .21 && priority(node) < 20);
      if (node.dataset.labelHidden !== String(hidden)) node.dataset.labelHidden = String(hidden);
      if (!hidden) boxes.push(chosenBox);
      node.style.setProperty("--label-offset", `${chosen / this.scale}px`);
    }
  }
  private stopFlight() { cancelAnimationFrame(this.flightFrame); this.flightFrame = 0; this.flightLast = 0; this.velocity = { x: 0, y: 0, scale: 0 }; }
  private flyTo(x: number, y: number, scale: number, animate = true) {
    this.target = { x, y, scale: Math.log(scale) };
    if (this.presentationSuspended) {
      // A viewport/font reframe during return owns the new destination.
      // Never restore a target measured against the viewport we just left.
      this.suspendedTarget = animate ? { ...this.target } : undefined;
      if (animate) return;
    }
    this.settled = false; this.body.dataset.settled = "false";
    if (this.reduced || !animate) {
      this.stopFlight(); this.x = x; this.y = y; this.scale = scale; this.paintMap(); this.finishFlight(); return;
    }
    if (this.flightFrame) return; // New target inherits current position and velocity.
    const tick = (ms: number) => {
      if (this.abort.signal.aborted) return;
      const dt = this.flightLast ? Math.min(.05, (ms - this.flightLast) / 1000) : 1 / 60;
      this.flightLast = ms;
      const spring = (value: number, v: number, target: number) => {
        const omega = 8.8, delta = value - target, c = v + omega * delta, decay = Math.exp(-omega * dt);
        return [(delta + c * dt) * decay + target, (v - omega * c * dt) * decay];
      };
      [this.x, this.velocity.x] = spring(this.x, this.velocity.x, this.target.x);
      [this.y, this.velocity.y] = spring(this.y, this.velocity.y, this.target.y);
      let logScale: number;
      [logScale, this.velocity.scale] = spring(Math.log(this.scale), this.velocity.scale, this.target.scale);
      this.scale = Math.exp(logScale); this.paintMap();
      if (Math.abs(this.x - this.target.x) + Math.abs(this.y - this.target.y) < .3 && Math.abs(logScale - this.target.scale) < .0004) {
        this.x = this.target.x; this.y = this.target.y; this.scale = Math.exp(this.target.scale); this.paintMap(); this.stopFlight(); this.finishFlight();
      } else this.flightFrame = requestAnimationFrame(tick);
    };
    this.flightFrame = requestAnimationFrame(tick);
  }
  private finishFlight() {
    this.settled = true; this.body.dataset.settled = "true"; this.inspector.inert = !this.focused;
    // Restore before exposing a settled snapshot to callers. Deferring this
    // one frame lets polling or an immediate close capture the temporary zero.
    this.restoreReadingPosition();
    requestAnimationFrame(() => { if (!this.abort.signal.aborted) this.paintAssociations(); });
  }
  private fit(animate = true) {
    this.captureReadingPosition();
    const restoreFocus = this.inspector.contains(document.activeElement);
    this.focused = false; this.body.dataset.view = "overview"; this.inspector.inert = true; this.inspector.setAttribute("aria-hidden", "true");
    if (restoreFocus) this.stage.focus({ preventScroll: true });
    this.body.scrollTop = 0;
    const w = this.stage.clientWidth;
    const mobile = w < 760;
    const bounds = this.overviewViewport();
    const scale = mobile ? .49 : Math.max(.06, Math.min(1, (w - 74) / this.mapWidth, bounds.height / this.mapHeight));
    const selected = this.positions.get(this.ordered[this.selected].id)!;
    const x = mobile ? Math.min(24, Math.max(w - this.mapWidth * scale - 24, w / 2 - selected.x * scale)) : (w - this.mapWidth * scale) / 2;
    // Mobile keeps names at a readable scale and frames the selected region.
    // Its centre belongs to the visible map, above the locator and controls.
    const scaledHeight = this.mapHeight * scale;
    const y = mobile && scaledHeight > bounds.height
      ? Math.max(bounds.top + bounds.height - scaledHeight, Math.min(bounds.top, bounds.centerY - selected.y * scale))
      : bounds.centerY - scaledHeight / 2;
    this.flyTo(x, y, scale, animate);
    this.host.querySelector(".research-map-hint")!.textContent = mobile ? "拖动浏览 · 双指缩放" : "拖动浏览 · 滚轮缩放";
    this.host.querySelectorAll("[data-phase]").forEach(button => { button.classList.remove("is-active"); button.setAttribute("aria-pressed", "false"); });
  }
  private framePhase(id: number) {
    const group = this.ordered.filter(n => n.phase === id);
    if (!group.length) return;
    this.captureReadingPosition();
    const restoreFocus = this.inspector.contains(document.activeElement);
    this.focused = false; this.body.dataset.view = "overview";
    this.inspector.inert = true; this.inspector.setAttribute("aria-hidden", "true");
    this.body.scrollTop = 0;
    if (restoreFocus) this.stage.focus({ preventScroll: true });
    const entry = this.data.phases?.find(phase => phase.id === id)?.entryNodeId ?? group[0].id;
    this.selectNode(Math.max(0, this.ordered.findIndex(node => node.id === entry)), false);
    this.host.querySelector(".research-map-hint")!.textContent = this.stage.clientWidth < 760 ? "拖动浏览 · 双指缩放" : "拖动浏览 · 滚轮缩放";
    const points = group.map(n => this.positions.get(n.id)!);
    const left = Math.min(...points.map(p => p.x)) - 95, right = Math.max(...points.map(p => p.x)) + 95;
    const top = Math.min(...points.map(p => p.y)) - 75, bottom = Math.max(...points.map(p => p.y)) + 105;
    const w = this.stage.clientWidth, h = this.stage.clientHeight, mobile = w < 760;
    const scale = Math.max(mobile ? .44 : .35, Math.min(.95, (w - 50) / (right - left), (h - (mobile ? 320 : 250)) / (bottom - top)));
    this.flyTo((w - (right - left) * scale) / 2 - left * scale, 128 + (h - (mobile ? 310 : 245) - (bottom - top) * scale) / 2 - top * scale, scale);
    this.host.querySelectorAll<HTMLElement>("[data-phase]").forEach(button => { const active = Number(button.dataset.phase) === id; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); });
  }
  private zoom(factor: number, cx = this.stage.clientWidth / 2, cy = this.overviewViewport().centerY) {
    if (this.focused) return;
    this.stopFlight(); const previous = this.scale;
    this.scale = Math.max(.06, Math.min(2.2, this.scale * factor));
    this.x = cx - (cx - this.x) * this.scale / previous; this.y = cy - (cy - this.y) * this.scale / previous;
    this.paintMap();
  }
  private enterFocus(animate = true) {
    this.focused = true; this.body.dataset.view = "focus"; this.body.dataset.layer = "record";
    this.inspector.setAttribute("aria-hidden", "false"); this.inspector.inert = true;
    this.host.querySelector(".research-map-hint")!.textContent = "ESC 返回全图";
    this.focusCamera(animate);
  }
  private focusCamera(animate = true) {
    const p = this.positions.get(this.ordered[this.selected]?.id); if (!p) return;
    const w = this.stage.clientWidth, h = this.stage.clientHeight, mobile = w < 760;
    const scale = mobile ? 1.05 : 1.35;
    // Identical screen datum is shared by the real graph node and cone geometry.
    const anchorX = w * (mobile ? .17 : .17), anchorY = mobile ? 236 : h * .753333;
    this.flyTo(anchorX - p.x * scale, anchorY - p.y * scale, scale, animate);
  }
  private highlightLayer(layer: string) { if (["record", "retrospective", "evidence"].includes(layer)) this.body.dataset.layer = layer; }
  private highlightSource(ref: string, scroll: boolean) {
    this.body.dataset.source = ref;
    this.highlightLayer(ref.startsWith("R") ? "record" : "retrospective");
    this.inspector.querySelectorAll<HTMLElement>("[data-source-id], [data-source-ref]").forEach(element => element.classList.toggle("is-source-active", (element.dataset.sourceId ?? element.dataset.sourceRef) === ref));
    if (scroll) {
      const row = this.inspector.querySelector<HTMLElement>(`[data-source-id="${ref}"]`);
      row?.scrollIntoView({ block: "nearest", behavior: this.reduced ? "instant" : "smooth" });
      row?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    }
  }
  private selectNode(index: number, focus = true) {
    if (!this.ordered.length) return;
    this.captureReadingPosition();
    const next = Math.max(0, Math.min(this.ordered.length - 1, index));
    // Narrow and short viewports scroll the whole constellation. A new node
    // starts at its source, not at the old node's hindsight or evidence footer.
    if (focus && next !== this.selected) this.body.scrollTop = 0;
    this.selected = next; this.dragged = false;
    const node = this.ordered[this.selected];
    this.host.querySelectorAll<HTMLElement>("[data-phase]").forEach(button => { const active = Number(button.dataset.phase) === node.phase; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); });
    this.nodes.forEach((button, i) => { button.classList.toggle("is-selected", i === this.selected); button.setAttribute("aria-pressed", String(i === this.selected)); button.tabIndex = i === this.selected ? 0 : -1; });
    this.map.querySelectorAll<SVGPathElement>("path[data-from]").forEach(path => path.classList.toggle("is-active", path.dataset.from === node.id || path.dataset.to === node.id));
    this.paintInspector(node);
    const routePosition = this.route.indexOf(this.selected);
    const precedingPosition = this.route.reduce((last, index, position) => index <= this.selected ? position : last, 0);
    this.timeline.value = String(routePosition >= 0 ? routePosition : precedingPosition);
    this.timeline.setAttribute("aria-valuetext", routePosition >= 0 ? `第 ${routePosition + 1} 项，共 ${this.route.length} 项，${node.title}` : `当前支线：${node.title}；滑动返回研究主线`);
    this.host.querySelector(".projection-step")!.innerHTML = `<span class="research-route-position">${routePosition >= 0 ? `<b>${String(routePosition + 1).padStart(2, "0")}</b> / ${String(this.route.length).padStart(2, "0")}` : "支线"}</span><span class="research-route-name">${escapeHtml(node.title)}</span><time>${escapeHtml(node.date)}</time>`;
    const current = this.host.querySelector<HTMLElement>(".research-current-record")!;
    current.querySelector(".research-current-meta")!.textContent = `${node.date} · ${node.statusLabel ?? researchStatus[node.status]}`;
    current.querySelector("strong")!.textContent = node.title;
    this.host.querySelector<HTMLButtonElement>('[data-research="prev"]')!.disabled = this.routeNeighbour(-1) === undefined;
    this.host.querySelector<HTMLButtonElement>('[data-research="next"]')!.disabled = this.routeNeighbour(1) === undefined;
    if (focus) this.enterFocus();
  }
  private paintInspector(node: Node) {
    delete this.body.dataset.source;
    const p = (value: string) => value.split(/\n\s*\n/).filter(Boolean).map(text => `<p>${escapeHtml(text)}</p>`).join("");
    const relations = this.data.edges.filter(edge => edge.from === node.id || edge.to === node.id).map(edge => {
      const before = edge.to === node.id, other = this.ordered.find(n => n.id === (before ? edge.from : edge.to));
      if (!other) return "";
      return `<button type="button" data-related="${escapeHtml(other.id)}" title="${escapeHtml(edge.label ?? (before ? "前序节点" : "后续节点"))}"><span>${before ? "↖" : "↗"}</span>${escapeHtml(other.title)}<small>${escapeHtml(edge.label ?? (before ? "承接" : "继续"))}</small></button>`;
    }).join("");
    const refs = (sources: ArchiveSource[], type: string) => sources.map((source, i) => `<button type="button" class="research-source-ref" data-source-ref="${type}${String(i + 1).padStart(2, "0")}" aria-label="核对${type}${String(i + 1).padStart(2, "0")}：${escapeHtml(source.label)}">${type}${String(i + 1).padStart(2, "0")}</button>`).join("");
    const evidence = (sources: ArchiveSource[], type: string) => sources.length ? sources.map((source, i) => `<div class="research-evidence-item" data-source-id="${type}${String(i + 1).padStart(2, "0")}" data-layer="${type === "R" ? "record" : "retrospective"}"><small>${type}${String(i + 1).padStart(2, "0")}</small>${sourceMarkup([source])}</div>`).join("") : '<p class="research-source-empty">未单独收录来源</p>';
    this.body.dataset.hindsight = node.retrospective.length ? "present" : "empty";
    this.inspector.innerHTML = `<nav class="research-layer-nav" aria-label="记录的三个层次"><button type="button" data-layer-jump="record">当时记录</button><button type="button" data-layer-jump="retrospective">事后复盘</button><button type="button" data-layer-jump="evidence">依据</button></nav>
      <h2 class="research-focus-name">${escapeHtml(node.title)}</h2>
      <div class="research-focus-identity"><span class="research-focus-index">${escapeHtml(node.id)} <i></i> ${escapeHtml(node.thread ?? "研究节点")}</span><div class="research-focus-meta"><time>${escapeHtml(node.date)}</time><span>${escapeHtml(node.statusLabel ?? researchStatus[node.status])}</span></div></div>
      <section class="research-reading-plane research-contemporary" data-layer="record" aria-labelledby="contemporary-title"><header><span class="research-layer-number">01</span><div><small>RECORD</small><h2 id="contemporary-title">当时记录</h2></div></header><div class="research-plane-scroll" tabindex="0" aria-label="当时记录正文"><div class="research-question">${p(node.question)}</div>${node.record?.length ? `<div class="research-authored-record">${node.record.map(text => p(text)).join("")}</div><section class="research-record-consequence"><h3>此后改变</h3>${p(node.interpretation)}</section>` : [["尝试", node.attempt], ["观察", node.result], ["当时判断", node.interpretation]].filter(([, value]) => value).map(([label, value]) => `<section class="research-record-section"><h3>${label}</h3>${p(value)}</section>`).join("")}${node.dateNote ? `<p class="research-date-note">${escapeHtml(node.dateNote)}</p>` : ""}</div><footer><div class="research-reference-row">${refs(node.sources, "R")}</div><a href="#research-evidence" data-evidence-link="record">核对依据 ↘</a></footer></section>
      <section class="research-reading-plane research-hindsight" data-layer="retrospective" aria-labelledby="hindsight-title"><header><span class="research-layer-number">02</span><div><small>RETROSPECTIVE</small><h2 id="hindsight-title">事后复盘</h2></div></header><div class="research-plane-scroll" tabindex="0" aria-label="事后复盘正文">${node.retrospective.length ? `<div class="research-retrospective-date">${escapeHtml(node.retrospectiveDate ?? this.data.retrospectiveDate ?? "复盘日期未记录")}</div>` + node.retrospective.map(text => `<p>${escapeHtml(text)}</p>`).join("") : '<p class="research-source-empty">未收录独立复盘。</p>'}${relations ? `<nav class="research-branch-context" aria-label="当前节点的研究关联"><h3>由此关联</h3>${relations}</nav>` : ""}</div>${node.retrospective.length ? `<footer><div class="research-reference-row">${refs(node.retrospectiveSources ?? [], "H")}</div><a href="#research-evidence" data-evidence-link="retrospective">核对依据 ↙</a></footer>` : ""}</section>
      <section id="research-evidence" class="research-reading-plane research-evidence" data-layer="evidence" aria-labelledby="evidence-title"><header><span class="research-layer-number">03</span><h2 id="evidence-title">依据</h2></header><div class="research-evidence-scroll" tabindex="0" aria-label="记录与复盘的资料来源"><div class="research-source-columns"><div>${evidence(node.sources, "R")}</div><div>${evidence(node.retrospectiveSources ?? [], "H")}</div></div></div></section>`;
    this.inspector.dataset.nodeId = node.id;
    this.inspector.insertAdjacentHTML("afterbegin", '<svg class="research-relationship-wires" aria-hidden="true"></svg>');
    this.inspector.querySelectorAll<HTMLElement>(".research-source-columns > div").forEach((column, i) => {
      column.dataset.sourceGroup = i === 0 ? "R" : "H";
      column.insertAdjacentHTML("afterbegin", `<div class="research-source-port"><i></i><span>${i === 0 ? "R / 当时材料" : "H / 事后材料"}</span></div>`);
    });
    this.inspector.querySelectorAll<HTMLAnchorElement>("[data-evidence-link]").forEach(link => link.addEventListener("click", event => {
      event.preventDefault(); this.highlightLayer("evidence");
      this.inspector.querySelector<HTMLElement>(".research-evidence-scroll")?.focus({ preventScroll: true });
      if (this.stage.clientWidth < 760) this.inspector.querySelector(".research-evidence")?.scrollIntoView({ block: "nearest", behavior: this.reduced ? "instant" : "smooth" });
    }));
  }
  private paintAssociations() {
    const svg = this.inspector.querySelector<SVGSVGElement>(".research-relationship-wires");
    if (!svg || !this.focused || this.stage.clientWidth < 760) return;
    // Connector coordinates belong to the local reading plane. An entering
    // projection has a perspective transform above it; viewport rectangles
    // would bake that temporary camera pose into permanent SVG coordinates.
    const bounds = { width: this.inspector.clientWidth, height: this.inspector.clientHeight };
    const box = (selector: string) => {
      const element = this.inspector.querySelector<HTMLElement>(selector)!;
      let x = 0, y = 0, current: HTMLElement | null = element;
      while (current && current !== this.inspector) {
        x += current.offsetLeft; y += current.offsetTop;
        current = current.offsetParent as HTMLElement | null;
      }
      return { x, y, width: element.offsetWidth, height: element.offsetHeight };
    };
    const record = box(".research-contemporary"), hindsight = box(".research-hindsight");
    const r = box('[data-source-group="R"] .research-source-port'), h = box('[data-source-group="H"] .research-source-port');
    const recordPort = { x: record.x + record.width, y: record.y + 23 };
    const hindsightPort = { x: hindsight.x, y: hindsight.y + 23 };
    const middle = (recordPort.x + hindsightPort.x) / 2;
    const connection = (plane: typeof record, target: typeof r, name: string) => {
      const x = plane.x + 17, y = plane.y + plane.height, endX = target.x - 9, endY = target.y + target.height / 2;
      const midY = y + Math.max(12, (endY - y) * .35);
      return `<g class="connection-${name}"><path d="M${x},${y} V${midY} H${endX} V${endY} H${target.x + 3}"/><rect x="${x - 2}" y="${y - 2}" width="4" height="4"/></g>`;
    };
    svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    svg.innerHTML = `<g class="connection-review"><path d="M${hindsightPort.x},${hindsightPort.y} H${middle} V${recordPort.y} H${recordPort.x}"/><rect x="${recordPort.x - 2}" y="${recordPort.y - 2}" width="4" height="4"/><rect x="${hindsightPort.x - 2}" y="${hindsightPort.y - 2}" width="4" height="4"/><text x="${middle + 5}" y="${recordPort.y + 12}">回看</text></g>${connection(record, r, "record")}${connection(hindsight, h, "hindsight")}`;
  }
  private play() {
    if (this.route.length < 2) return;
    const next = this.route.findIndex(index => index >= this.selected);
    this.playPosition = next < 0 || next === this.route.length - 1 ? 0 : next;
    this.selectNode(this.route[this.playPosition], true);
    this.playing = true; this.elapsed = 0; this.playLast = 0;
    this.playButton.textContent = "暂停回放"; this.playButton.setAttribute("aria-pressed", "true"); this.host.dataset.replaying = "true";
    const tick = (ms: number) => {
      if (!this.playing || this.presentationSuspended) return;
      if (this.playLast && !document.hidden) this.elapsed += Math.min(.1, (ms - this.playLast) / 1000);
      this.playLast = ms;
      const position = Math.min(this.route.length - 1, this.playPosition + this.elapsed / 9), step = Math.floor(position);
      const index = this.route[step], after = this.route[Math.min(step + 1, this.route.length - 1)];
      if (index !== this.selected) this.selectNode(index, true);
      this.timeline.value = String(position);
      this.nodes.forEach((node, i) => node.classList.toggle("is-future", i > after));
      this.map.querySelectorAll<SVGPathElement>("path[data-from]").forEach(path => {
        const destination = this.ordered.findIndex(node => node.id === path.dataset.to);
        path.classList.toggle("is-future", destination > after);
        if (!this.reduced && path.dataset.from === this.ordered[index].id && destination === after) {
          const length = path.getTotalLength(); path.style.strokeDasharray = String(length); path.style.strokeDashoffset = String(length * (1 - (position - step)));
        } else { path.style.strokeDasharray = ""; path.style.strokeDashoffset = ""; }
      });
      if (position >= this.route.length - 1) this.pause();
      else this.playFrame = requestAnimationFrame(tick);
    };
    this.playTick = tick;
    this.playFrame = requestAnimationFrame(tick);
  }
  private pause() {
    this.suspendedReplay = false;
    this.playing = false; cancelAnimationFrame(this.playFrame); this.playButton.textContent = this.data.narrativePath ? "主线回放" : "历程回放"; this.playButton.setAttribute("aria-pressed", "false"); delete this.host.dataset.replaying;
    this.nodes.forEach(node => node.classList.remove("is-future"));
    this.map.querySelectorAll<SVGPathElement>("path[data-from]").forEach(path => { path.classList.remove("is-future"); path.style.strokeDasharray = ""; path.style.strokeDashoffset = ""; });
  }
  /** Freeze the inner narrative at the frame the outer return starts from.
   * Reopening can resume it without advancing a hidden node or reading pane. */
  suspendPresentation() {
    if (this.presentationSuspended) return;
    this.captureReadingPosition();
    this.presentationSuspended = true;
    this.suspendedReplay = this.playing;
    cancelAnimationFrame(this.playFrame);
    if (this.flightFrame) {
      this.suspendedTarget = { ...this.target };
      this.stopFlight();
    }
  }
  resumePresentation() {
    if (!this.presentationSuspended) return;
    this.presentationSuspended = false;
    if (this.suspendedTarget) {
      const { x, y, scale } = this.suspendedTarget;
      this.suspendedTarget = undefined;
      this.flyTo(x, y, Math.exp(scale));
    }
    if (this.suspendedReplay && this.playing && this.playTick) {
      this.playLast = 0;
      this.playFrame = requestAnimationFrame(this.playTick);
    }
    this.suspendedReplay = false;
  }
  private snapshotState(): ResearchViewState { return { selected: this.ordered[this.selected]?.id ?? "", x: this.x, y: this.y, scale: this.scale, focused: this.focused, reading: Object.fromEntries(this.reading) }; }
  getState(): ResearchViewState { this.captureReadingPosition(); return this.snapshotState(); }
  getStats() {
    const node = this.positions.get(this.ordered[this.selected]?.id);
    return { ...this.snapshotState(), playing: this.playing, nodeCount: this.ordered.length, narrativeSteps: this.route.length, layout: this.data.layout ?? "catalogue", edgeCount: this.data.edges.length, formation: this.formation, readingProgress: this.readingProgress, presentationSuspended: this.presentationSuspended, presentationScale: this.presentationScale, presentationDetail: this.presentationDetail, presentationNames: this.presentationNames, formedEdges: this.formationEdges.filter(edge => this.formation >= edge.end).length, retrospectiveNode: this.inspector.dataset.nodeId, activeSource: this.body.dataset.source, reducedMotion: this.reduced, settled: this.settled, anchor: node ? { x: this.x + node.x * this.scale, y: this.y + node.y * this.scale } : null, viewport: { width: this.stage.clientWidth, height: this.stage.clientHeight } };
  }
  setReducedMotion(value: boolean) { this.reduced = value; this.host.dataset.reduced = String(value); if (value && this.flightFrame) this.flyTo(this.target.x, this.target.y, Math.exp(this.target.scale), false); if (value && this.formation < 1) this.setFormation(1); if (value && this.presentationScale < 1) this.setPresentationScale(1); if (value && this.readingProgress < 1) this.setReadingProgress(1); }
  dispose() { this.pause(); this.stopFlight(); this.abort.abort(); this.observer.disconnect(); cancelAnimationFrame(this.resizeFrame); this.host.replaceChildren(); }
}
