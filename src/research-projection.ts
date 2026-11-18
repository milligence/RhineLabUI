import { escapeHtml } from "./html";
import { researchStatus, safeSourceUrl, type ArchiveSource, type ResearchProjectionData } from "./projection-types";

export function sourceMarkup(sources: ArchiveSource[]) {
  return sources.map(source => {
    const href = safeSourceUrl(source.url);
    const label = escapeHtml(source.label);
    return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true">↗</span></a>`
      : `<span title="${escapeHtml(source.path ?? source.label)}">${label}</span>`;
  }).join("");
}

export interface ResearchViewState { selected: string; x: number; y: number; scale: number }

/** One selected node drives the map, chronology and retrospective together. */
export class ResearchProjection {
  private stage: HTMLElement;
  private map: HTMLElement;
  private inspector: HTMLElement;
  private timeline: HTMLInputElement;
  private playButton: HTMLButtonElement;
  private nodes: HTMLButtonElement[];
  private ordered: ResearchProjectionData["nodes"];
  private positions = new Map<string, { x: number; y: number }>();
  private selected = 0;
  private x = 0;
  private y = 0;
  private scale = 1;
  private mapWidth = 1;
  private mapHeight = 1;
  private reduced: boolean;
  private playing = false;
  private playPosition = 0;
  private frame = 0;
  private last = 0;
  private elapsed = 0;
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  private dragged = false;
  private pinchDistance = 0;
  private abort = new AbortController();
  private observer: ResizeObserver;

  constructor(private host: HTMLElement, private data: ResearchProjectionData, options: { reducedMotion?: boolean; state?: ResearchViewState } = {}) {
    this.reduced = options.reducedMotion ?? false;
    this.ordered = [...data.nodes].sort((a, b) => a.stage - b.stage || a.lane - b.lane);
    const stages = [...new Set(this.ordered.map(n => n.stage))].sort((a, b) => a - b);
    const lanes = this.ordered.map(n => n.lane);
    const low = Math.min(...lanes, 0);
    for (const node of this.ordered) this.positions.set(node.id, { x: 60 + stages.indexOf(node.stage) * 300, y: 60 + (node.lane - low) * 155 });
    this.mapWidth = Math.max(420, ...[...this.positions.values()].map(p => p.x + 280));
    this.mapHeight = Math.max(310, ...[...this.positions.values()].map(p => p.y + 170));
    const edges = data.edges.map(edge => {
      const a = this.positions.get(edge.from), b = this.positions.get(edge.to);
      if (!a || !b) return "";
      const x = a.x + 220, y = a.y + 55, tx = b.x, ty = b.y + 55;
      return `<path data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" d="M ${x} ${y} C ${x + 42} ${y}, ${tx - 42} ${ty}, ${tx} ${ty}"/>`;
    }).join("");
    host.innerHTML = `<div class="projection-body research-body">
      <div class="research-stage" tabindex="0" aria-label="研究图。拖动平移，滚轮缩放，方向键切换节点，Home 查看全图。">
        <div class="research-grid" aria-hidden="true"></div>
        <div class="research-stage-label"><span>RESEARCH TRAJECTORY</span><span>${escapeHtml(data.description)}</span></div>
        <div class="research-map" style="width:${this.mapWidth}px;height:${this.mapHeight}px">
          <svg class="research-links" width="${this.mapWidth}" height="${this.mapHeight}" aria-hidden="true">${edges}</svg>
          ${this.ordered.map((node, i) => { const p = this.positions.get(node.id)!; return `<button type="button" class="research-node" data-node="${escapeHtml(node.id)}" data-status="${node.status}" style="left:${p.x}px;top:${p.y}px;--node-depth:${Math.abs(node.lane % 3) * 3}px" aria-pressed="false"><span class="research-node-order">${String(i + 1).padStart(2, "0")}<span class="research-node-status">${researchStatus[node.status]}</span></span><strong class="research-node-title">${escapeHtml(node.title)}</strong><span class="research-node-date">${escapeHtml(node.date)}</span></button>`; }).join("")}
        </div>
        <div class="research-map-tools"><span>拖动浏览 · 滚轮缩放</span><button type="button" data-map="out" aria-label="缩小研究图">−</button><output class="research-zoom">100%</output><button type="button" data-map="in" aria-label="放大研究图">＋</button><button type="button" data-map="fit">全图</button></div>
      </div>
      <aside class="projection-inspector" aria-label="节点记录与复盘"></aside>
    </div>
    <footer class="projection-timeline"><div class="projection-play-controls"><button type="button" data-research="prev" aria-label="上一个研究节点">←</button><button type="button" data-research="play" aria-pressed="false">回放历程</button><button type="button" data-research="next" aria-label="下一个研究节点">→</button></div><label class="projection-scrubber"><span>研究进程</span><input type="range" min="0" max="${Math.max(0, this.ordered.length - 1)}" step="0.01" value="0" aria-label="研究历程进度"/></label><output class="projection-step"></output></footer>`;
    this.stage = host.querySelector(".research-stage")!;
    this.map = host.querySelector(".research-map")!;
    this.inspector = host.querySelector(".projection-inspector")!;
    this.timeline = host.querySelector(".projection-scrubber input")!;
    this.playButton = host.querySelector('[data-research="play"]')!;
    this.nodes = [...host.querySelectorAll<HTMLButtonElement>("[data-node]")];
    const signal = this.abort.signal;
    host.addEventListener("click", event => {
      const target = (event.target as Element).closest<HTMLButtonElement>("button");
      if (!target) return;
      if (target.dataset.node) {
        if (this.dragged) { this.dragged = false; event.preventDefault(); return; }
        this.pause(); this.selectNode(this.ordered.findIndex(n => n.id === target.dataset.node));
      }
      if (target.dataset.research === "play") this.playing ? this.pause() : this.play();
      if (target.dataset.research === "prev" || target.dataset.research === "next") {
        this.pause(); this.selectNode(this.selected + (target.dataset.research === "next" ? 1 : -1), true);
      }
      if (target.dataset.map === "fit") this.fit();
      if (target.dataset.map === "in" || target.dataset.map === "out") this.zoom(target.dataset.map === "in" ? 1.2 : 1 / 1.2);
    }, { signal });
    this.timeline.addEventListener("input", () => { this.pause(); this.selectNode(Math.round(Number(this.timeline.value)), true); }, { signal });
    this.stage.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "+", "=", "-"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") this.fit();
      else if (["+", "=", "-"].includes(event.key)) this.zoom(event.key === "-" ? 1 / 1.2 : 1.2);
      else { this.pause(); this.selectNode(this.selected + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1), true); this.nodes[this.selected]?.focus({ preventScroll: true }); }
    }, { signal });
    this.stage.addEventListener("wheel", event => {
      if ((event.target as Element).closest(".research-map-tools")) return;
      event.preventDefault(); const rect = this.stage.getBoundingClientRect();
      this.zoom(Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * .002), event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false, signal });
    this.stage.addEventListener("pointerdown", event => {
      if ((event.target as Element).closest(".research-map-tools") || event.button !== 0) return;
      if (this.pointers.size === 0) this.dragged = false;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
      this.pinchDistance = this.pointerDistance();
      // Capturing a click on the stage would retarget node clicks to the stage.
      // Capture only after movement has established a pan or pinch gesture.
    }, { signal });
    this.stage.addEventListener("pointermove", event => {
      const pointer = this.pointers.get(event.pointerId); if (!pointer) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer.x = event.clientX; pointer.y = event.clientY;
      if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > 6) this.dragged = true;
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
    let previousSize = { width: 0, height: 0 };
    this.observer = new ResizeObserver(() => {
      const width = this.stage.clientWidth, height = this.stage.clientHeight;
      if (previousSize.width && !this.pointers.size) {
        this.x += (width - previousSize.width) / 2;
        this.y += (height - previousSize.height) / 2;
        this.paintMap();
      }
      previousSize = { width, height };
    });
    this.observer.observe(this.stage);
    this.selectNode(0);
    requestAnimationFrame(() => {
      if (signal.aborted) return;
      if (options.state && this.positions.has(options.state.selected)) {
        this.x = options.state.x; this.y = options.state.y; this.scale = Math.max(.01, Math.min(1.8, options.state.scale));
        this.selectNode(this.ordered.findIndex(n => n.id === options.state!.selected)); this.paintMap();
      } else {
        this.fit();
        // Preserve readable labels on first entry. The explicit overview control
        // may zoom out farther, but the default view starts at a useful scale.
        if (this.scale < .84) {
          this.scale = .84;
          const first = this.positions.get(this.ordered[0]?.id);
          this.x = 42 - (first?.x ?? 0) * this.scale;
          const area = this.usableArea();
          this.y = area.top + (area.bottom - area.top - this.mapHeight * this.scale) / 2;
          if (this.stage.clientWidth < 600) this.centerSelected();
          this.paintMap();
        }
      }
    });
  }
  private pointerDistance() { const p = [...this.pointers.values()]; return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
  private paintMap() {
    this.map.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
    this.host.querySelector(".research-zoom")!.textContent = `${Math.round(this.scale * 100)}%`;
  }
  private usableArea() {
    const label = this.stage.querySelector<HTMLElement>(".research-stage-label")!;
    const tools = this.stage.querySelector<HTMLElement>(".research-map-tools")!;
    return { top: label.offsetTop + label.offsetHeight + 20, bottom: Math.max(label.offsetTop + label.offsetHeight + 120, tools.offsetTop - 16) };
  }
  private fit() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    const area = this.usableArea();
    this.scale = Math.max(.01, Math.min(1, (w - 40) / this.mapWidth, (area.bottom - area.top) / this.mapHeight));
    this.x = (w - this.mapWidth * this.scale) / 2;
    this.y = area.top + (area.bottom - area.top - this.mapHeight * this.scale) / 2;
    this.paintMap();
  }
  private zoom(factor: number, cx = this.stage.clientWidth / 2, cy = this.stage.clientHeight / 2) {
    const previous = this.scale; this.scale = Math.max(.01, Math.min(1.8, this.scale * factor));
    this.x = cx - (cx - this.x) * this.scale / previous;
    this.y = cy - (cy - this.y) * this.scale / previous;
    this.paintMap();
  }
  private centerSelected() {
    const p = this.positions.get(this.ordered[this.selected]?.id); if (!p) return;
    const area = this.usableArea();
    this.x = this.stage.clientWidth / 2 - (p.x + 110) * this.scale;
    this.y = (area.top + area.bottom) / 2 - (p.y + 55) * this.scale;
  }
  private keepSelectedVisible() {
    const p = this.positions.get(this.ordered[this.selected]?.id); if (!p) return;
    const area = this.usableArea();
    const x = this.x + p.x * this.scale, y = this.y + p.y * this.scale;
    if (x < 15 || x + 220 * this.scale > this.stage.clientWidth - 15 || y < area.top || y + 110 * this.scale > area.bottom) {
      this.centerSelected(); this.paintMap();
    }
  }
  private selectNode(index: number, center = false) {
    if (!this.ordered.length) return;
    this.selected = Math.max(0, Math.min(this.ordered.length - 1, index));
    const node = this.ordered[this.selected];
    this.nodes.forEach((button, i) => { button.classList.toggle("is-selected", i === this.selected); button.setAttribute("aria-pressed", String(i === this.selected)); });
    this.map.querySelectorAll<SVGPathElement>("path").forEach(path => path.classList.toggle("is-active", path.dataset.from === node.id || path.dataset.to === node.id));
    const paragraphs = (text: string) => text.split(/\n\s*\n/).filter(Boolean).map(p => `<p>${escapeHtml(p)}</p>`).join("");
    this.inspector.innerHTML = `<div class="projection-eyebrow">NODE ${String(this.selected + 1).padStart(2, "0")}<span>${researchStatus[node.status]}</span></div><h2 class="projection-node-title">${escapeHtml(node.title)}</h2><div class="projection-node-meta"><span>${escapeHtml(node.date)}</span><span>${escapeHtml(node.evidence)}</span></div>
      ${[["当时的问题", node.question], ["尝试", node.attempt], ["观察结果", node.result], ["当时的判断", node.interpretation]].filter(([, value]) => value).map(([label, value]) => `<section class="projection-section"><h3>${label}</h3>${paragraphs(value)}</section>`).join("")}
      <section class="projection-recap" aria-label="随当前节点更新的复盘"><div class="projection-eyebrow">RETROSPECTIVE<span>${escapeHtml(this.data.retrospectiveDate ?? "节点复盘")}</span></div><h3>回看这一刻</h3>${node.retrospective.length ? node.retrospective.map(p => `<p>${escapeHtml(p)}</p>`).join("") : '<p class="projection-empty-note">此节点尚未收录复盘原文。</p>'}</section><div class="projection-sources">${sourceMarkup(node.sources)}</div>`;
    this.inspector.dataset.nodeId = node.id;
    this.inspector.scrollTop = 0;
    this.timeline.value = String(this.selected);
    this.timeline.setAttribute("aria-valuetext", `${this.selected + 1}，${node.title}`);
    this.host.querySelector(".projection-step")!.textContent = `${String(this.selected + 1).padStart(2, "0")} / ${String(this.ordered.length).padStart(2, "0")} · ${node.date}`;
    this.host.querySelector<HTMLButtonElement>('[data-research="prev"]')!.disabled = this.selected === 0;
    this.host.querySelector<HTMLButtonElement>('[data-research="next"]')!.disabled = this.selected === this.ordered.length - 1;
    if (center) this.keepSelectedVisible();
  }
  private play() {
    if (this.ordered.length < 2) return;
    if (this.selected === this.ordered.length - 1) this.selectNode(0, true);
    this.playing = true; this.playPosition = this.selected; this.elapsed = 0; this.last = 0;
    this.playButton.textContent = "暂停回放"; this.playButton.setAttribute("aria-pressed", "true");
    this.host.dataset.replaying = "true";
    const tick = (ms: number) => {
      if (!this.playing) return;
      if (this.last && !document.hidden) this.elapsed += Math.min(.1, (ms - this.last) / 1000);
      this.last = ms;
      const position = Math.min(this.ordered.length - 1, this.playPosition + this.elapsed / 5);
      const index = Math.floor(position);
      if (index !== this.selected) this.selectNode(index, true);
      this.timeline.value = String(position);
      this.nodes.forEach((node, i) => node.classList.toggle("is-future", i > index));
      if (!this.reduced) this.map.querySelectorAll<SVGPathElement>("path").forEach(path => {
        const destination = this.ordered.findIndex(node => node.id === path.dataset.to);
        const progress = Math.max(0, Math.min(1, position - destination + 1));
        const length = path.getTotalLength();
        path.style.strokeDasharray = String(length);
        path.style.strokeDashoffset = String(length * (1 - progress));
      });
      if (position >= this.ordered.length - 1) this.pause();
      else this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  private pause() {
    this.playing = false; cancelAnimationFrame(this.frame);
    this.playButton.textContent = "回放历程"; this.playButton.setAttribute("aria-pressed", "false");
    delete this.host.dataset.replaying;
    this.nodes.forEach(node => node.classList.remove("is-future"));
    this.map.querySelectorAll<SVGPathElement>("path").forEach(path => { path.style.strokeDasharray = ""; path.style.strokeDashoffset = ""; });
  }
  getState(): ResearchViewState { return { selected: this.ordered[this.selected]?.id ?? "", x: this.x, y: this.y, scale: this.scale }; }
  getStats() { return { ...this.getState(), playing: this.playing, nodeCount: this.ordered.length, retrospectiveNode: this.inspector.dataset.nodeId, reducedMotion: this.reduced }; }
  setReducedMotion(value: boolean) { this.reduced = value; this.host.dataset.reduced = String(value); }
  dispose() { this.pause(); this.abort.abort(); this.observer.disconnect(); this.host.replaceChildren(); }
}
