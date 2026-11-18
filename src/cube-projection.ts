import {
  AmbientLight, Box3, BoxGeometry, BufferGeometry, Color, DirectionalLight,
  EdgesGeometry, Float32BufferAttribute, GridHelper, Group, LineBasicMaterial,
  LineSegments, MathUtils, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NoBlending, NoColorSpace, OrthographicCamera, PerspectiveCamera, Quaternion,
  Raycaster, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector2,
  Vector3, WebGLRenderer, WebGLRenderTarget,
} from "three";
import { CubeArcball } from "./cube-rotation.ts";

export type CubeVector = [number, number, number];
export type CubeTool = "inspect" | "remove" | "restore" | "paint";
export interface CubeObserver {
  mode: "orbit" | "fixed";
  eye: CubeVector;
  target: CubeVector;
  up: CubeVector;
  projection: "perspective" | "orthographic";
  fov: number;
  orthoSize: number;
}
export interface CubeExperiment {
  format: "cube-projection/v2";
  n: number;
  /** Index = x + n * (y + n * z), with zero-based integer coordinates. */
  present: number[];
  /** Face order: +X, -X, +Y, -Y, +Z, -Z. Null uses the theme's solid material. */
  colors: (string | null)[][];
  observer: CubeObserver;
}
export interface CubeExperimentPreset { id: string; label: string; data: unknown; }
export interface CubeInspectionState {
  orientation: [number, number, number, number];
  distance: number;
  target: CubeVector;
}
export interface CubeProjectionOptions {
  experiment?: unknown;
  experiments?: CubeExperimentPreset[];
  reducedMotion?: boolean;
  onChange?: (state: CubeExperiment) => void;
}

const FACE_LABELS = ["+X", "−X", "+Y", "−Y", "+Z", "−Z"];
const DIRECTIONS: CubeVector[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const CORNERS: CubeVector[][] = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
];
const TOOL_NAMES: Record<CubeTool, string> = { inspect: "查看", remove: "挖除", restore: "还原", paint: "染面" };
const clone = <T>(value: T): T => structuredClone(value);
const tuple = (v: Vector3): CubeVector => [v.x, v.y, v.z];
export const cubeCoordinates = (index: number, n: number): CubeVector => [index % n, Math.floor(index / n) % n, Math.floor(index / (n * n))];
export const cubeIndex = (x: number, y: number, z: number, n: number) => x + n * (y + n * z);
const spherical = (radius: number, az: number, el: number): CubeVector => {
  const a = MathUtils.degToRad(az), e = MathUtils.degToRad(el);
  return [radius * Math.cos(e) * Math.sin(a), radius * Math.sin(e), radius * Math.cos(e) * Math.cos(a)];
};

/** A generic complete lattice, deliberately independent of archive-specific constructions. */
export function defaultCubeExperiment(n = 3): CubeExperiment {
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new Error("阶数须为 1–12 的整数。");
  return {
    format: "cube-projection/v2", n,
    present: Array(n ** 3).fill(1), colors: Array.from({ length: n ** 3 }, () => Array(6).fill(null)),
    observer: { mode: "orbit", eye: spherical(n * 2.5, 42, 27), target: [0, 0, 0], up: [0, 1, 0], projection: "perspective", fov: 44, orthoSize: n * 1.85 },
  };
}

/**
 * Boundary adapter for the existing cube-observatory/v1 interchange format.
 * It retains lattice/face data and the actual eye/aim, not its old pointer controls.
 * No experimental construction or mathematical claim is bundled in this core.
 */
export function parseCubeExperiment(input: unknown): CubeExperiment {
  if (!input || typeof input !== "object") throw new Error("请载入有效的立方体实验文件。");
  const raw = input as Record<string, any>;
  if (!["cube-observatory/v1", "cube-projection/v2"].includes(raw.format)) throw new Error("无法识别实验文件格式。");
  if (!Number.isInteger(raw.n) || raw.n < 1 || raw.n > 12) throw new Error("阶数须为 1–12 的整数。");
  const d = defaultCubeExperiment(raw.n), length = d.n ** 3;
  if (!Array.isArray(raw.present) || raw.present.length !== length || Array.from(raw.present).some((v: unknown) => ![0, 1, false, true].includes(v as number))) throw new Error("方块状态数组不完整。");
  if (!Array.isArray(raw.colors) || raw.colors.length !== length || Array.from(raw.colors).some((face: unknown) => !Array.isArray(face) || face.length !== 6 || Array.from(face).some(c => c !== null && (typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c))))) throw new Error("面颜色数据无效。");
  d.present = raw.present.map(Number); d.colors = raw.colors.map((face: (string | null)[]) => face.slice());
  const number = (value: unknown, fallback: number, min: number, max: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("观察参数须为有限数字。");
    return MathUtils.clamp(value, min, max);
  };
  const vector = (value: unknown, name: string): CubeVector => {
    if (!Array.isArray(value) || value.length !== 3 || Array.from(value).some(v => typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > d.n * 100 + 2)) throw new Error(`${name}坐标无效。`);
    return value.slice() as CubeVector;
  };
  if (raw.format === "cube-observatory/v1") {
    const fixed = raw.mode === "inside", old = fixed ? raw.inside ?? {} : raw.orbit ?? {};
    const eye = spherical(number(old.radius, fixed ? 0 : d.n * 2.5, fixed ? 0 : d.n * Math.sqrt(3) / 2 + .04, d.n * 100), number(old.az, fixed ? 0 : 42, -180, 180), number(old.el, fixed ? 0 : 27, -90, 90));
    const forward = spherical(1, number(old.yaw, 45, -180, 180), number(old.pitch, 0, -90, 90));
    d.observer = { ...d.observer, mode: fixed ? "fixed" : "orbit", eye, target: fixed ? eye.map((v, i) => v + forward[i]) as CubeVector : [0, 0, 0], projection: !fixed && raw.projection === "orthographic" ? "orthographic" : "perspective", fov: number(raw.fov, 44, 25, 110), orthoSize: number(raw.orthoSize, d.n * 1.85, d.n * .25, d.n * 8) };
  } else {
    if (!raw.observer || typeof raw.observer !== "object") throw new Error("观察点数据缺失。");
    const o = raw.observer;
    d.observer = { mode: o.mode === "fixed" ? "fixed" : "orbit", eye: vector(o.eye, "观察点"), target: vector(o.target, "视线目标"), up: vector(o.up, "视线上方"), projection: o.projection === "orthographic" && o.mode !== "fixed" ? "orthographic" : "perspective", fov: number(o.fov, 44, 25, 110), orthoSize: number(o.orthoSize, d.n * 1.85, d.n * .25, d.n * 8) };
  }
  const direction = new Vector3(...d.observer.target).sub(new Vector3(...d.observer.eye));
  if (direction.lengthSq() < 1e-12) throw new Error("观察点和视线目标不能重合。");
  let up = new Vector3(...d.observer.up);
  if (up.lengthSq() < 1e-12) throw new Error("视线上方方向不能为空。");
  direction.normalize(); up.normalize();
  // Only imported collinear axes need a deterministic initial basis. Interactive
  // orientation always stores its quaternion-derived up, including through poles.
  if (Math.abs(up.dot(direction)) > .999999) up = Math.abs(direction.z) < .9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  d.observer.up = tuple(up);
  return d;
}

export function cubeEyeOccupancy(state: CubeExperiment): number[] {
  const eye = state.observer.eye, epsilon = .00001;
  const occupied: number[] = [];
  state.present.forEach((present, i) => {
    if (!present) return;
    const c = cubeCoordinates(i, state.n);
    if (c.every((v, axis) => eye[axis] >= v - state.n / 2 - epsilon && eye[axis] <= v + 1 - state.n / 2 + epsilon)) occupied.push(i);
  });
  return occupied;
}

type Hit = { index: number; face: number };
type PointerState = { x: number; y: number; startX: number; startY: number; started: number; moved: boolean; button: number; tool: CubeTool; inspectOnly: boolean };

/** Native, opaque geometry and two explicitly different cameras on one work surface. */
export class CubeProjection {
  readonly root: HTMLElement;
  private options: CubeProjectionOptions;
  private state: CubeExperiment;
  private mainCanvas: HTMLCanvasElement;
  private eyeCanvas: HTMLCanvasElement;
  private abort = new AbortController();
  private resizeObserver?: ResizeObserver;
  private renderer?: WebGLRenderer;
  private eyeRenderer?: WebGLRenderer;
  private scene = new Scene();
  private eyeScene = new Scene();
  private idScene = new Scene();
  private camera = new PerspectiveCamera(38, 1, .01, 1000);
  private mathPerspective = new PerspectiveCamera();
  private mathOrthographic = new OrthographicCamera();
  private ball = new CubeArcball();
  private mathBall = new CubeArcball();
  private distance = 12;
  private targetDistance = 12;
  private target = new Vector3();
  private autoFitInspection = true;
  private bodyMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: .66, metalness: .04, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  private lineMaterial = new LineBasicMaterial({ color: 0x77756e });
  private apparatusMaterial = new LineBasicMaterial({ color: 0x9f7a32, transparent: true, opacity: .65 });
  private markerMaterial = new MeshBasicMaterial({ color: 0xb78835 });
  private selectionMaterial = new LineBasicMaterial({ color: 0xb78835, depthTest: true });
  private idMaterial = new ShaderMaterial({
    vertexShader: "attribute vec3 cellId; varying vec3 vCell; void main(){vCell=cellId; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: "varying vec3 vCell; void main(){gl_FragColor=vec4(vCell,1.0);}",
    blending: NoBlending, toneMapped: false,
  });
  private geometry = new BufferGeometry();
  private lineGeometry = new BufferGeometry();
  private body = new Mesh(this.geometry, this.bodyMaterial);
  private eyeBody = new Mesh(this.geometry, this.bodyMaterial);
  private idBody = new Mesh(this.geometry, this.idMaterial);
  private lines = new LineSegments(this.lineGeometry, this.lineMaterial);
  private eyeLines = new LineSegments(this.lineGeometry, this.lineMaterial);
  private apparatus = new Group();
  private aim = new LineSegments(new BufferGeometry(), this.apparatusMaterial);
  private marker = new Mesh(new SphereGeometry(.075, 12, 8), this.markerMaterial);
  private selection: LineSegments;
  private grid?: GridHelper;
  private owners: Hit[] = [];
  private raycaster = new Raycaster();
  private pointers = new Map<number, PointerState>();
  private cancelObserverGesture = () => {};
  private pinch = { distance: 0, angle: 0 };
  private reduced = false;
  private disposed = false;
  private dirty = true;
  private eyeDirty = true;
  private raf = 0;
  private lastTime = 0;
  private countTimer?: ReturnType<typeof setTimeout>;
  private countTarget?: WebGLRenderTarget;
  private countBuffer = new Uint8Array();
  private count: number | null = null;
  private countPending = false;
  private countPasses = 0;
  private countRevision = 0;
  private countSize = { width: 0, height: 0 };
  private lastCountError = "";
  private undoStack: CubeExperiment[] = [];
  private redoStack: CubeExperiment[] = [];
  private tool: CubeTool = "inspect";
  private paint = "#c79845";
  private erase = false;
  private axis: "x" | "y" | "z" = "z";
  private layer = 1;
  private selected: Hit | null = null;
  private hover: Hit | null = null;
  private temporaryInspect = false;
  private wheelHistoryAt = -Infinity;
  private baseColor = new Color("#ded9cb");

  constructor(host: HTMLElement, options: CubeProjectionOptions = {}) {
    this.options = options;
    this.reduced = options.reducedMotion ?? false;
    let initialError = "";
    try { this.state = options.experiment === undefined ? defaultCubeExperiment() : parseCubeExperiment(options.experiment); }
    catch (error) { this.state = defaultCubeExperiment(); initialError = (error as Error).message; }
    this.layer = Math.floor(this.state.n / 2);
    this.root = document.createElement("div"); this.root.className = "cube-projection";
    this.root.innerHTML = `<div class="cube-toolbar" aria-label="实验工具"><div class="cube-tool-group">${Object.entries(TOOL_NAMES).map(([tool, label], i) => `<button type="button" data-tool="${tool}" aria-pressed="${tool === "inspect"}" title="${i + 1} · ${label}">${label}</button>`).join("")}</div><div class="cube-paint-tools" hidden><input type="color" aria-label="染面颜色" value="${this.paint}"><button type="button" data-action="erase" aria-pressed="false">清除面色</button></div><div class="cube-history-tools"><button type="button" data-action="undo" title="Ctrl / ⌘ Z">撤销</button><button type="button" data-action="redo" title="Ctrl / ⌘ Shift Z">重做</button><button type="button" data-action="reset-view">复位检视</button><button type="button" data-action="fit">适配全景</button></div></div>
      <div class="cube-workspace"><div class="cube-stage"><canvas class="cube-view" tabindex="0" aria-label="自由检视整套实验。拖动旋转，滚轮缩放；双指缩放和翻转。检视不改变数学观察点。"></canvas><p class="cube-stage-note">INSPECTION / 自由检视<br>拖动旋转 · 滚轮缩放 · 双指翻转<br>检视不改变数学观察点</p><div class="cube-readout"><span data-readout="model"></span><strong data-readout="selection">未选择格子</strong></div></div>
      <aside class="cube-inspector" aria-label="实验参数"><section><h3>EYE / 数学观察点取景</h3><canvas class="cube-observer-view" tabindex="0" aria-label="数学观察点取景。拖动改变观察位置或朝向，会更新像素估计。"></canvas><p data-readout="observer-hint"></p><div class="cube-counts"><div><output data-readout="count">—</output><small>当前取景 · 像素估计</small></div><div><strong data-readout="present"></strong><small>现有实体方块</small></div></div><p data-readout="sampling" role="status"></p><label>观察方式<select data-field="mode"><option value="orbit">环绕中心 · 改变点位</option><option value="fixed">定点环视 · 只改朝向</option></select></label><label>投影<select data-field="projection"><option value="perspective">透视 · 有限观察点</option><option value="orthographic">正交 · 平行视线</option></select></label><label><span data-readout="fov-label">视野角度</span><input data-field="fov" type="range" min="25" max="110" step="1"><output data-readout="fov"></output></label><div class="cube-eye-coordinates">${["X", "Y", "Z"].map((axis, i) => `<label>${axis}<input type="number" data-eye="${i}" step="0.05" aria-label="观察点 ${axis} 坐标"></label>`).join("")}</div><button type="button" data-action="set-eye">设置观察点</button><button type="button" data-action="center-aim">看向中心</button><button type="button" data-action="eye-selected">移至选中空格</button><p data-readout="eye-warning" hidden></p></section>
      <section><h3>SLICE / 逐层编辑</h3><label>层轴<select data-field="axis"><option value="z">Z</option><option value="y">Y</option><option value="x">X</option></select><output data-readout="layer"></output></label><label><input data-field="layer" type="range" min="1" max="${this.state.n}" value="${this.layer + 1}" step="1" aria-label="选择编辑层"></label><div class="cube-slice-scroll"><div class="cube-slice-grid" role="group" aria-label="当前层格子"></div></div><p data-readout="tool-hint"></p><div class="cube-face-tools" role="group" aria-label="选择或染色的面">${FACE_LABELS.map((label, face) => `<button type="button" data-face="${face}" aria-pressed="false">${label}</button>`).join("")}</div></section>
      <section><h3>DATA / 实验文件</h3><label>阶数<input type="number" data-field="n" min="1" max="12" step="1" value="${this.state.n}"><button type="button" data-action="rebuild">新建</button></label><button type="button" data-action="export">导出实验</button><button type="button" data-action="import">导入实验</button><input type="file" data-field="file" accept=".json,application/json" hidden><p>逐格数据与观察点一起保存；自由检视不写入实验。</p></section><p class="cube-status" role="status" aria-live="polite"></p></aside></div>`;
    host.replaceChildren(this.root);
    this.mainCanvas = this.root.querySelector(".cube-view")!;
    this.eyeCanvas = this.root.querySelector(".cube-observer-view")!;
    const box = new BoxGeometry(1.012, 1.012, 1.012);
    this.selection = new LineSegments(new EdgesGeometry(box), this.selectionMaterial); box.dispose();
    this.selection.visible = false; this.selection.renderOrder = 4;
    this.scene.add(this.body, this.lines, this.selection, this.apparatus);
    this.apparatus.add(this.marker, this.aim);
    this.eyeScene.add(this.eyeBody, this.eyeLines);
    this.idScene.add(this.idBody);
    for (const scene of [this.scene, this.eyeScene]) {
      scene.add(new AmbientLight(0xffffff, 2.05));
      const light = new DirectionalLight(0xfff5df, 2.7); light.position.set(4, 7, 5); scene.add(light);
      const fill = new DirectionalLight(0xe0e5e5, .8); fill.position.set(-4, 1, -3); scene.add(fill);
    }
    this.bindControls(); this.bindInspection(); this.bindObserver();
    try {
      this.renderer = new WebGLRenderer({ canvas: this.mainCanvas, antialias: true, alpha: true });
      this.eyeRenderer = new WebGLRenderer({ canvas: this.eyeCanvas, antialias: true, alpha: true });
      for (const renderer of [this.renderer, this.eyeRenderer]) { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.outputColorSpace = SRGBColorSpace; renderer.setClearColor(0x000000, 0); }
    } catch { this.announce("此设备暂时无法显示三维画面。逐层编辑和实验导入导出仍可使用。"); }
    this.resetInspection(false); this.refreshTheme(); this.syncUI(); this.mathChanged(false);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.mainCanvas); this.resizeObserver.observe(this.eyeCanvas);
    this.resize();
    if (initialError) this.announce(initialError);
    if (options.experiments?.length) this.addPresetControl(options.experiments);
  }

  private query<T extends Element = HTMLElement>(selector: string) { return this.root.querySelector<T>(selector)!; }
  private readout(name: string, text: string) { this.query(`[data-readout="${name}"]`).textContent = text; }
  private announce(message: string) { this.query(".cube-status").textContent = message; }
  private get mathCamera() { return this.state.observer.projection === "orthographic" ? this.mathOrthographic : this.mathPerspective; }
  private orientationOfObserver() {
    const o = this.state.observer;
    return new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(new Vector3(...o.eye), new Vector3(...o.target), new Vector3(...o.up)));
  }

  private addPresetControl(presets: CubeExperimentPreset[]) {
    const label = document.createElement("label"), select = document.createElement("select");
    label.textContent = "实验构造 "; select.setAttribute("aria-label", "载入实验构造");
    presets.forEach((preset, i) => { const option = document.createElement("option"); option.value = String(i); option.textContent = preset.label; select.append(option); });
    select.addEventListener("change", () => this.loadExperiment(presets[Number(select.value)].data), { signal: this.abort.signal });
    label.append(select); this.query(".cube-toolbar").prepend(label);
  }

  private buildGeometry() {
    const { n, present, colors } = this.state;
    const positions: number[] = [], normals: number[] = [], shades: number[] = [], ids: number[] = [], edgePositions: number[] = [];
    const edges = new Set<string>(); this.owners = [];
    const color = new Color();
    for (let i = 0; i < present.length; i++) {
      if (!present[i]) continue;
      const c = cubeCoordinates(i, n), code = i + 1;
      for (let face = 0; face < 6; face++) {
        const neighbor = c.map((v, a) => v + DIRECTIONS[face][a]);
        if (neighbor.every(v => v >= 0 && v < n) && present[cubeIndex(neighbor[0], neighbor[1], neighbor[2], n)]) continue;
        const vertices = CORNERS[face].map(corner => corner.map((v, a) => c[a] + v - n / 2));
        color.copy(colors[i][face] ? new Color(colors[i][face]!) : this.baseColor);
        for (const corner of [0, 1, 2, 0, 2, 3]) {
          positions.push(...vertices[corner]); normals.push(...DIRECTIONS[face]); shades.push(color.r, color.g, color.b);
          ids.push((code & 255) / 255, ((code >> 8) & 255) / 255, ((code >> 16) & 255) / 255);
        }
        this.owners.push({ index: i, face }, { index: i, face });
        for (let edge = 0; edge < 4; edge++) {
          const a = vertices[edge], b = vertices[(edge + 1) % 4], key = [a.join(","), b.join(",")].sort().join("/");
          if (!edges.has(key)) { edges.add(key); edgePositions.push(...a, ...b); }
        }
      }
    }
    this.geometry.dispose(); this.lineGeometry.dispose();
    this.geometry = new BufferGeometry(); this.lineGeometry = new BufferGeometry();
    this.geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    this.geometry.setAttribute("color", new Float32BufferAttribute(shades, 3));
    this.geometry.setAttribute("cellId", new Float32BufferAttribute(ids, 3));
    this.geometry.computeBoundingSphere();
    this.lineGeometry.setAttribute("position", new Float32BufferAttribute(edgePositions, 3));
    this.body.geometry = this.eyeBody.geometry = this.idBody.geometry = this.geometry;
    this.lines.geometry = this.eyeLines.geometry = this.lineGeometry;
    if (this.grid) { this.grid.removeFromParent(); this.grid.geometry.dispose(); for (const mat of [this.grid.material].flat()) mat.dispose(); }
    this.grid = new GridHelper(n + 2, n + 2, this.lineMaterial.color, this.lineMaterial.color);
    this.grid.position.y = -n / 2 - .015;
    for (const mat of [this.grid.material].flat()) { mat.transparent = true; mat.opacity = .2; }
    this.scene.add(this.grid);
    this.updateSelection();
  }

  refreshTheme() {
    if (this.disposed) return;
    const css = getComputedStyle(this.root), read = (key: string, fallback: string) => css.getPropertyValue(key).trim() || fallback;
    // The optical CSS token is a color-mix(), which Three.Color does not parse.
    // Reproduce that same mix from the underlying theme's ordinary RGB tokens.
    const ink = new Color(read("--theme-muted", "#77756d")).lerp(new Color(read("--theme-ink", "#080a08")), .22);
    this.baseColor.set(read("--theme-panel", "#ded9cb"));
    const luminance = this.baseColor.r * .2126 + this.baseColor.g * .7152 + this.baseColor.b * .0722;
    const darkAmount = 1 - MathUtils.smoothstep(luminance, .025, .22);
    // Keep opaque faces readable as volumes in the dark optical theme, without
    // turning the specimen into either a glowing object or a transparent grid.
    this.baseColor.lerp(new Color("#b9b5a7"), .14 * darkAmount);
    this.lineMaterial.color.copy(ink).lerp(this.baseColor, .28 + .24 * darkAmount);
    const accent = read("--theme-accent", "#9b7247");
    this.markerMaterial.color.set(accent); this.selectionMaterial.color.set(accent); this.apparatusMaterial.color.set(accent);
    this.buildGeometry(); this.dirty = true; this.eyeDirty = true; this.requestFrame();
  }

  private resetInspection(animate = true) {
    const eye = new Vector3(...spherical(1, 76, 36));
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(eye, new Vector3(), new Vector3(0, 1, 0)));
    this.ball.setOrientation(q, animate && !this.reduced); this.autoFitInspection = true;
    this.fitInspection(!animate || this.reduced, q);
    this.dirty = true; this.requestFrame();
  }

  private fitInspection(immediate = false, orientation = this.ball.orientation) {
    const n = this.state.n, points: Vector3[] = [], inverse = orientation.clone().invert();
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push(new Vector3(x, y, z).multiplyScalar(n / 2));
    points.push(new Vector3(...this.state.observer.eye));
    const apparatus = this.aim.geometry.getAttribute("position");
    if (apparatus) for (let i = 0; i < apparatus.count; i++) points.push(new Vector3().fromBufferAttribute(apparatus, i));
    points.forEach(point => point.applyQuaternion(inverse));
    const center = new Box3().setFromPoints(points).getCenter(new Vector3());
    this.target.copy(center).applyQuaternion(orientation);
    const vertical = Math.tan(MathUtils.degToRad(this.camera.fov / 2)), horizontal = vertical * this.camera.aspect;
    // Fit every actual point at its own depth, including the eye and frustum.
    // A circumscribed cube alone clips the eye on portrait screens.
    let distance = n * .95;
    for (const point of points) {
      point.sub(center);
      distance = Math.max(distance, point.z + Math.abs(point.x) * 1.15 / horizontal, point.z + Math.abs(point.y) * 1.2 / vertical);
    }
    this.targetDistance = Math.min(n * 100, distance); this.autoFitInspection = true;
    if (this.reduced || immediate) this.distance = this.targetDistance;
    this.dirty = true; this.requestFrame();
  }

  private resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.mainCanvas.clientWidth), height = Math.max(1, this.mainCanvas.clientHeight);
    this.renderer?.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    const ew = Math.max(1, this.eyeCanvas.clientWidth), eh = Math.max(1, this.eyeCanvas.clientHeight);
    const oldAspect = this.mathPerspective.aspect;
    this.eyeRenderer?.setSize(ew, eh, false); this.mathPerspective.aspect = ew / eh;
    this.updateMathCamera(); this.dirty = true; this.eyeDirty = true;
    if (this.autoFitInspection) this.fitInspection(true);
    if (Math.abs(oldAspect - ew / eh) > 1e-5) this.scheduleCount();
    this.requestFrame();
  }

  private updateMathCamera(syncController = true) {
    const o = this.state.observer, aspect = this.mathPerspective.aspect || 1, q = this.orientationOfObserver();
    const eye = new Vector3(...o.eye), direction = new Vector3(0, 0, -1).applyQuaternion(q);
    let minimumDepth = Infinity;
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) minimumDepth = Math.min(minimumDepth, new Vector3(x, y, z).multiplyScalar(this.state.n / 2).sub(eye).dot(direction));
    const near = minimumDepth > 0 ? Math.max(.0001, Math.min(.05, minimumDepth * .25)) : .0001;
    for (const camera of [this.mathPerspective, this.mathOrthographic]) {
      camera.position.copy(eye); camera.quaternion.copy(q); camera.near = near; camera.far = Math.max(100, eye.length() + this.state.n * 20); camera.updateMatrixWorld();
    }
    this.mathPerspective.fov = o.fov; this.mathPerspective.updateProjectionMatrix();
    this.mathOrthographic.left = -o.orthoSize * aspect / 2; this.mathOrthographic.right = -this.mathOrthographic.left;
    this.mathOrthographic.top = o.orthoSize / 2; this.mathOrthographic.bottom = -this.mathOrthographic.top; this.mathOrthographic.updateProjectionMatrix();
    if (syncController) this.mathBall.setOrientation(q);
    this.marker.position.copy(eye); this.marker.scale.setScalar(Math.max(.6, this.state.n / 3));
    const length = Math.min(Math.max(this.state.n * .7, eye.distanceTo(new Vector3(...o.target))), this.state.n * 3);
    const halfHeight = o.projection === "orthographic" ? o.orthoSize / 2 : Math.tan(MathUtils.degToRad(o.fov / 2)) * length;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => new Vector3(x * halfHeight * aspect, y * halfHeight, -length).applyQuaternion(q).add(eye));
    const segments: number[] = [];
    for (let i = 0; i < 4; i++) {
      const start = o.projection === "orthographic" ? new Vector3((i === 0 || i === 3 ? -1 : 1) * halfHeight * aspect, (i < 2 ? -1 : 1) * halfHeight, 0).applyQuaternion(q).add(eye) : eye;
      segments.push(...start.toArray(), ...corners[i].toArray(), ...corners[i].toArray(), ...corners[(i + 1) % 4].toArray());
    }
    segments.push(...eye.toArray(), ...new Vector3(...o.target).toArray());
    this.aim.geometry.dispose(); this.aim.geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(segments, 3));
  }

  private updateInspectionCamera() {
    this.camera.position.set(0, 0, this.distance).applyQuaternion(this.ball.orientation).add(this.target);
    this.camera.quaternion.copy(this.ball.orientation);
    this.camera.near = Math.max(.001, this.distance / 10000); this.camera.far = Math.max(100, this.distance + this.state.n * 100);
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }

  private requestFrame() {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame(time => this.render(time));
  }

  private render(time: number) {
    this.raf = 0; if (this.disposed) return;
    const dt = this.lastTime ? Math.min(.05, (time - this.lastTime) / 1000) : 1 / 60; this.lastTime = time;
    if (this.ball.step(dt, this.reduced)) this.dirty = true;
    if (Math.abs(this.distance - this.targetDistance) > .0001) {
      this.distance += (this.targetDistance - this.distance) * (this.reduced ? 1 : 1 - Math.exp(-dt / .12)); this.dirty = true;
    } else this.distance = this.targetDistance;
    try {
      if (this.dirty) { this.updateInspectionCamera(); this.renderer?.render(this.scene, this.camera); this.dirty = false; }
      if (this.eyeDirty) { this.eyeRenderer?.render(this.eyeScene, this.mathCamera); this.eyeDirty = false; }
    } catch { this.announce("三维显示暂时不可用；可以继续逐层编辑或导出实验。"); }
    if (this.ball.moving && !this.ball.dragging || Math.abs(this.distance - this.targetDistance) > .0001) this.requestFrame();
  }

  private scheduleCount() {
    clearTimeout(this.countTimer); this.countRevision++;
    this.lastCountError = "";
    if (cubeEyeOccupancy(this.state).length) { this.countPending = false; this.count = null; this.syncCount(); return; }
    if (!this.renderer) { this.countPending = false; this.lastCountError = "三维取样不可用"; this.syncCount(); return; }
    this.countPending = true; this.syncCount();
    this.countTimer = setTimeout(() => this.measureVisibility(), 180);
  }

  private measureVisibility() {
    if (this.disposed || !this.renderer || cubeEyeOccupancy(this.state).length) return;
    const aspect = this.mathPerspective.aspect, longSide = 640;
    const width = Math.max(1, Math.round(aspect >= 1 ? longSide : longSide * aspect)), height = Math.max(1, Math.round(aspect >= 1 ? longSide / aspect : longSide));
    if (!this.countTarget || this.countSize.width !== width || this.countSize.height !== height) {
      this.countTarget?.dispose(); this.countTarget = new WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: false });
      this.countTarget.texture.colorSpace = NoColorSpace; this.countBuffer = new Uint8Array(width * height * 4); this.countSize = { width, height };
    }
    const previousTarget = this.renderer.getRenderTarget(), clear = this.renderer.getClearColor(new Color()), alpha = this.renderer.getClearAlpha();
    try {
      this.renderer.setRenderTarget(this.countTarget); this.renderer.setClearColor(0x000000, 1); this.renderer.clear();
      this.renderer.render(this.idScene, this.mathCamera); this.renderer.readRenderTargetPixels(this.countTarget, 0, 0, width, height, this.countBuffer);
      const seen = new Uint8Array(this.state.present.length); let count = 0;
      for (let p = 0; p < this.countBuffer.length; p += 4) {
        const i = this.countBuffer[p] + (this.countBuffer[p + 1] << 8) + (this.countBuffer[p + 2] << 16) - 1;
        if (i >= 0 && i < seen.length && this.state.present[i] && !seen[i]) { seen[i] = 1; count++; }
      }
      this.count = count; this.countPasses++; this.lastCountError = "";
    } catch { this.count = null; this.lastCountError = "设备未能读取像素，仍可编辑"; }
    finally { this.renderer.setRenderTarget(previousTarget); this.renderer.setClearColor(clear, alpha); this.countPending = false; this.syncCount(); }
  }

  private syncCount() {
    this.readout("count", this.count === null ? this.countPending ? "…" : "—" : String(this.count));
    const occupied = cubeEyeOccupancy(this.state).length;
    this.readout("sampling", occupied ? "观察点在实体内或表面，请先移动或挖空。" : this.lastCountError || (this.countPending ? "测量中 · 保留上次结果" : `${this.countSize.width} × ${this.countSize.height} 采样 · 按方块去重`));
  }

  private mathChanged(notify = true, syncController = true) {
    this.updateMathCamera(syncController); this.dirty = true; this.eyeDirty = true;
    this.syncObserver(); this.scheduleCount(); this.requestFrame();
    if (notify) this.options.onChange?.(this.getState());
  }

  private dataChanged() {
    this.buildGeometry(); this.syncUI(); this.mathChanged();
  }

  private pushHistory(snapshot = this.getState()) {
    this.undoStack.push(snapshot); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack = []; this.syncHistory();
  }

  private syncHistory() {
    this.query<HTMLButtonElement>('[data-action="undo"]').disabled = !this.undoStack.length;
    this.query<HTMLButtonElement>('[data-action="redo"]').disabled = !this.redoStack.length;
  }

  private history(redo: boolean) {
    const source = redo ? this.redoStack : this.undoStack, destination = redo ? this.undoStack : this.redoStack;
    const state = source.pop(); if (!state) return;
    destination.push(this.getState()); const changedSize = state.n !== this.state.n; this.state = state;
    this.layer = Math.min(this.layer, state.n - 1); this.selected = null; this.hover = null;
    this.cancelPointers(); this.dataChanged(); if (changedSize) this.resetInspection(false);
    this.announce(redo ? "已重做" : "已撤销");
  }

  private changeObserver(change: (observer: CubeObserver) => void) {
    const before = this.getState(); change(this.state.observer);
    if (JSON.stringify(before.observer) === JSON.stringify(this.state.observer)) return;
    this.pushHistory(before); this.mathChanged();
  }

  private syncObserver() {
    const o = this.state.observer;
    this.query<HTMLSelectElement>('[data-field="mode"]').value = o.mode;
    const projection = this.query<HTMLSelectElement>('[data-field="projection"]'); projection.value = o.projection;
    projection.querySelector<HTMLOptionElement>('[value="orthographic"]')!.disabled = o.mode === "fixed";
    const range = this.query<HTMLInputElement>('[data-field="fov"]'), ortho = o.projection === "orthographic";
    range.min = String(ortho ? this.state.n * .25 : 25); range.max = String(ortho ? this.state.n * 8 : 110); range.step = ortho ? ".05" : "1";
    range.value = String(ortho ? o.orthoSize : o.fov);
    this.readout("fov-label", ortho ? "取景高度" : "视野角度"); this.readout("fov", ortho ? o.orthoSize.toFixed(2) : `${Math.round(o.fov)}°`);
    this.readout("observer-hint", o.mode === "fixed" ? "拖动小图只改变朝向；观察点保持不动。" : "拖动小图改变数学观察点；滚轮调整取景。");
    for (let i = 0; i < 3; i++) { const input = this.query<HTMLInputElement>(`[data-eye="${i}"]`); if (document.activeElement !== input) input.value = String(Number(o.eye[i].toFixed(4))); }
    const occupied = cubeEyeOccupancy(this.state);
    const warning = this.query('[data-readout="eye-warning"]'); warning.hidden = !occupied.length; warning.textContent = occupied.length ? `当前观察点接触 ${occupied.length} 个实体格。逐层挖除这些格子后可在内部观察。` : "";
    this.query<HTMLButtonElement>('[data-action="eye-selected"]').disabled = !this.selected || !!this.state.present[this.selected.index];
  }

  private syncUI() {
    const present = this.state.present.reduce((sum, v) => sum + v, 0);
    this.readout("model", `${this.state.n} × ${this.state.n} × ${this.state.n} / ${this.state.present.length - present} 格已挖除`);
    this.readout("present", String(present)); this.query<HTMLInputElement>('[data-field="n"]').value = String(this.state.n);
    this.root.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.tool === this.tool)));
    this.query(".cube-paint-tools").hidden = this.tool !== "paint";
    this.mainCanvas.style.cursor = this.ball.dragging && [...this.pointers.values()].some(p => p.moved) ? "grabbing" : this.tool === "inspect" || this.temporaryInspect ? "grab" : "crosshair";
    this.readout("tool-hint", { inspect: "点击选格；拖动始终旋转。选择其他工具后才会编辑。", remove: "点击挖除一格；拖动不挖除。层网格可编辑内部。", restore: "点击可见空缺还原；内部空格请用层网格。", paint: "点击一个面染色；面方向按钮可染选格的隐藏面。" }[this.tool]);
    this.drawSlice(); this.updateSelection(); this.syncObserver(); this.syncHistory();
  }

  private drawSlice() {
    const { n } = this.state, grid = this.query(".cube-slice-grid");
    const focusedCell = grid.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.cell : undefined;
    grid.style.gridTemplateColumns = `repeat(${n}, minmax(24px, 1fr))`; grid.replaceChildren();
    this.query<HTMLSelectElement>('[data-field="axis"]').value = this.axis;
    const layerInput = this.query<HTMLInputElement>('[data-field="layer"]'); layerInput.max = String(n); layerInput.value = String(this.layer + 1);
    this.readout("layer", `${this.axis.toUpperCase()} = ${this.layer + 1} / ${n}`);
    for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
      const c = this.axis === "z" ? [col, n - 1 - row, this.layer] : this.axis === "y" ? [col, this.layer, n - 1 - row] : [this.layer, n - 1 - row, col];
      const index = cubeIndex(c[0], c[1], c[2], n), button = document.createElement("button");
      button.type = "button"; button.dataset.cell = String(index); button.dataset.present = String(!!this.state.present[index]);
      button.setAttribute("aria-pressed", String(this.selected?.index === index));
      button.setAttribute("aria-label", `格子 (${c.map(v => v + 1).join(", ")})，${this.state.present[index] ? "实体" : "空缺"}，${TOOL_NAMES[this.tool]}`);
      button.title = button.getAttribute("aria-label")!; button.textContent = this.state.present[index] ? "·" : "+";
      grid.append(button);
    }
    if (focusedCell !== undefined) grid.querySelector<HTMLButtonElement>(`[data-cell="${focusedCell}"]`)?.focus({ preventScroll: true });
  }

  private updateSelection() {
    const hit = this.hover ?? this.selected; this.selection.visible = !!hit;
    if (hit) this.selection.position.set(...cubeCoordinates(hit.index, this.state.n).map(v => v + .5 - this.state.n / 2) as CubeVector);
    this.readout("selection", this.selected ? `(${cubeCoordinates(this.selected.index, this.state.n).map(v => v + 1).join(", ")}) · ${this.state.present[this.selected.index] ? "实体" : "空缺"} · ${FACE_LABELS[this.selected.face]}` : "未选择格子");
    this.root.querySelectorAll<HTMLButtonElement>("[data-face]").forEach(button => { button.disabled = !this.selected; button.setAttribute("aria-pressed", String(Number(button.dataset.face) === this.selected?.face)); });
    this.dirty = true; this.requestFrame();
  }

  private act(hit: Hit, inspectOnly = false) {
    this.selected = hit; this.hover = null;
    this.layer = cubeCoordinates(hit.index, this.state.n)[{ x: 0, y: 1, z: 2 }[this.axis]];
    const value = this.state.present[hit.index]; let changed = false;
    if (!inspectOnly && ((this.tool === "remove" && value) || (this.tool === "restore" && !value))) {
      this.pushHistory(); this.state.present[hit.index] = this.tool === "restore" ? 1 : 0; changed = true;
    } else if (!inspectOnly && this.tool === "paint") {
      const color = this.erase ? null : this.paint;
      if (!value) this.announce("先还原此格，再给它染色。");
      else if (this.state.colors[hit.index][hit.face] !== color) { this.pushHistory(); this.state.colors[hit.index][hit.face] = color; changed = true; }
    }
    if (changed) this.dataChanged(); else this.syncUI();
  }

  private pick(x: number, y: number, inspectOnly = this.temporaryInspect): Hit | null {
    if (!this.renderer) return null;
    this.updateInspectionCamera();
    this.raycaster.setFromCamera(new Vector2(x / this.mainCanvas.clientWidth * 2 - 1, 1 - y / this.mainCanvas.clientHeight * 2), this.camera);
    const opaque = this.raycaster.intersectObject(this.body, false)[0];
    if (this.tool !== "restore" || inspectOnly) return opaque && opaque.faceIndex != null ? this.owners[opaque.faceIndex] : null;
    // Missing cells are pickable only up to the first opaque surface. Hidden
    // internal cells remain addressable through the explicit layer editor.
    const box = new Box3(), point = new Vector3(), n = this.state.n;
    let distance = opaque?.distance ?? Infinity, hit: Hit | null = null;
    for (let i = 0; i < this.state.present.length; i++) {
      if (this.state.present[i]) continue;
      const c = cubeCoordinates(i, n); box.min.set(c[0] - n / 2, c[1] - n / 2, c[2] - n / 2); box.max.copy(box.min).addScalar(1);
      if (!this.raycaster.ray.intersectBox(box, point)) continue;
      const d = this.raycaster.ray.origin.distanceTo(point);
      if (d < distance - .00001) { distance = d; hit = { index: i, face: this.selected?.face ?? 4 }; }
    }
    return hit;
  }

  private setTool(tool: CubeTool) { this.cancelPointers(); this.tool = tool; this.hover = null; this.syncUI(); }
  private cancelPointers() {
    for (const id of this.pointers.keys()) { try { this.mainCanvas.releasePointerCapture(id); } catch {} }
    this.pointers.clear(); this.ball.cancel(); this.cancelObserverGesture(); this.temporaryInspect = false;
  }
  private point(event: PointerEvent, canvas = this.mainCanvas) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }

  private bindInspection() {
    const canvas = this.mainCanvas, signal = this.abort.signal;
    canvas.addEventListener("contextmenu", event => event.preventDefault(), { signal });
    canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0 && event.button !== 2) return;
      this.autoFitInspection = false;
      canvas.focus({ preventScroll: true }); const p = this.point(event);
      this.pointers.set(event.pointerId, { ...p, startX: p.x, startY: p.y, started: event.timeStamp, moved: false, button: event.button, tool: this.tool, inspectOnly: this.temporaryInspect });
      this.hover = null;
      if (this.pointers.size === 1) this.ball.begin(p.x, p.y, canvas.clientWidth, canvas.clientHeight, event.timeStamp);
      else {
        this.pointers.forEach(p => p.moved = true);
        const [a, b] = [...this.pointers.values()]; this.pinch = { distance: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
        this.ball.begin((a.x + b.x) / 2, (a.y + b.y) / 2, canvas.clientWidth, canvas.clientHeight, event.timeStamp);
      }
      canvas.setPointerCapture(event.pointerId); event.preventDefault(); this.updateSelection();
    }, { signal });
    canvas.addEventListener("pointermove", event => {
      const p = this.point(event), previous = this.pointers.get(event.pointerId);
      if (!previous) { this.hover = this.pick(p.x, p.y); this.updateSelection(); return; }
      previous.x = p.x; previous.y = p.y;
      if (Math.hypot(p.x - previous.startX, p.y - previous.startY) > 8) previous.moved = true;
      if (this.pointers.size > 1) {
        const [a, b] = [...this.pointers.values()], distance = Math.hypot(b.x - a.x, b.y - a.y), angle = Math.atan2(b.y - a.y, b.x - a.x);
        this.ball.move((a.x + b.x) / 2, (a.y + b.y) / 2, event.timeStamp);
        if (distance > 0 && this.pinch.distance > 0) this.zoomInspection(Math.log(this.pinch.distance / distance));
        this.ball.twist(Math.atan2(Math.sin(angle - this.pinch.angle), Math.cos(angle - this.pinch.angle)), event.timeStamp); this.pinch = { distance, angle };
      } else if (previous.moved) this.ball.move(p.x, p.y, event.timeStamp);
      else return;
      canvas.style.cursor = "grabbing"; this.dirty = true; this.requestFrame();
    }, { signal });
    const release = (event: PointerEvent, canceled: boolean) => {
      const pointer = this.pointers.get(event.pointerId); if (!pointer) return;
      this.pointers.delete(event.pointerId);
      if (!canceled && !pointer.moved && pointer.button === 0 && event.timeStamp - pointer.started < 550 && pointer.tool === this.tool) {
        const p = this.point(event), inspectOnly = pointer.inspectOnly || this.temporaryInspect, hit = this.pick(p.x, p.y, inspectOnly); if (hit) this.act(hit, inspectOnly);
      }
      if (!this.pointers.size) this.ball.end(event.timeStamp, this.reduced || canceled || !pointer.moved);
      else {
        const [a, b] = [...this.pointers.values()]; this.pointers.forEach(p => p.moved = true);
        if (b) {
          this.pinch = { distance: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
          this.ball.begin((a.x + b.x) / 2, (a.y + b.y) / 2, canvas.clientWidth, canvas.clientHeight, event.timeStamp);
        } else this.ball.begin(a.x, a.y, canvas.clientWidth, canvas.clientHeight, event.timeStamp);
      }
      try { canvas.releasePointerCapture(event.pointerId); } catch {}
      this.syncUI(); this.dirty = true; this.requestFrame();
    };
    canvas.addEventListener("pointerup", event => release(event, false), { signal });
    canvas.addEventListener("pointercancel", event => release(event, true), { signal });
    canvas.addEventListener("lostpointercapture", event => { if (this.pointers.has(event.pointerId)) release(event, true); }, { signal });
    canvas.addEventListener("pointerleave", () => { if (!this.pointers.size) { this.hover = null; this.updateSelection(); } }, { signal });
    canvas.addEventListener("wheel", event => { event.preventDefault(); event.stopPropagation(); this.zoomInspection(event.deltaY * (event.deltaMode === 1 ? .035 : .0012)); }, { signal, passive: false });
    window.addEventListener("blur", () => { this.cancelPointers(); this.syncUI(); }, { signal });
  }

  private zoomInspection(delta: number) {
    this.autoFitInspection = false;
    this.targetDistance = MathUtils.clamp(this.targetDistance * Math.exp(MathUtils.clamp(delta, -.7, .7)), this.state.n * .95, this.state.n * 100);
    if (this.reduced) this.distance = this.targetDistance;
    this.dirty = true; this.requestFrame();
  }

  private bindObserver() {
    const canvas = this.eyeCanvas, signal = this.abort.signal;
    let pointer: number | null = null, before: CubeExperiment | null = null, historySaved = false;
    let start = { x: 0, y: 0 }, moved = false;
    canvas.style.touchAction = "none"; canvas.style.cursor = "grab";
    this.cancelObserverGesture = () => {
      const id = pointer; pointer = null; before = null; this.mathBall.cancel(); canvas.style.cursor = "grab";
      if (id !== null) { try { canvas.releasePointerCapture(id); } catch {} }
    };
    canvas.addEventListener("contextmenu", event => event.preventDefault(), { signal });
    canvas.addEventListener("pointerdown", event => {
      if (pointer !== null || event.button !== 0) return;
      pointer = event.pointerId; before = this.getState(); historySaved = false; moved = false; start = this.point(event, canvas);
      this.mathBall.setOrientation(this.orientationOfObserver()); this.mathBall.begin(start.x, start.y, canvas.clientWidth, canvas.clientHeight, event.timeStamp);
      canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); event.preventDefault();
    }, { signal });
    canvas.addEventListener("pointermove", event => {
      if (pointer !== event.pointerId) return;
      const p = this.point(event, canvas);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 3) return;
      moved = true; if (!historySaved && before) { this.pushHistory(before); historySaved = true; }
      if (!this.mathBall.move(p.x, p.y, event.timeStamp)) return;
      const q = this.mathBall.orientation.clone(), o = this.state.observer;
      const radius = new Vector3(...o.eye).distanceTo(new Vector3(...o.target));
      if (o.mode === "orbit") o.eye = tuple(new Vector3(0, 0, radius).applyQuaternion(q).add(new Vector3(...o.target)));
      else o.target = tuple(new Vector3(0, 0, -1).applyQuaternion(q).add(new Vector3(...o.eye)));
      o.up = tuple(new Vector3(0, 1, 0).applyQuaternion(q));
      // Preserve this drag's pointer baseline while updating both displays.
      this.mathChanged(true, false); canvas.style.cursor = "grabbing";
    }, { signal });
    const end = (event: PointerEvent) => {
      if (pointer !== event.pointerId) return; pointer = null; this.mathBall.end(event.timeStamp, true); canvas.style.cursor = "grab";
      try { canvas.releasePointerCapture(event.pointerId); } catch {}
    };
    canvas.addEventListener("pointerup", end, { signal }); canvas.addEventListener("pointercancel", end, { signal }); canvas.addEventListener("lostpointercapture", end, { signal });
    canvas.addEventListener("wheel", event => {
      event.preventDefault(); event.stopPropagation(); if (performance.now() - this.wheelHistoryAt > 300) this.pushHistory(); this.wheelHistoryAt = performance.now();
      const factor = Math.exp(MathUtils.clamp(event.deltaY * (event.deltaMode === 1 ? .03 : .0015), -.5, .5)), o = this.state.observer;
      if (o.projection === "orthographic") o.orthoSize = MathUtils.clamp(o.orthoSize * factor, this.state.n * .25, this.state.n * 8);
      else if (o.mode === "fixed") o.fov = MathUtils.clamp(o.fov * factor, 25, 110);
      else { const target = new Vector3(...o.target), v = new Vector3(...o.eye).sub(target); v.setLength(MathUtils.clamp(v.length() * factor, this.state.n * Math.sqrt(3) / 2 + .04, this.state.n * 100)); o.eye = tuple(v.add(target)); }
      this.mathChanged();
    }, { signal, passive: false });
  }

  private bindControls() {
    const signal = this.abort.signal;
    this.root.addEventListener("click", event => {
      const element = (event.target as Element).closest<HTMLElement>("button"); if (!element) return;
      if (element.dataset.tool) { this.setTool(element.dataset.tool as CubeTool); return; }
      if (element.dataset.cell !== undefined) { this.act({ index: Number(element.dataset.cell), face: this.selected?.face ?? 4 }, event.shiftKey); return; }
      if (element.dataset.face !== undefined && this.selected) { this.act({ index: this.selected.index, face: Number(element.dataset.face) }, this.tool !== "paint"); return; }
      switch (element.dataset.action) {
        case "undo": this.history(false); break;
        case "redo": this.history(true); break;
        case "reset-view": this.resetInspection(); break;
        case "fit": this.fitInspection(); break;
        case "erase": this.erase = !this.erase; element.setAttribute("aria-pressed", String(this.erase)); break;
        case "set-eye": {
          const eye = [0, 1, 2].map(i => Number(this.query<HTMLInputElement>(`[data-eye="${i}"]`).value)) as CubeVector;
          if (eye.some(v => !Number.isFinite(v) || Math.abs(v) > this.state.n * 100)) { this.announce("请输入有限坐标，范围不超过阶数的 100 倍。"); break; }
          this.moveEye(eye); break;
        }
        case "center-aim":
          if (new Vector3(...this.state.observer.eye).lengthSq() < 1e-8) this.announce("观察点正好在中心；请先移动观察点。");
          else this.changeObserver(o => { o.target = [0, 0, 0]; o.up = Math.abs(new Vector3(...o.eye).normalize().y) > .999 ? [0, 0, 1] : [0, 1, 0]; });
          break;
        case "eye-selected": if (this.selected && !this.state.present[this.selected.index]) this.moveEye(cubeCoordinates(this.selected.index, this.state.n).map(v => v + .5 - this.state.n / 2) as CubeVector); break;
        case "rebuild": {
          try { const next = defaultCubeExperiment(Number(this.query<HTMLInputElement>('[data-field="n"]').value)); this.pushHistory(); this.state = next; this.selected = this.hover = null; this.layer = Math.floor(next.n / 2); this.dataChanged(); this.resetInspection(false); this.announce("已新建完整体块，可撤销。"); }
          catch (error) { this.announce((error as Error).message); } break;
        }
        case "export": {
          const url = URL.createObjectURL(new Blob([JSON.stringify(this.getState(), null, 2)], { type: "application/json" }));
          const link = document.createElement("a"); link.href = url; link.download = `cube-experiment-${this.state.n}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); this.announce("实验文件已导出。"); break;
        }
        case "import": this.query<HTMLInputElement>('[data-field="file"]').click(); break;
      }
    }, { signal });
    this.query<HTMLInputElement>('[type="color"]').addEventListener("input", event => { this.paint = (event.target as HTMLInputElement).value; this.erase = false; this.query('[data-action="erase"]').setAttribute("aria-pressed", "false"); }, { signal });
    this.query<HTMLInputElement>('[data-field="layer"]').addEventListener("input", event => { this.layer = Number((event.target as HTMLInputElement).value) - 1; this.drawSlice(); }, { signal });
    this.query<HTMLSelectElement>('[data-field="axis"]').addEventListener("change", event => { this.axis = (event.target as HTMLSelectElement).value as typeof this.axis; this.drawSlice(); }, { signal });
    this.query<HTMLSelectElement>('[data-field="mode"]').addEventListener("change", event => {
      const mode = (event.target as HTMLSelectElement).value as CubeObserver["mode"];
      this.changeObserver(o => { o.mode = mode; if (mode === "fixed") o.projection = "perspective"; else {
        const eye = new Vector3(...o.eye); if (eye.lengthSq() < 1e-8) eye.set(1, .6, 1);
        eye.setLength(Math.max(eye.length(), this.state.n * Math.sqrt(3) / 2 + .04)); o.eye = tuple(eye); o.target = [0, 0, 0];
        if (Math.abs(eye.clone().normalize().dot(new Vector3(...o.up))) > .999) o.up = [0, 0, 1];
      } });
    }, { signal });
    this.query<HTMLSelectElement>('[data-field="projection"]').addEventListener("change", event => this.changeObserver(o => { o.projection = (event.target as HTMLSelectElement).value === "orthographic" && o.mode === "orbit" ? "orthographic" : "perspective"; }), { signal });
    let rangeSnapshot: CubeExperiment | null = null;
    const fov = this.query<HTMLInputElement>('[data-field="fov"]');
    fov.addEventListener("input", () => { if (!rangeSnapshot) { rangeSnapshot = this.getState(); this.pushHistory(rangeSnapshot); } if (this.state.observer.projection === "orthographic") this.state.observer.orthoSize = Number(fov.value); else this.state.observer.fov = Number(fov.value); this.mathChanged(); }, { signal });
    fov.addEventListener("change", () => { rangeSnapshot = null; }, { signal });
    this.query<HTMLInputElement>('[data-field="file"]').addEventListener("change", async event => {
      const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file) return;
      try { if (file.size > 2_000_000) throw new Error("实验文件过大。"); const data = JSON.parse(await file.text()); if (!this.disposed) this.loadExperiment(data); }
      catch (error) { if (!this.disposed) this.announce((error as Error).message || "无法读取实验文件。"); }
      input.value = "";
    }, { signal });
    this.root.addEventListener("keydown", event => {
      if (event.key === "Escape" || event.key === "Tab") return;
      // Keep editable fields and all projection shortcuts away from archive navigation.
      event.stopPropagation();
      if ((event.target as Element).matches("input, select, textarea")) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(key)) { event.preventDefault(); this.history(key === "y" || event.shiftKey); }
      else if (/^[1-4]$/.test(key)) { event.preventDefault(); this.setTool((["inspect", "remove", "restore", "paint"] as CubeTool[])[Number(key) - 1]); }
      else if (key === "home") { event.preventDefault(); this.resetInspection(); }
      else if (["+", "=", "-", "_"].includes(key)) { event.preventDefault(); this.zoomInspection(key === "-" || key === "_" ? .15 : -.15); }
      else if (key === " " && event.target === this.mainCanvas) { event.preventDefault(); this.temporaryInspect = true; this.syncUI(); }
      else if (["arrowleft", "arrowright", "arrowup", "arrowdown", "q", "e"].includes(key) && event.target === this.mainCanvas) {
        event.preventDefault(); this.autoFitInspection = false; const axis = key === "q" || key === "e" ? new Vector3(0, 0, 1) : key === "arrowleft" || key === "arrowright" ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
        const sign = ["arrowleft", "arrowup", "q"].includes(key) ? 1 : -1;
        const q = this.ball.orientation.clone().multiply(new Quaternion().setFromAxisAngle(axis, sign * Math.PI / 12)); this.ball.setOrientation(q, !this.reduced); this.dirty = true; this.requestFrame();
      }
    }, { signal });
    this.root.addEventListener("keyup", event => { if (event.key === " ") { this.temporaryInspect = false; this.syncUI(); } if (event.key !== "Escape") event.stopPropagation(); }, { signal });
  }

  private moveEye(eye: CubeVector) {
    this.changeObserver(o => { const direction = new Vector3(...o.target).sub(new Vector3(...o.eye)).normalize(); o.eye = eye; o.target = tuple(direction.add(new Vector3(...eye))); o.mode = "fixed"; o.projection = "perspective"; });
  }

  loadExperiment(input: unknown) {
    if (this.disposed) return;
    try {
      const next = parseCubeExperiment(input); this.cancelPointers(); this.pushHistory(); this.state = next; this.selected = this.hover = null; this.layer = Math.floor(next.n / 2); this.tool = "inspect";
      this.count = null; this.dataChanged(); this.resetInspection(false); this.announce("已载入实验。当前为查看工具。");
    } catch (error) { this.announce((error as Error).message); }
  }
  setReducedMotion(value: boolean) {
    this.reduced = value;
    if (value) { if (!this.ball.dragging) this.ball.cancel(); this.distance = this.targetDistance; }
    this.dirty = true; this.requestFrame();
  }
  getState(): CubeExperiment { return clone(this.state); }
  getInspectionState(): CubeInspectionState {
    return { orientation: this.ball.orientation.toArray() as CubeInspectionState["orientation"], distance: this.distance, target: tuple(this.target) };
  }
  restoreInspectionState(input: unknown): void {
    if (this.disposed || !input || typeof input !== "object") return;
    const raw = input as Partial<CubeInspectionState>;
    if (!Array.isArray(raw.orientation) || raw.orientation.length !== 4 || Array.from(raw.orientation).some(v => typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1e6)) return;
    if (!Array.isArray(raw.target) || raw.target.length !== 3 || Array.from(raw.target).some(v => typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > this.state.n * 200)) return;
    if (typeof raw.distance !== "number" || !Number.isFinite(raw.distance) || raw.distance <= 0) return;
    const q = new Quaternion(...raw.orientation); if (q.lengthSq() < 1e-12) return;
    this.cancelPointers(); this.ball.setOrientation(q.normalize()); this.target.set(...raw.target); this.autoFitInspection = false;
    this.distance = this.targetDistance = MathUtils.clamp(raw.distance, this.state.n * .95, this.state.n * 100);
    // This restores only the presentation camera, with no experimental mutation,
    // undo entry, onChange notification or visibility measurement invalidation.
    this.dirty = true; this.requestFrame();
  }
  getStats() {
    return { ready: !!this.renderer && !!this.eyeRenderer, n: this.state.n, present: this.state.present.reduce((sum, value) => sum + value, 0), tool: this.tool, selected: this.selected ? { ...this.selected } : null, inspectionQuaternion: this.ball.orientation.toArray(), inspectionEye: this.camera.position.toArray(), inspectionDistance: this.distance, angularSpeed: this.ball.angularSpeed, observer: clone(this.state.observer), eyeOccupied: cubeEyeOccupancy(this.state), visibleCount: this.count, countPending: this.countPending, countPasses: this.countPasses, countRevision: this.countRevision, sampleSize: { ...this.countSize }, undo: this.undoStack.length, redo: this.redoStack.length, reducedMotion: this.reduced, error: this.lastCountError };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort(); this.resizeObserver?.disconnect(); cancelAnimationFrame(this.raf); clearTimeout(this.countTimer); this.cancelPointers();
    this.geometry.dispose(); this.lineGeometry.dispose(); this.aim.geometry.dispose(); this.marker.geometry.dispose(); this.selection.geometry.dispose();
    if (this.grid) { this.grid.geometry.dispose(); for (const material of [this.grid.material].flat()) material.dispose(); }
    for (const material of [this.bodyMaterial, this.lineMaterial, this.apparatusMaterial, this.markerMaterial, this.selectionMaterial, this.idMaterial]) material.dispose();
    this.countTarget?.dispose(); this.renderer?.dispose(); this.eyeRenderer?.dispose(); this.renderer?.forceContextLoss(); this.eyeRenderer?.forceContextLoss(); this.root.remove();
  }
}
