import { escapeHtml } from "./html";
import { researchStatus, safeSourceUrl, type ArchiveSource, type ResearchProjectionData } from "./projection-types";
import "./research-optics.css";

export function sourceMarkup(sources: ArchiveSource[]) {
  return sources.map(source => {
    const href = safeSourceUrl(source.url);
    const label = escapeHtml(source.label);
    return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true">↗</span></a>`
      : `<span title="${escapeHtml(source.path ?? source.label)}">${label}</span>`;
  }).join("");
}

export interface ResearchViewState { selected: string; x: number; y: number; scale: number; focused?: boolean }
type Point = { x: number; y: number };
type Node = ResearchProjectionData["nodes"][number];

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
  private phasePositions: { id: number; x: number; title: string; date: string }[] = [];
  private lanePositions: { lane: number; y: number; title: string }[] = [];
  private selected = 0;
  private x = 0;
  private y = 0;
  private scale = 1;
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
  private playFrame = 0;
  private playLast = 0;
  private elapsed = 0;
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  private dragged = false;
  private pinchDistance = 0;
  private abort = new AbortController();
  private observer: ResizeObserver;

  constructor(private host: HTMLElement, private data: ResearchProjectionData, options: { reducedMotion?: boolean; state?: ResearchViewState } = {}) {
    this.reduced = options.reducedMotion ?? false;
    this.ordered = [...data.nodes].sort((a, b) => a.stage - b.stage || a.lane - b.lane);
    this.layout();
    const edges = data.edges.map(edge => {
      const a = this.positions.get(edge.from), b = this.positions.get(edge.to);
      if (!a || !b) return "";
      const bend = Math.max(36, Math.abs(b.x - a.x) * .48);
      const result = this.ordered.find(node => node.id === edge.to)?.status;
      return `<path data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" data-kind="${edge.kind ?? "continuation"}" data-result="${result ?? "tested"}" d="M${a.x},${a.y} C${a.x + bend},${a.y} ${b.x - bend},${b.y} ${b.x},${b.y}"/>`;
    }).join("");
    const particles = Array.from({ length: 24 }, (_, i) => `<i style="--px:${7 + (i * 37 % 88)}%;--py:${12 + (i * 19 % 76)}%;--delay:${-(i * 1.7)}s;--travel:${18 + i % 5 * 7}px"></i>`).join("");
    host.innerHTML = `<div class="projection-body research-body" data-view="overview" data-settled="true">
      <div class="research-optical-volume" aria-hidden="true"><div class="research-optical-floor"></div><div class="research-optical-plane"></div><div class="research-optical-lamina rear"></div><div class="research-optical-lamina front"></div><div class="research-particles">${particles}</div></div>
      <div class="research-stage" tabindex="0" aria-label="完整研究进化树。拖动浏览，滚轮缩放，选择节点展开记录。方向键切换，Home 返回全图。">
        <div class="research-stage-label"><span>EVOLUTION FIELD <b>${String(this.ordered.length).padStart(2, "0")}</b></span><span>研究历程 <i></i> 选择节点展开记录</span></div>
        <div class="research-status-key" aria-label="节点状态图例"><span><i class="question"></i>问题</span><span><i class="tested"></i>已检验</span><span><i class="negative"></i>负结果</span><span><i class="paused"></i>暂缓</span></div>
        <div class="research-map" style="width:${this.mapWidth}px;height:${this.mapHeight}px">
          <svg class="research-links" width="${this.mapWidth}" height="${this.mapHeight}" aria-hidden="true">${edges}</svg>
          ${this.phasePositions.map(p => `<div class="research-phase" style="left:${p.x}px;top:8px"><small>${escapeHtml(p.date)}</small><span>${escapeHtml(p.title)}</span></div>`).join("")}
          ${this.lanePositions.map(p => `<div class="research-thread" style="left:0;top:${p.y}px">${escapeHtml(p.title)}</div>`).join("")}
          ${this.ordered.map(node => { const p = this.positions.get(node.id)!; return `<button type="button" class="research-node" data-node="${escapeHtml(node.id)}" data-status="${node.status}" style="left:${p.x}px;top:${p.y}px" aria-label="${escapeHtml(node.title)}，${escapeHtml(node.date)}，${escapeHtml(node.statusLabel ?? researchStatus[node.status])}" aria-pressed="false"><span class="research-node-core" aria-hidden="true"><i></i></span><strong class="research-node-title">${escapeHtml(node.title)}</strong></button>`; }).join("")}
        </div>
      </div>
      <svg class="research-focus-light" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="focus-beam" x1="0" y1="1" x2=".45" y2="0"><stop stop-color="var(--optical-accent)" stop-opacity=".20"/><stop offset=".28" stop-color="var(--optical-accent)" stop-opacity=".055"/><stop offset="1" stop-color="var(--optical-accent)" stop-opacity="0"/></linearGradient><linearGradient id="focus-white" x1="0" y1="1" x2="0" y2="0"><stop stop-color="white" stop-opacity=".36"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs><path class="focus-cone-fill" d="M170 452 L290 55 Q530 5 765 130 Z" fill="url(#focus-beam)"/><path d="M170 452 L290 55 Q440 35 555 75 Z" fill="url(#focus-white)"/><path class="focus-cone-edge" d="M170 452 L290 55 M170 452 L765 130"/><path class="focus-section-rim" d="M290 55 Q530 5 765 130 Q520 84 290 55 Z"/><ellipse class="focus-aperture" cx="170" cy="458" rx="58" ry="12"/><ellipse class="focus-aperture inner" cx="170" cy="458" rx="37" ry="7"/><path class="focus-guide record-guide" d="M170 452 L280 247 L321 247"/><path class="focus-guide retrospective-guide" d="M170 452 L635 318 L692 318"/><path class="focus-guide evidence-guide" d="M170 452 L335 508 L408 508"/></svg>
      <aside class="projection-inspector" aria-label="节点的当时记录、事后复盘与依据" aria-hidden="true" inert></aside>
      <button type="button" class="research-navigator" data-map="navigate" aria-label="完整研究进化树定位图，点击区域移动主视图"><span>全树定位</span><svg viewBox="0 0 ${this.mapWidth} ${this.mapHeight}" preserveAspectRatio="none" aria-hidden="true">${edges}${this.ordered.map(node => { const p = this.positions.get(node.id)!; return `<circle cx="${p.x}" cy="${p.y}" r="10"/>`; }).join("")}<rect class="research-navigator-window" x="0" y="0" width="1" height="1"/></svg></button>
      <div class="research-map-tools"><button type="button" data-map="fit" class="research-overview-action">↖ 完整进化树</button><span class="research-map-hint">拖动浏览 · 滚轮缩放</span><button type="button" data-map="out" aria-label="缩小研究图">−</button><output class="research-zoom">100%</output><button type="button" data-map="in" aria-label="放大研究图">＋</button></div>
    </div>
    <footer class="projection-timeline"><div class="projection-play-controls"><button type="button" data-research="prev" aria-label="上一个研究节点">←</button><button type="button" data-research="play" aria-pressed="false">回放历程</button><button type="button" data-research="next" aria-label="下一个研究节点">→</button></div><label class="projection-scrubber"><span>时间</span><input type="range" min="0" max="${Math.max(0, this.ordered.length - 1)}" step="0.01" value="0" aria-label="研究历程进度"/></label><output class="projection-step"></output></footer>`;
    this.body = host.querySelector(".research-body")!;
    this.stage = host.querySelector(".research-stage")!;
    this.map = host.querySelector(".research-map")!;
    this.inspector = host.querySelector(".projection-inspector")!;
    this.timeline = host.querySelector(".projection-scrubber input")!;
    this.playButton = host.querySelector('[data-research="play"]')!;
    this.nodes = [...host.querySelectorAll<HTMLButtonElement>("[data-node]")];
    this.host.dataset.reduced = String(this.reduced);
    this.bind();
    let previous = { width: 0, height: 0 };
    this.observer = new ResizeObserver(() => {
      const width = this.stage.clientWidth, height = this.stage.clientHeight;
      if (previous.width && !this.pointers.size) {
        if (this.focused) this.focusCamera(false);
        else this.fit(false);
      }
      previous = { width, height };
    });
    this.observer.observe(this.stage);
    this.selectNode(0, false);
    requestAnimationFrame(() => {
      if (this.abort.signal.aborted) return;
      if (options.state && this.positions.has(options.state.selected)) {
        this.selected = this.ordered.findIndex(n => n.id === options.state!.selected);
        this.x = options.state.x; this.y = options.state.y; this.scale = Math.max(.06, Math.min(2.2, options.state.scale));
        this.selectNode(this.selected, false); this.paintMap();
        if (options.state.focused) this.enterFocus(false);
      } else this.fit(false);
    });
  }

  private layout() {
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
      if (["prev", "next"].includes(button.dataset.research ?? "")) {
        this.pause(); this.selectNode(this.selected + (button.dataset.research === "next" ? 1 : -1), true);
      }
      if (button.dataset.map === "fit") { this.pause(); this.fit(); }
      if (button.dataset.map === "navigate") {
        const rect = button.querySelector("svg")!.getBoundingClientRect();
        const worldX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * this.mapWidth;
        const worldY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * this.mapHeight;
        this.flyTo(this.stage.clientWidth / 2 - worldX * this.scale, (this.stage.clientHeight - 110) / 2 - worldY * this.scale, this.scale);
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
    this.timeline.addEventListener("input", () => { this.pause(); this.selectNode(Math.round(Number(this.timeline.value)), true); }, { signal });
    this.host.addEventListener("keydown", event => {
      if (event.key === "Escape" && this.focused) { event.preventDefault(); event.stopPropagation(); this.pause(); this.fit(); return; }
      if ((event.target as Element).closest("input, select, a, .projection-inspector")) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "+", "=", "-"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Home") { this.pause(); this.fit(); }
      else if (["+", "=", "-"].includes(event.key)) this.zoom(event.key === "-" ? .8 : 1.25);
      else { this.pause(); this.selectNode(this.selected + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1), true); }
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
  private paintMap() {
    this.map.style.transform = `translate3d(${this.x}px,${this.y}px,0) scale(${this.scale})`;
    this.map.style.setProperty("--label-scale", String(Math.max(1, .92 / this.scale)));
    this.map.style.setProperty("--focus-label-scale", String(1 / this.scale));
    this.host.querySelector(".research-zoom")!.textContent = `${Math.round(this.scale * 100)}%`;
    this.body.dataset.density = this.scale < .3 ? "compact" : "readable";
    const viewport = this.host.querySelector<SVGRectElement>(".research-navigator-window")!;
    const left = Math.max(0, -this.x / this.scale), top = Math.max(0, (55 - this.y) / this.scale);
    viewport.setAttribute("x", String(left)); viewport.setAttribute("y", String(top));
    viewport.setAttribute("width", String(Math.max(0, Math.min(this.mapWidth - left, this.stage.clientWidth / this.scale))));
    viewport.setAttribute("height", String(Math.max(0, Math.min(this.mapHeight - top, (this.stage.clientHeight - 165) / this.scale))));
  }
  private stopFlight() { cancelAnimationFrame(this.flightFrame); this.flightFrame = 0; this.flightLast = 0; this.velocity = { x: 0, y: 0, scale: 0 }; }
  private flyTo(x: number, y: number, scale: number, animate = true) {
    this.target = { x, y, scale: Math.log(scale) };
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
    requestAnimationFrame(() => { if (!this.abort.signal.aborted) this.paintAssociations(); });
  }
  private fit(animate = true) {
    const restoreFocus = this.inspector.contains(document.activeElement);
    this.focused = false; this.body.dataset.view = "overview"; this.inspector.inert = true; this.inspector.setAttribute("aria-hidden", "true");
    if (restoreFocus) this.stage.focus({ preventScroll: true });
    this.body.scrollTop = 0;
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    const mobile = w < 760;
    const scale = mobile ? .43 : Math.max(.06, Math.min(1, (w - 80) / this.mapWidth, (h - 140) / this.mapHeight));
    const selected = this.positions.get(this.ordered[this.selected].id)!;
    const x = mobile ? Math.min(24, Math.max(w - this.mapWidth * scale - 24, w / 2 - selected.x * scale)) : (w - this.mapWidth * scale) / 2;
    const y = mobile ? 92 : 80 + (h - 150 - this.mapHeight * scale) / 2;
    this.flyTo(x, y, scale, animate);
    this.host.querySelector(".research-map-hint")!.textContent = mobile ? "拖动浏览 · 双指缩放" : "拖动浏览 · 滚轮缩放";
  }
  private zoom(factor: number, cx = this.stage.clientWidth / 2, cy = this.stage.clientHeight / 2) {
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
    this.selected = Math.max(0, Math.min(this.ordered.length - 1, index)); this.dragged = false;
    const node = this.ordered[this.selected];
    this.nodes.forEach((button, i) => { button.classList.toggle("is-selected", i === this.selected); button.setAttribute("aria-pressed", String(i === this.selected)); button.tabIndex = i === this.selected ? 0 : -1; });
    this.map.querySelectorAll<SVGPathElement>("path").forEach(path => path.classList.toggle("is-active", path.dataset.from === node.id || path.dataset.to === node.id));
    this.paintInspector(node);
    this.timeline.value = String(this.selected); this.timeline.setAttribute("aria-valuetext", `${this.selected + 1}，${node.title}`);
    this.host.querySelector(".projection-step")!.textContent = `${String(this.selected + 1).padStart(2, "0")} / ${String(this.ordered.length).padStart(2, "0")} · ${node.date}`;
    this.host.querySelector<HTMLButtonElement>('[data-research="prev"]')!.disabled = this.selected === 0;
    this.host.querySelector<HTMLButtonElement>('[data-research="next"]')!.disabled = this.selected === this.ordered.length - 1;
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
    this.inspector.innerHTML = `<nav class="research-layer-nav" aria-label="投影的三个关联层次"><button type="button" data-layer-jump="record"><small>01</small>当时记录<span>↗</span></button><button type="button" data-layer-jump="retrospective"><small>02</small>事后复盘<span>↗</span></button><button type="button" data-layer-jump="evidence"><small>03</small>依据<span>↗</span></button></nav><h2 class="research-focus-name">${escapeHtml(node.title)}</h2><div class="research-focus-identity"><span class="research-focus-index">${escapeHtml(node.id)} <i></i> ${escapeHtml(node.thread ?? "研究节点")}</span><div class="research-focus-meta"><time>${escapeHtml(node.date)}</time><span>${escapeHtml(node.statusLabel ?? researchStatus[node.status])}</span></div><p>${escapeHtml(node.evidence)}</p></div>
      <section class="research-reading-plane research-contemporary" data-layer="record" aria-labelledby="contemporary-title"><header><span class="research-layer-number">01</span><div><small>CONTEMPORARY RECORD</small><h2 id="contemporary-title">当时记录</h2></div><span class="research-layer-datum">${escapeHtml(node.date)}</span></header><div class="research-plane-scroll" tabindex="0"><div class="research-question">${p(node.question)}<div class="research-reference-row"><span>对应记录</span>${refs(node.sources, "R")}</div></div>${[["尝试", node.attempt], ["观察", node.result], ["当时判断", node.interpretation]].filter(([, value]) => value).map(([label, value]) => `<section class="research-record-section"><h3>${label}</h3>${p(value)}</section>`).join("")}${node.dateNote ? `<p class="research-date-note">${escapeHtml(node.dateNote)}</p>` : ""}</div><footer><span>记录依据</span><a href="#research-evidence" data-evidence-link="record">R01—${String(node.sources.length).padStart(2, "0")} ↘</a></footer></section>
      <section class="research-reading-plane research-hindsight" data-layer="retrospective" aria-labelledby="hindsight-title"><header><span class="research-layer-number">02</span><div><small>RETROSPECTIVE</small><h2 id="hindsight-title">事后复盘</h2></div></header><div class="research-plane-scroll" tabindex="0"><div class="research-retrospective-date">${escapeHtml(node.retrospective.length ? (node.retrospectiveDate ?? this.data.retrospectiveDate ?? "未记录复盘日期") : "未留独立复盘")}</div>${node.retrospective.length ? node.retrospective.map(text => `<p>${escapeHtml(text)}</p>`).join("") + `<div class="research-reference-row"><span>复盘来源</span>${refs(node.retrospectiveSources ?? [], "H")}</div>` : '<p class="research-source-empty">此节点尚未收录事后复盘。保留当时记录，等待后续材料。</p>'}${relations ? `<nav class="research-branch-context" aria-label="当前节点的研究关联"><h3>研究关联</h3>${relations}</nav>` : ""}</div><footer><span>回看当时判断</span><a href="#research-evidence" data-evidence-link="retrospective">复盘依据 ↙</a></footer></section>
      <section id="research-evidence" class="research-reading-plane research-evidence" data-layer="evidence" aria-labelledby="evidence-title"><header><span class="research-layer-number">03</span><div><small>EVIDENCE & CONNECTIONS</small><h2 id="evidence-title">依据与关联</h2></div><span class="research-evidence-key">R 记录 <i></i> H 复盘</span></header><div class="research-evidence-scroll" tabindex="0"><div class="research-source-columns"><div>${evidence(node.sources, "R")}</div><div>${evidence(node.retrospectiveSources ?? [], "H")}</div></div></div></section>
      <div class="research-layer-connection contemporary-connection" aria-hidden="true"><span>回看当时</span></div><div class="research-layer-connection evidence-connection" aria-hidden="true"><span>核对依据</span></div>`;
    this.inspector.dataset.nodeId = node.id;
    this.inspector.insertAdjacentHTML("afterbegin", '<svg class="research-relationship-wires" aria-hidden="true"></svg>');
    this.inspector.querySelectorAll<HTMLElement>(".research-source-columns > div").forEach((column, i) => {
      column.dataset.sourceGroup = i === 0 ? "R" : "H";
      column.insertAdjacentHTML("afterbegin", `<div class="research-source-port"><i></i><span>${i === 0 ? "R / 支持当时记录" : "H / 支撑事后复盘"}</span></div>`);
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
    const bounds = this.inspector.getBoundingClientRect();
    const box = (selector: string) => {
      const rect = this.inspector.querySelector(selector)!.getBoundingClientRect();
      return { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height };
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
    if (this.ordered.length < 2) return;
    if (this.selected === this.ordered.length - 1) this.selectNode(0, this.focused);
    this.playing = true; this.playPosition = this.selected; this.elapsed = 0; this.playLast = 0;
    this.playButton.textContent = "暂停回放"; this.playButton.setAttribute("aria-pressed", "true"); this.host.dataset.replaying = "true";
    const tick = (ms: number) => {
      if (!this.playing) return;
      if (this.playLast && !document.hidden) this.elapsed += Math.min(.1, (ms - this.playLast) / 1000);
      this.playLast = ms;
      const position = Math.min(this.ordered.length - 1, this.playPosition + this.elapsed / 8), index = Math.floor(position);
      if (index !== this.selected) this.selectNode(index, this.focused);
      this.timeline.value = String(position);
      this.nodes.forEach((node, i) => node.classList.toggle("is-future", i > index));
      this.map.querySelectorAll<SVGPathElement>("path").forEach(path => {
        const destination = this.ordered.findIndex(node => node.id === path.dataset.to);
        path.classList.toggle("is-future", destination > index + 1);
        if (!this.reduced && destination === index + 1) {
          const length = path.getTotalLength(); path.style.strokeDasharray = String(length); path.style.strokeDashoffset = String(length * (1 - (position - index)));
        } else { path.style.strokeDasharray = ""; path.style.strokeDashoffset = ""; }
      });
      if (position >= this.ordered.length - 1) this.pause();
      else this.playFrame = requestAnimationFrame(tick);
    };
    this.playFrame = requestAnimationFrame(tick);
  }
  private pause() {
    this.playing = false; cancelAnimationFrame(this.playFrame); this.playButton.textContent = "回放历程"; this.playButton.setAttribute("aria-pressed", "false"); delete this.host.dataset.replaying;
    this.nodes.forEach(node => node.classList.remove("is-future"));
    this.map.querySelectorAll<SVGPathElement>("path").forEach(path => { path.classList.remove("is-future"); path.style.strokeDasharray = ""; path.style.strokeDashoffset = ""; });
  }
  getState(): ResearchViewState { return { selected: this.ordered[this.selected]?.id ?? "", x: this.x, y: this.y, scale: this.scale, focused: this.focused }; }
  getStats() {
    const node = this.positions.get(this.ordered[this.selected]?.id);
    return { ...this.getState(), playing: this.playing, nodeCount: this.ordered.length, edgeCount: this.data.edges.length, retrospectiveNode: this.inspector.dataset.nodeId, activeSource: this.body.dataset.source, reducedMotion: this.reduced, settled: this.settled, anchor: node ? { x: this.x + node.x * this.scale, y: this.y + node.y * this.scale } : null, viewport: { width: this.stage.clientWidth, height: this.stage.clientHeight } };
  }
  setReducedMotion(value: boolean) { this.reduced = value; this.host.dataset.reduced = String(value); if (value && this.flightFrame) this.flyTo(this.target.x, this.target.y, Math.exp(this.target.scale), false); }
  dispose() { this.pause(); this.stopFlight(); this.abort.abort(); this.observer.disconnect(); this.host.replaceChildren(); }
}
