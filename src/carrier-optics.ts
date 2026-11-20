import type { carrierFrame, OpticalPoint } from "./carrier-flight";

type Point = OpticalPoint;
type Quad = readonly [Point, Point, Point, Point];
type OpticalFrame = ReturnType<typeof carrierFrame>;
type OpticalChannels = {
  sourcePower?: number;
  beamPower?: number;
  platePresence?: number;
  edgePresence?: number;
  frameBuild?: number;
  contentResolve?: number;
};

export type CarrierOpticsInput = {
  frame: OpticalFrame;
  origin: Point;
  /** Model-local TL, TR, BR, BL projected by the already-drawn camera.
   * Preserve their order; a screen-space x/y sort destroys the aperture. */
  aperture?: Quad;
  /** Physical carrier silhouette. Only the light volume is occluded by it. */
  outline?: readonly Point[];
  /** Legacy slit sampling, used only when a physical aperture is unavailable. */
  edge?: readonly [Point, Point];
  width: number;
  height: number;
  planeWidth?: number;
  planeHeight?: number;
  elapsed?: number;
  dark?: boolean;
  reduced?: boolean;
};

export type CarrierOpticsSurface = {
  maskImage: string;
  maskSize: "100% 100%";
  maskRepeat: "no-repeat";
  clarity: number;
  active: boolean;
};

const clamp = (v: number, low = 0, high = 1) => Math.max(low, Math.min(high, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const range = (v: number, a: number, b: number) => smooth((v - a) / (b - a));
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const rgba = (rgb: readonly number[], alpha: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp(alpha)})`;
const CLEAR_MASK = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E")';
// The frustum has a finite optical skin: a narrow reflective inner lip beside
// a wider absorbing shoulder. These are pixel-distance profiles, not rays.
const BEAM_SKIN = new Float32Array(256 * 2);
for (let i = 0; i < 256; i++) {
  const d = i / 255 * 24;
  BEAM_SKIN[i * 2] = Math.exp(-Math.pow((d - 5.8) / 4.1, 2));
  BEAM_SKIN[i * 2 + 1] = Math.exp(-Math.pow((d - 1.6) / 1.65, 2));
}

/** Integer noise is spatial, never time-seeded. A return retraces the same
 * deposit instead of making a new cloud of unrelated particles. */
function noise(x: number, y: number, salt = 0) {
  let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ salt;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/** The advancing field establishes the identity, then the body of the plate.
 * Broad variations are coherent; the last term is subpixel deposit,
 * not a coarse grid of independently appearing rectangles. */
function depositField(u: number, v: number, grain: number) {
  // Identity resolves along the upper margin first, then the same coherent
  // exposure advances through the body. Newly exposed text is already sharp.
  const identity = 1 - range(v, .12, .28);
  const travel = .58 * u + .42 * v - identity * (.50 * u + .32 * v);
  const wave = Math.sin(u * 8.7 + v * 3.1) * .009 + Math.sin(v * 15.3 - u * 4.8) * .005;
  return clamp(.025 + travel * .945 + wave + (grain - .5) * .026, .012, .985);
}

function centreOf(points: readonly Point[]): Point {
  return points.reduce((centre, p) => ({ x: centre.x + p.x / points.length, y: centre.y + p.y / points.length }), { x: 0, y: 0 });
}

function convexHull(points: readonly Point[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: Point[] = [], upper: Point[] = [];
  for (const p of sorted) { while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop(); return lower.concat(upper);
}

/** Inward signed edge distances for a convex projected solid. Keeping the
 * distances in viewport pixels gives the volume a finite, readable soft edge. */
function boundaryEquations(points: readonly Point[]) {
  const centre = centreOf(points);
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    const length = Math.max(.001, distance(a, b));
    let nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
    if ((centre.x - a.x) * nx + (centre.y - a.y) * ny < 0) { nx = -nx; ny = -ny; }
    return [nx, ny, -a.x * nx - a.y * ny];
  });
}

/** Projective interpolation, rather than bilinear corner blending, keeps the
 * coating and its microstructure on the exact same planar camera transform. */
function quadProjector([a, b, c, d]: Quad) {
  const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(denominator) > 1e-8 ? (dx3 * dy2 - dx2 * dy3) / denominator : 0;
  const h = Math.abs(denominator) > 1e-8 ? (dx1 * dy3 - dx3 * dy1) / denominator : 0;
  const ax = b.x - a.x + g * b.x, bx = d.x - a.x + h * d.x;
  const ay = b.y - a.y + g * b.y, by = d.y - a.y + h * d.y;
  return (u: number, v: number): Point => {
    const w = 1 + g * u + h * v;
    return { x: (a.x + ax * u + bx * v) / w, y: (a.y + ay * u + by * v) / w };
  };
}

type Grain = { u: number; v: number; seed: number; size: number; field: number };

/** A transient optical coating for the real projection. It does not draw a
 * replacement UI, capture the page, own a clock, or move the physical carrier.
 * The caller applies the returned alpha mask to its existing DOM plane.
 *
 * The light field is Canvas2D so it remains available independently of the
 * scene's WebGL context. Its geometry still comes from the same drawn camera.
 */
export class CarrierOptics {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly maskContext: CanvasRenderingContext2D | null;
  private readonly beamCanvas: HTMLCanvasElement;
  private readonly beamContext: CanvasRenderingContext2D | null;
  private beamPixels?: ImageData;
  private beamIdentity = "";
  private readonly beamProfiles = new Map<boolean, Float32Array>();
  private readonly beamBaseColors = new Map<boolean, Uint8Array>();
  private beamX = new Float64Array(0);
  private beamEdgeY = new Float64Array(0);
  private beamSkinRanges = new Int32Array(0);
  private maskPixels?: ImageData;
  private maskThresholds = new Float32Array(0);
  private readonly masks = new Map<number, string>();
  private readonly grains: Grain[] = [];
  private maskWidth = 0;
  private maskHeight = 0;
  private pixelRatio = 1;
  private width = 0;
  private height = 0;
  private empty = true;
  private renderedFrames = 0;
  private generatedMasks = 0;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "carrier-optical-field";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;visibility:hidden;";
    this.context = this.canvas.getContext("2d", { alpha: true });
    this.maskCanvas = document.createElement("canvas");
    this.maskContext = this.maskCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
    this.beamCanvas = document.createElement("canvas");
    this.beamContext = this.beamCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
    container.append(this.canvas);
    // An irregular stratified distribution avoids both clusters and a visible
    // regular lattice. Only grains near the active front are ever painted.
    for (let y = 0; y < 18; y++) for (let x = 0; x < 32; x++) {
      const seed = noise(x, y, 73991);
      const u = (x + .12 + noise(x, y, 21917) * .76) / 32;
      const v = (y + .12 + noise(x, y, 91277) * .76) / 18;
      this.grains.push({ u, v, seed, size: .35 + seed * .7, field: depositField(u, v, seed) });
    }
  }

  render(input: CarrierOpticsInput): CarrierOpticsSurface {
    const { frame } = input;
    const channels = frame as OpticalFrame & OpticalChannels;
    const reveal = clamp(channels.contentResolve ?? frame.reveal);
    const clarity = input.reduced ? 1 : range(reveal, .015, .16);
    const maskImage = input.reduced ? "none" : this.mask(reveal, input.planeWidth ?? input.width, input.planeHeight ?? input.height);
    const sourcePower = clamp(channels.sourcePower ?? frame.charge * frame.emitter * frame.light);
    const beamPower = clamp(channels.beamPower ?? frame.light);
    const platePresence = clamp(channels.platePresence ?? frame.frame * range(frame.image, 0, .18));
    const edgePresence = clamp(channels.edgePresence ?? frame.frame);
    const frameBuild = clamp(channels.frameBuild ?? frame.frame);
    const active = !input.reduced && Math.max(sourcePower, beamPower, platePresence, edgePresence) > .0005 && frame.progress > 0 && frame.progress < 1 && input.width > 0 && input.height > 0;
    const result: CarrierOpticsSurface = { maskImage, maskSize: "100% 100%", maskRepeat: "no-repeat", clarity, active };
    if (!active || !this.context) { this.clear(); return result; }
    this.resize(input.width, input.height);
    const ctx = this.context;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    this.canvas.style.visibility = "visible";
    this.empty = false;
    this.renderedFrames++;

    const quad = frame.corners as unknown as Quad;
    const project = quadProjector(quad);
    const aperture = input.aperture ?? this.legacyAperture(input.origin, input.edge);
    const source = centreOf(aperture);
    const dark = Boolean(input.dark);
    // A glass lip sits four final-document pixels outside the receiving face.
    // It follows the same homography and exits through the viewport naturally;
    // neither the semantic DOM plane nor the beam endpoint is expanded.
    const outU = 4 / Math.max(1, input.planeWidth ?? input.width);
    const outV = 4 / Math.max(1, input.planeHeight ?? input.height);
    const rim: Quad = [project(-outU, -outV), project(1 + outU, -outV),
      project(1 + outU, 1 + outV), project(-outU, 1 + outV)];

    this.volume(ctx, aperture, quad, frame.beamReach, beamPower, dark, input.outline);
    this.plate(ctx, project, quad, rim, source, frameBuild, platePresence, edgePresence, dark);
    this.deposition(ctx, project, reveal, platePresence, dark);
    this.aperture(ctx, aperture, sourcePower, dark);
    return result;
  }

  private resize(width: number, height: number) {
    const ratio = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1), Math.sqrt(2400000 / Math.max(1, width * height)));
    if (this.width === width && this.height === height && this.pixelRatio === ratio) return;
    this.width = width; this.height = height; this.pixelRatio = ratio;
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
  }

  private path(ctx: CanvasRenderingContext2D, points: readonly Point[], close = true) {
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    if (close) ctx.closePath();
  }

  private legacyAperture(origin: Point, edge?: readonly [Point, Point]): Quad {
    const [a, b] = edge ?? [{ x: origin.x - 22, y: origin.y }, { x: origin.x + 22, y: origin.y }];
    const length = Math.max(1, distance(a, b)), depth = clamp(length * .16, 3, 8);
    const nx = -(b.y - a.y) / length * depth, ny = (b.x - a.x) / length * depth;
    return [{ x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny },
      { x: b.x + nx, y: b.y + ny }, { x: a.x + nx, y: a.y + ny }];
  }

  private volume(ctx: CanvasRenderingContext2D, aperture: Quad, quad: Quad, reach: number, power: number, dark: boolean, outline?: readonly Point[]) {
    if (power < .001 || reach < .001) return;
    // Every aperture corner has a corresponding receiver corner. The expanding
    // section is a real rectangle in projection, never a point-source triangle.
    const end = aperture.map((p, i) => mix(p, quad[i], clamp(reach)));
    this.finiteVolume(ctx, aperture, end, power, dark, outline);
  }

  /** Rasterize the projected frustum's finite silhouette, not an unbounded
   * Gaussian. A 2–4px density shoulder softens its edges without losing the
   * geometry. The working bitmap is reused and never encoded as a data URL. */
  private finiteVolume(ctx: CanvasRenderingContext2D, aperture: Quad, end: readonly Point[], power: number, dark: boolean, outline?: readonly Point[]) {
    if (!this.beamContext) return;
    const hull = convexHull([...aperture, ...end]);
    if (hull.length < 3) return;
    const source = centreOf(aperture), target = centreOf(end);
    const axisLength = Math.max(1, distance(source, target));
    const ux = (target.x - source.x) / axisLength, uy = (target.y - source.y) / axisLength;
    const px = -uy, py = ux;
    const across = (p: Point) => (p.x - source.x) * px + (p.y - source.y) * py;
    const sourceWidth = Math.max(1.5, ...aperture.map(p => Math.abs(across(p))));
    const endWidth = Math.max(sourceWidth, ...end.map(p => Math.abs(across(p))));
    const left = Math.max(-4, Math.min(...hull.map(p => p.x)) - 4);
    const top = Math.max(-4, Math.min(...hull.map(p => p.y)) - 4);
    const right = Math.min(this.width + 4, Math.max(...hull.map(p => p.x)) + 4);
    const bottom = Math.min(this.height + 4, Math.max(...hull.map(p => p.y)) + 4);
    if (right <= left || bottom <= top) return;
    const width = right - left, height = bottom - top;
    const tw = Math.ceil(clamp(width * .72, 96, 480) / 16) * 16;
    const th = Math.ceil(clamp(tw * height / width, 48, 256) / 16) * 16;
    const identity = [...aperture, ...end, ...(outline ?? [])].flatMap(p => [p.x, p.y])
      .concat([left, top, width, height, Number(dark)]).map(v => v.toFixed(2)).join("/");
    if (identity !== this.beamIdentity) {
      this.beamIdentity = identity;
      if (this.beamCanvas.width !== tw || this.beamCanvas.height !== th || !this.beamPixels) {
        this.beamCanvas.width = tw; this.beamCanvas.height = th;
        this.beamPixels = this.beamContext.createImageData(tw, th);
      }
      const edges = boundaryEquations(hull);
      const skins = hull.flatMap((a, i) => {
        const b = hull[(i + 1) % hull.length];
        // Only the two exterior longitudinal faces receive a grazing skin.
        // The aperture and receiver edges belong to their own materials.
        if (aperture.includes(a) === aperture.includes(b)) return [];
        const from = aperture.includes(a) ? a : b, to = aperture.includes(a) ? b : a;
        const length = Math.max(1, distance(from, to));
        const edge = edges[i], facing = edge[0] * px + edge[1] * py;
        return [{ edge, from, tx: (to.x - from.x) / length, ty: (to.y - from.y) / length,
          length, weight: facing > 0 ? 1 : .56 }];
      });
      const occlusion = outline && outline.length > 2 ? boundaryEquations(convexHull(outline)) : [];
      const profile = this.beamProfile(dark), pixels = this.beamPixels.data;
      const baseColors = this.beamBaseColors.get(dark)!;
      const skinWarm = dark ? [171, 157, 127] : [126, 112, 88];
      const skinWhite = dark ? [248, 242, 220] : [255, 254, 243];
      const occlusionLeft = outline ? Math.min(...outline.map(p => p.x)) - 2 : Infinity;
      const occlusionRight = outline ? Math.max(...outline.map(p => p.x)) + 2 : -Infinity;
      const occlusionTop = outline ? Math.min(...outline.map(p => p.y)) - 2 : Infinity;
      const occlusionBottom = outline ? Math.max(...outline.map(p => p.y)) + 2 : -Infinity;
      if (this.beamX.length !== tw) this.beamX = new Float64Array(tw);
      for (let x = 0; x < tw; x++) this.beamX[x] = left + (x + .5) / tw * width;
      if (this.beamEdgeY.length !== edges.length) this.beamEdgeY = new Float64Array(edges.length);
      if (this.beamSkinRanges.length !== skins.length * 2) this.beamSkinRanges = new Int32Array(skins.length * 2);
      const edgeY = this.beamEdgeY, skinRanges = this.beamSkinRanges;
      const pixelX = (screenX: number) => (screenX - left) * tw / width - .5;
      for (let y = 0; y < th; y++) {
        const sy = top + (y + .5) / th * height;
        let visibleLeft = -Infinity, visibleRight = Infinity, solidLeft = -Infinity, solidRight = Infinity;
        for (let i = 0; i < edges.length; i++) {
          const edge = edges[i]; edgeY[i] = edge[1] * sy;
          const row = edgeY[i] + edge[2], nx = edge[0];
          if (Math.abs(nx) < 1e-12) {
            if (row < -1.5) visibleLeft = Infinity;
            if (row < 2.6) solidLeft = Infinity;
          } else if (nx > 0) {
            visibleLeft = Math.max(visibleLeft, (-1.5 - row) / nx);
            solidLeft = Math.max(solidLeft, (2.6 - row) / nx);
          } else {
            visibleRight = Math.min(visibleRight, (-1.5 - row) / nx);
            solidRight = Math.min(solidRight, (2.6 - row) / nx);
          }
        }
        // Conservative scanline intervals skip only provably empty pixels or
        // fully interior distances. Border pixels retain the original math;
        // extra one-pixel margins protect the identical raster at every angle.
        const first = Math.min(tw, Math.max(0, Math.floor(pixelX(visibleLeft)) - 1));
        const last = Math.max(0, Math.min(tw, Math.ceil(pixelX(visibleRight)) + 2));
        const solidFirst = Math.ceil(pixelX(solidLeft)) + 1, solidLast = Math.floor(pixelX(solidRight)) - 1;
        const rowStart = y * tw * 4;
        for (let x = 0; x < first; x++) pixels[rowStart + x * 4 + 3] = 0;
        for (let x = Math.max(first, last); x < tw; x++) pixels[rowStart + x * 4 + 3] = 0;
        for (let i = 0; i < skins.length; i++) {
          const skin = skins[i], nx = skin.edge[0], row = skin.edge[1] * sy + skin.edge[2];
          let from = -Infinity, to = Infinity;
          if (Math.abs(nx) < 1e-12) { if (row < 0 || row >= 24) from = Infinity; }
          else { const a = -row / nx, b = (24 - row) / nx; from = Math.min(a, b); to = Math.max(a, b); }
          const alongRow = (sy - skin.from.y) * skin.ty - skin.from.x * skin.tx;
          if (Math.abs(skin.tx) < 1e-12) { if (alongRow <= 0 || alongRow >= skin.length) from = Infinity; }
          else {
            const a = -alongRow / skin.tx, b = (skin.length - alongRow) / skin.tx;
            from = Math.max(from, Math.min(a, b)); to = Math.min(to, Math.max(a, b));
          }
          skinRanges[i * 2] = Math.min(tw, Math.max(0, Math.floor(pixelX(from)) - 1));
          skinRanges[i * 2 + 1] = Math.max(0, Math.min(tw, Math.ceil(pixelX(to)) + 2));
        }
        for (let x = first; x < last; x++) {
        const sx = this.beamX[x];
        const j = (y * tw + x) * 4;
        let boundary = Infinity;
        const solid = x >= solidFirst && x <= solidLast;
        if (!solid) for (let i = 0; i < edges.length; i++) {
          const edge = edges[i], d = edge[0] * sx + edgeY[i] + edge[2];
          if (d < boundary) boundary = d;
          if (boundary < -1.5) break;
        }
        if (boundary < -1.5) { pixels[j + 3] = 0; continue; }
        let covered = occlusion.length > 0 && sx >= occlusionLeft && sx <= occlusionRight && sy >= occlusionTop && sy <= occlusionBottom;
        if (covered) for (let i = 0; i < occlusion.length; i++) {
          const edge = occlusion[i];
          if (edge[0] * sx + edge[1] * sy + edge[2] < -.4) { covered = false; break; }
        }
        if (covered) { pixels[j + 3] = 0; continue; }
        const dx = sx - source.x, dy = sy - source.y;
        const travel = clamp((dx * ux + dy * uy) / axisLength);
        const halfWidth = sourceWidth + (endWidth - sourceWidth) * travel;
        const q = (dx * px + dy * py) / Math.max(1, halfWidth);
        const k = Math.round(clamp((q + 1.4) / 2.8) * 2047) * 4;
        const finiteEdge = solid ? 1 : smooth((boundary + 1.1) / 3.7);
        // Energy reaches the receiving face. Fading before the endpoint would
        // detach the frame from the apparatus that is generating it.
        const density = finiteEdge * (1 - .32 * travel);
        let warmSkin = 0, whiteSkin = 0;
        for (let i = 0; i < skins.length; i++) {
          if (x < skinRanges[i * 2] || x >= skinRanges[i * 2 + 1]) continue;
          const skin = skins[i];
          const d = skin.edge[0] * sx + skin.edge[1] * sy + skin.edge[2];
          if (d < 0 || d >= 24) continue;
          const position = ((sx - skin.from.x) * skin.tx + (sy - skin.from.y) * skin.ty) / skin.length;
          if (position <= 0 || position >= 1) continue;
          const index = Math.round(d / 24 * 255) * 2;
          const falloff = range(position, 0, .045) * (1 - range(position, .975, 1));
          const weight = skin.weight * falloff * (.74 + .26 * Math.sin(Math.PI * position));
          warmSkin += BEAM_SKIN[index] * weight;
          whiteSkin += BEAM_SKIN[index + 1] * weight;
        }
        const warmAlpha = warmSkin * finiteEdge * (dark ? .13 : .21);
        const whiteAlpha = whiteSkin * finiteEdge * (dark ? .23 : .36);
        const baseAlpha = profile[k + 3] * density;
        const alpha = 1 - (1 - baseAlpha) * (1 - warmAlpha) * (1 - whiteAlpha);
        if (warmAlpha === 0 && whiteAlpha === 0 && alpha > 1e-8) {
          // Most pixels contain only the volume. Their RGB is independent of
          // density; avoid re-compositing and dividing the same color per frame.
          pixels[j] = baseColors[k]; pixels[j + 1] = baseColors[k + 1]; pixels[j + 2] = baseColors[k + 2];
        } else for (let channel = 0; channel < 3; channel++) {
            pixels[j + channel] = Math.round((profile[k + channel] * baseAlpha * (1 - warmAlpha) * (1 - whiteAlpha)
              + skinWarm[channel] * warmAlpha * (1 - whiteAlpha) + skinWhite[channel] * whiteAlpha) / Math.max(1e-8, alpha));
        }
        pixels[j + 3] = Math.round(255 * alpha);
        }
      }
      this.beamContext.putImageData(this.beamPixels, 0, 0);
    }
    ctx.save(); ctx.globalAlpha = power; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.beamCanvas, left, top, width, height); ctx.restore();
  }

  private beamProfile(dark: boolean) {
    const cached = this.beamProfiles.get(dark);
    if (cached) return cached;
    const result = new Float32Array(2048 * 4);
    const colors = new Uint8Array(2048 * 4);
    const white = dark ? [239, 237, 222] : [255, 254, 243];
    const warm = dark ? [168, 159, 133] : [128, 117, 95];
    for (let i = 0; i < 2048; i++) {
      const q = i / 2047 * 2.8 - 1.4;
      const core = (1 - smooth(Math.abs(q + .10) / .88)) * (dark ? .20 : .28);
      const side = Math.exp(-Math.pow((q - .66) / .22, 2)) * (dark ? .065 : .105);
      const body = (1 - smooth((Math.abs(q) - .78) / .40)) * (dark ? .047 : .033);
      const density = core + side + body;
      const absorption = (side + body * .70) / Math.max(1e-8, density);
      for (let c = 0; c < 3; c++) {
        result[i * 4 + c] = white[c] * (1 - absorption) + warm[c] * absorption;
        colors[i * 4 + c] = Math.round(result[i * 4 + c]);
      }
      result[i * 4 + 3] = density;
    }
    this.beamBaseColors.set(dark, colors);
    this.beamProfiles.set(dark, result); return result;
  }

  private plate(ctx: CanvasRenderingContext2D, project: (u: number, v: number) => Point, quad: Quad, rim: Quad, source: Point, build: number, presence: number, edgePresence: number, dark: boolean) {
    if (Math.max(presence, edgePresence) < .001 || build < .001) return;
    const [a, b, c, d] = quad, centre = project(.5, .5);
    const white = dark ? [245, 243, 229] : [255, 255, 249];
    const warm = dark ? [168, 158, 134] : [100, 90, 71];
    const body = presence * range(build, .66, 1);
    if (body > .001) {
      ctx.save(); this.path(ctx, quad); ctx.clip();
      // The receiver is defined by its cut edges. Its interior stays almost
      // clear so neither a milky rectangle nor a sheet of fog covers the data.
      const face = ctx.createLinearGradient(d.x, d.y, b.x, b.y);
      face.addColorStop(0, rgba(warm, body * (dark ? .045 : .038)));
      face.addColorStop(.10, rgba(warm, body * .012));
      face.addColorStop(.46, rgba(white, body * .003));
      face.addColorStop(1, rgba(white, body * .018));
      ctx.fillStyle = face; this.path(ctx, quad); ctx.fill(); ctx.restore();
    }
    let near = 0;
    for (let i = 1; i < 4; i++) if (distance(source, rim[i]) < distance(source, rim[near])) near = i;
    const cut = clamp(distance(a, b) * .0045, 1.5, 3);
    // Two fronts leave the near corner and meet at the opposite corner. They
    // build the actual four edges; no detached brackets or looping scanner.
    for (const direction of [1, -1]) {
      const indices = [near, (near + direction + 4) % 4, (near + direction * 2 + 4) % 4];
      const lengths = [distance(rim[indices[0]], rim[indices[1]]), distance(rim[indices[1]], rim[indices[2]])];
      let remaining = build * (lengths[0] + lengths[1]);
      for (let segment = 0; segment < 2; segment++) {
        if (remaining <= 0) break;
        const fraction = clamp(remaining / Math.max(.001, lengths[segment]));
        const from = rim[indices[segment]], to = mix(from, rim[indices[segment + 1]], fraction);
        const edgeIndex = direction === 1 ? indices[segment] : indices[segment + 1];
        const primary = segment === 0;
        this.frameEdge(ctx, from, to, centre, cut * (primary ? 1 : .66), edgePresence, primary, edgeIndex, dark);
        remaining -= lengths[segment];
        if (fraction < 1 && build < .995) {
          ctx.fillStyle = rgba(white, edgePresence * .85);
          ctx.beginPath(); ctx.arc(to.x, to.y, .9, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = rgba(white, edgePresence * .10);
          ctx.beginPath(); ctx.arc(to.x, to.y, 2.8, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  private frameEdge(ctx: CanvasRenderingContext2D, from: Point, to: Point, centre: Point, cut: number, power: number, primary: boolean, edgeIndex: number, dark: boolean) {
    const length = Math.max(.001, distance(from, to));
    let nx = -(to.y - from.y) / length, ny = (to.x - from.x) / length;
    const middle = mix(from, to, .5);
    if ((centre.x - middle.x) * nx + (centre.y - middle.y) * ny < 0) { nx = -nx; ny = -ny; }
    const innerA = { x: from.x + nx * cut, y: from.y + ny * cut };
    const innerB = { x: to.x + nx * cut, y: to.y + ny * cut };
    const white = dark ? [249, 246, 231] : [255, 255, 249];
    const absorption = dark ? [173, 156, 125] : [109, 94, 69];
    const cool = dark ? [145, 158, 154] : [120, 123, 113];
    const edgeLight = edgeIndex === 0 ? 1 : edgeIndex === 3 ? .88 : .66;
    ctx.save(); ctx.lineCap = "butt"; ctx.lineJoin = "bevel";
    // Finite bevel: a warm absorbing inner cut beside a narrow white surface.
    // The far edges remain continuous and legible on an ordinary white page.
    const bevel = ctx.createLinearGradient(from.x, from.y, innerA.x, innerA.y);
    bevel.addColorStop(0, rgba(white, power * (primary ? .22 : .14)));
    bevel.addColorStop(.43, rgba(absorption, power * (dark ? .21 : .25)));
    bevel.addColorStop(1, rgba(dark ? cool : absorption, power * (primary ? .38 : .26)));
    ctx.fillStyle = bevel; this.path(ctx, [from, to, innerB, innerA]); ctx.fill();
    ctx.lineWidth = .8; ctx.strokeStyle = rgba(absorption, power * (dark ? .35 : .48));
    this.path(ctx, [innerA, innerB], false); ctx.stroke();
    ctx.lineWidth = primary ? 1.1 : .8;
    ctx.strokeStyle = rgba(white, power * edgeLight * (primary ? .92 : .67));
    this.path(ctx, [from, to], false); ctx.stroke();
    if (primary) {
      ctx.lineWidth = 4.2; ctx.strokeStyle = rgba(white, power * .045);
      this.path(ctx, [from, to], false); ctx.stroke();
    }
    ctx.restore();
  }

  private deposition(ctx: CanvasRenderingContext2D, project: (u: number, v: number) => Point, reveal: number, presence: number, dark: boolean) {
    if (reveal <= 0 || reveal >= 1 || presence < .001) return;
    const energy = Math.sin(Math.PI * reveal) * presence;
    const frontier = (u: number) => {
      if (reveal < depositField(u, 0, .5) || reveal > depositField(u, 1, .5)) return null;
      let low = 0, high = 1;
      for (let step = 0; step < 9; step++) {
        const v = (low + high) / 2;
        if (depositField(u, v, .5) > reveal) high = v; else low = v;
      }
      return (low + high) / 2;
    };
    // The real masked content carries the event. A few short, quiet facets are
    // confined to that same exposure front and disappear as soon as it passes.
    for (let i = 1; i < 72; i++) {
      const seed = noise(i, 14, 77261);
      if (seed < .68) continue;
      const u = i / 72, v = frontier(u);
      if (v === null) continue;
      const du = (.14 + seed * .20) / 72, v2 = frontier(Math.min(1, u + du));
      if (v2 === null) continue;
      const p = project(u, v), q = project(u + du, v2);
      ctx.strokeStyle = rgba(dark ? [235, 225, 199] : [143, 122, 87], energy * (.16 + seed * .17));
      ctx.lineWidth = .65; this.path(ctx, [p, q], false); ctx.stroke();
    }
    for (const grain of this.grains) {
      if (grain.seed < .78) continue;
      const relative = (reveal - grain.field) / .035;
      if (relative < -1 || relative > 1) continue;
      const envelope = 1 - Math.abs(relative), p = project(grain.u, grain.v);
      ctx.fillStyle = rgba(dark ? [248, 237, 209] : [134, 116, 82], energy * envelope * .32);
      ctx.beginPath(); ctx.arc(p.x, p.y, grain.size * .52, 0, Math.PI * 2); ctx.fill();
    }
  }

  private aperture(ctx: CanvasRenderingContext2D, aperture: Quad, power: number, dark: boolean) {
    if (power < .001) return;
    const centre = centreOf(aperture), [a, b, c, d] = aperture;
    const width = Math.max(2, (distance(a, b) + distance(d, c)) / 2);
    const height = Math.max(2, (distance(a, d) + distance(b, c)) / 2);
    const white = dark ? [255, 247, 222] : [255, 253, 239];
    const warm = dark ? [205, 176, 127] : [172, 133, 81];
    ctx.save(); ctx.translate(centre.x, centre.y);
    ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
    ctx.scale(width * .72, Math.max(height * .88, 6));
    const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    bloom.addColorStop(0, rgba(white, power * .30));
    bloom.addColorStop(.38, rgba(warm, power * .11));
    bloom.addColorStop(1, rgba(warm, 0));
    ctx.fillStyle = bloom; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    // These are emitted light layers on the supplied physical glass aperture.
    // Its dark recess, housing and thickness remain owned by the scene model.
    ctx.save(); this.path(ctx, aperture); ctx.clip();
    const face = ctx.createLinearGradient(a.x, a.y, c.x, c.y);
    face.addColorStop(0, rgba(white, power * .25));
    face.addColorStop(.42, rgba(white, power * .12));
    face.addColorStop(1, rgba(warm, power * .075));
    ctx.fillStyle = face; this.path(ctx, aperture); ctx.fill();
    const lens = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, width * .36);
    lens.addColorStop(0, rgba(white, power * .24)); lens.addColorStop(1, rgba(white, 0));
    ctx.fillStyle = lens; this.path(ctx, aperture); ctx.fill(); ctx.restore();
    ctx.lineWidth = .8; ctx.strokeStyle = rgba(white, power * .76);
    this.path(ctx, aperture); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(warm, power * .38);
    this.path(ctx, [d, c], false); ctx.stroke();
  }

  private mask(reveal: number, planeWidth: number, planeHeight: number) {
    if (reveal >= .999) return "none";
    if (reveal <= .0001) return CLEAR_MASK;
    if (!this.maskContext) {
      // Canvas is optional. The fallback still has a softened physical front,
      // while the actual semantic content remains owned by the existing DOM.
      const edge = clamp(reveal * 112 - 6, 0, 100);
      return `linear-gradient(25deg,#000 ${edge}%,transparent ${edge + 12}%)`;
    }
    const aspect = Math.max(.25, planeWidth / Math.max(1, planeHeight));
    const width = Math.round(clamp(416 * Math.sqrt(aspect / 1.8), 256, 512) / 16) * 16;
    const height = Math.round(clamp(width / aspect, 144, 384) / 16) * 16;
    if (this.maskWidth !== width || this.maskHeight !== height) {
      this.maskWidth = this.maskCanvas.width = width;
      this.maskHeight = this.maskCanvas.height = height;
      this.maskPixels = this.maskContext.createImageData(width, height);
      this.maskThresholds = new Float32Array(width * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        this.maskThresholds[y * width + x] = depositField(x / Math.max(1, width - 1), y / Math.max(1, height - 1), noise(x, y, 11897));
      }
      this.masks.clear();
    }
    const bucket = Math.round(reveal * 160);
    const existing = this.masks.get(bucket);
    if (existing) { this.masks.delete(bucket); this.masks.set(bucket, existing); return existing; }
    const pixels = this.maskPixels!.data;
    const phase = bucket / 160;
    for (let i = 0; i < this.maskThresholds.length; i++) {
      const a = smooth((phase - this.maskThresholds[i] + .018) / .036);
      const j = i * 4;
      pixels[j] = pixels[j + 1] = pixels[j + 2] = 255;
      pixels[j + 3] = Math.round(255 * a);
    }
    this.maskContext.putImageData(this.maskPixels!, 0, 0);
    const image = `url("${this.maskCanvas.toDataURL("image/png")}")`;
    this.generatedMasks++;
    this.masks.set(bucket, image);
    // Bounded cache is enough for interruption/reversal; no full-window bitmap
    // is serialized. Stable/open frames bypass the mask canvas entirely.
    while (this.masks.size > 24) this.masks.delete(this.masks.keys().next().value!);
    return image;
  }

  private clear() {
    if (!this.empty && this.context) {
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.empty = true;
    this.canvas.style.visibility = "hidden";
  }

  getStats() {
    return { renderedFrames: this.renderedFrames, generatedMasks: this.generatedMasks, maskSize: [this.maskWidth, this.maskHeight], maskCacheEntries: this.masks.size, canvasSize: [this.canvas.width, this.canvas.height], active: !this.empty };
  }

  dispose() {
    this.clear(); this.canvas.remove(); this.masks.clear();
    this.maskThresholds = new Float32Array(0); this.maskPixels = undefined;
    this.maskCanvas.width = this.maskCanvas.height = 0;
    this.beamCanvas.width = this.beamCanvas.height = 0;
    this.beamPixels = undefined; this.beamIdentity = ""; this.beamProfiles.clear(); this.beamBaseColors.clear();
    this.beamX = new Float64Array(0);
    this.beamEdgeY = new Float64Array(0); this.beamSkinRanges = new Int32Array(0);
    this.canvas.width = this.canvas.height = 0;
  }
}
