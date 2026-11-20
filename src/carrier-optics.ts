import type { carrierFrame, OpticalPoint } from "./carrier-flight";

type Point = OpticalPoint;
type Quad = readonly [Point, Point, Point, Point];
type OpticalFrame = ReturnType<typeof carrierFrame>;

export type CarrierOpticsInput = {
  frame: OpticalFrame;
  origin: Point;
  /** The two ends of the aperture on the actual, already-drawn carrier. */
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

/** Integer noise is spatial, never time-seeded. A return retraces the same
 * deposit instead of making a new cloud of unrelated particles. */
function noise(x: number, y: number, salt = 0) {
  let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ salt;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/** The advancing field runs from the near lower-left region into the depth of
 * the plate. Broad variations are coherent; the last term is subpixel deposit,
 * not a coarse grid of independently appearing rectangles. */
function depositField(u: number, v: number, grain: number) {
  const travel = .57 * (1 - v) + .43 * u;
  const wave = Math.sin(u * 8.7 + v * 3.1) * .022 + Math.sin(v * 15.3 - u * 4.8) * .012;
  return clamp(.035 + travel * .91 + wave + (grain - .5) * .066, .012, .978);
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
    const reveal = clamp(frame.reveal);
    const clarity = input.reduced ? 1 : range(frame.progress, .30, .68);
    const maskImage = input.reduced ? "none" : this.mask(reveal, input.planeWidth ?? input.width, input.planeHeight ?? input.height);
    const active = !input.reduced && frame.light > .0005 && frame.progress > 0 && input.width > 0 && input.height > 0;
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
    const centre = project(.5, .5);
    const edge = input.edge ?? [{ x: input.origin.x - 22, y: input.origin.y }, { x: input.origin.x + 22, y: input.origin.y }];
    const aperture: [Point, Point] = [mix(input.origin, edge[0], frame.charge), mix(input.origin, edge[1], frame.charge)];
    const light = frame.light;
    const dark = Boolean(input.dark);

    this.volume(ctx, input.origin, aperture, quad, centre, frame, light, dark);
    this.plate(ctx, project, quad, frame, light, dark);
    this.deposition(ctx, input.origin, project, frame, light, dark);
    this.aperture(ctx, input.origin, aperture, frame, light, dark);
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

  private volume(ctx: CanvasRenderingContext2D, origin: Point, edge: readonly [Point, Point], quad: Quad, centre: Point, f: OpticalFrame, light: number, dark: boolean) {
    const reach = f.beamReach;
    if (reach <= .001) return;
    const tip = mix(origin, centre, reach);
    const end = quad.map(p => ({ x: tip.x + (p.x - centre.x) * reach * f.beamSpread, y: tip.y + (p.y - centre.y) * reach * f.beamSpread }));
    this.softVolume(ctx, origin, edge, end, tip, light * reach, dark);
    // Fine forward scattering stays within the cone. Stable positions avoid
    // sparkle and do not invent a second independent motion clock.
    const formation = Math.sin(Math.PI * clamp(f.reveal)) * light;
    if (formation < .01) return;
    for (let i = 0; i < 42; i++) {
      const a = noise(i, 3, 71211), b = noise(i, 9, 19411);
      const travel = .25 + a * .67;
      const target = mix(end[3], end[1], .1 + b * .8);
      const p = mix(origin, target, travel);
      const alpha = formation * (1 - travel) * .22 * (.3 + b * .7);
      ctx.fillStyle = rgba(dark ? [235, 219, 191] : [176, 149, 111], alpha);
      ctx.beginPath(); ctx.arc(p.x, p.y, .35 + b * .35, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** A continuous angular density field replaces nested polygon wedges. The
   * small working texture is painted directly; it is never URL-encoded. Its
   * light core, absorbing shoulders and outer falloff have distinct scales. */
  private softVolume(ctx: CanvasRenderingContext2D, origin: Point, edge: readonly [Point, Point], end: readonly Point[], tip: Point, light: number, dark: boolean) {
    if (!this.beamContext) return;
    const axisLength = Math.max(1, distance(origin, tip));
    const ux = (tip.x - origin.x) / axisLength, uy = (tip.y - origin.y) / axisLength;
    const px = -uy, py = ux;
    const along = (p: Point) => (p.x - origin.x) * ux + (p.y - origin.y) * uy;
    const across = (p: Point) => (p.x - origin.x) * px + (p.y - origin.y) * py;
    const reach = Math.max(8, ...end.map(along));
    const aperture = Math.max(1.2, ...edge.map(p => Math.abs(across(p))));
    const slope = Math.max(.015, ...end.map(p => Math.abs(across(p)) / Math.max(1, along(p))));
    const points = [...edge, ...end];
    const left = Math.min(...points.map(p => p.x)) - 12;
    const top = Math.min(...points.map(p => p.y)) - 12;
    const width = Math.max(...points.map(p => p.x)) - left + 12;
    const height = Math.max(...points.map(p => p.y)) - top + 12;
    const tw = Math.ceil(clamp(width * .55, 96, 480) / 16) * 16;
    const th = Math.ceil(clamp(tw * height / width, 48, 256) / 16) * 16;
    const identity = [origin.x, origin.y, ...points.flatMap(p => [p.x, p.y]), Number(dark)].map(v => v.toFixed(2)).join("/");
    if (identity !== this.beamIdentity) {
      this.beamIdentity = identity;
      if (this.beamCanvas.width !== tw || this.beamCanvas.height !== th || !this.beamPixels) {
        this.beamCanvas.width = tw; this.beamCanvas.height = th;
        this.beamPixels = this.beamContext.createImageData(tw, th);
      }
      const pixels = this.beamPixels.data;
      const profile = this.beamProfile(dark);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const dx = left + (x + .5) / tw * width - origin.x;
        const dy = top + (y + .5) / th * height - origin.y;
        const travel = dx * ux + dy * uy;
        const t = travel / reach;
        const j = (y * tw + x) * 4;
        if (t <= -.02 || t >= 1.06) { pixels[j + 3] = 0; continue; }
        const halfWidth = aperture + Math.max(0, travel) * slope;
        const q = (dx * px + dy * py) / halfWidth;
        const k = Math.round(clamp((q + 1.6) / 3.2) * 2047) * 4;
        const lengthFade = range(t, -.02, .018) * (1 - range(t, .82, 1.06)) * (1 - .56 * clamp(t));
        pixels[j] = Math.round(profile[k]);
        pixels[j + 1] = Math.round(profile[k + 1]);
        pixels[j + 2] = Math.round(profile[k + 2]);
        pixels[j + 3] = Math.round(255 * profile[k + 3] * lengthFade);
      }
      this.beamContext.putImageData(this.beamPixels, 0, 0);
    }
    ctx.save(); ctx.globalAlpha = light;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.beamCanvas, left, top, width, height);
    ctx.restore();
  }

  private beamProfile(dark: boolean) {
    const cached = this.beamProfiles.get(dark);
    if (cached) return cached;
    const result = new Float32Array(2048 * 4);
    const white = dark ? [232, 223, 203] : [255, 253, 240];
    const warm = dark ? [184, 154, 108] : [151, 128, 95];
    // Evaluate the costly scattering lobes once per palette, rather than
    // repeatedly for every working-texture pixel while the camera is moving.
    for (let i = 0; i < 2048; i++) {
      const q = i / 2047 * 3.2 - 1.6;
      const core = Math.exp(-Math.pow((q + .045) / .205, 2)) * (dark ? .20 : .36);
      const shoulder = Math.exp(-Math.pow((Math.abs(q + .045) - .34) / .245, 2)) * (dark ? .038 : .072);
      const air = Math.exp(-Math.pow(q / .72, 4)) * (dark ? .012 : .015);
      const density = core + shoulder + air;
      const warmAmount = (shoulder + air) / Math.max(1e-8, density);
      for (let c = 0; c < 3; c++) result[i * 4 + c] = white[c] * (1 - warmAmount) + warm[c] * warmAmount;
      result[i * 4 + 3] = density;
    }
    this.beamProfiles.set(dark, result);
    return result;
  }

  private plate(ctx: CanvasRenderingContext2D, project: (u: number, v: number) => Point, quad: Quad, f: OpticalFrame, light: number, dark: boolean) {
    // The real scene must first clear the plate. Frame construction can lead
    // image formation, so it is not by itself a safe material-visibility gate.
    const body = f.frame * light * range(f.image, 0, .18);
    if (body < .001) return;
    const [a, b, c, d] = quad;
    const cream = dark ? [212, 218, 208] : [255, 253, 247];
    const tint = dark ? [42, 57, 60] : [164, 153, 133];
    ctx.save(); this.path(ctx, quad); ctx.clip();
    // The plate has a clear face and a denser grazing shoulder. It stays thin
    // and open; no second rectangle or opaque panel sits on top of the UI.
    const face = ctx.createLinearGradient(d.x, d.y, b.x, b.y);
    face.addColorStop(0, rgba(tint, body * (dark ? .12 : .085)));
    face.addColorStop(.28, rgba(cream, body * .018));
    face.addColorStop(.72, rgba(cream, body * (dark ? .045 : .04)));
    face.addColorStop(1, rgba(cream, body * .075));
    ctx.fillStyle = face; this.path(ctx, quad); ctx.fill();

    // A finite oblique reflection condenses in the coating. Both ends dissolve
    // as well as its shoulders; a uniform edge-to-edge stripe reads as a decal.
    const reflect = Math.sin(Math.PI * range(f.progress, .105, .40)) * body;
    if (reflect > .002) {
      const band = .84 - .50 * f.reveal;
      const lo = project(.08 + band * .16, .12), hi = project(.79 + band * .10, .86);
      const centre = mix(lo, hi, .49);
      const length = distance(lo, hi);
      const breadth = Math.max(4, distance(a, b) * .027);
      ctx.save(); ctx.translate(centre.x, centre.y);
      ctx.rotate(Math.atan2(hi.y - lo.y, hi.x - lo.x));
      ctx.scale(Math.max(1, length * .40), breadth);
      const sheen = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      sheen.addColorStop(0, rgba(cream, reflect * (dark ? .17 : .32)));
      sheen.addColorStop(.20, rgba(cream, reflect * (dark ? .115 : .22)));
      sheen.addColorStop(.58, rgba(cream, reflect * .025));
      sheen.addColorStop(1, rgba(cream, 0));
      ctx.fillStyle = sheen; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }

    // Embedded microstructure is spatially correlated with the deposit field.
    // It resolves into the plate, then disappears before reading begins.
    const texture = body * (1 - range(f.progress, .34, .52));
    for (const grain of this.grains) {
      if (grain.seed < .56 || f.reveal < grain.field) continue;
      const p = project(grain.u, grain.v);
      ctx.fillStyle = rgba(dark ? [224, 226, 214] : [119, 113, 98], texture * .075 * grain.seed);
      ctx.fillRect(p.x, p.y, .48, .48);
    }
    ctx.restore();

    // A polished upper edge and one warm cut edge establish finite thickness.
    // The far and bottom edges dissolve; an enclosing wireframe never appears.
    const shoulder = { x: (d.x - a.x) * .004, y: (d.y - a.y) * .004 };
    const rim = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    rim.addColorStop(0, rgba(cream, 0));
    rim.addColorStop(.15, rgba(cream, body * .80));
    rim.addColorStop(.68, rgba(cream, body * .60));
    rim.addColorStop(1, rgba(cream, 0));
    ctx.lineWidth = 1.05; ctx.strokeStyle = rim;
    this.path(ctx, [a, b], false); ctx.stroke();
    const absorption = ctx.createLinearGradient(a.x, a.y, d.x, d.y);
    absorption.addColorStop(0, rgba(dark ? [199, 171, 124] : [155, 126, 87], body * .38));
    absorption.addColorStop(.58, rgba(dark ? [199, 171, 124] : [155, 126, 87], body * .15));
    absorption.addColorStop(1, rgba(tint, 0));
    ctx.lineWidth = 1.65; ctx.strokeStyle = absorption;
    this.path(ctx, [{ x: a.x + shoulder.x, y: a.y + shoulder.y }, d], false); ctx.stroke();
    // Two tiny seam catches belong to the same cut edge, with no brackets.
    for (const t of [.18, .76]) {
      const p = project(.001, t), q = project(.001, t + .026);
      ctx.strokeStyle = rgba(cream, body * .5); ctx.lineWidth = .7;
      this.path(ctx, [p, q], false); ctx.stroke();
    }
  }

  private deposition(ctx: CanvasRenderingContext2D, origin: Point, project: (u: number, v: number) => Point, f: OpticalFrame, light: number, dark: boolean) {
    if (f.reveal <= 0 || f.reveal >= 1) return;
    const energy = Math.sin(Math.PI * f.reveal) * light;
    // Broken microfacets follow the actual reconstruction contour. The light
    // lives only at this frontier, never as a permanent scanning rule or box.
    const frontier = (u: number) => {
      if (f.reveal > depositField(u, 0, .5) || f.reveal < depositField(u, 1, .5)) return null;
      let low = 0, high = 1;
      for (let step = 0; step < 9; step++) {
        const v = (low + high) / 2;
        if (depositField(u, v, .5) > f.reveal) low = v; else high = v;
      }
      return (low + high) / 2;
    };
    for (let i = 1; i < 96; i++) {
      const seed = noise(i, 14, 77261);
      if (seed < .31) continue;
      const u = i / 96, v = frontier(u);
      if (v === null) continue;
      const du = (.18 + seed * .46) / 96;
      const v2 = frontier(Math.min(1, u + du));
      if (v2 === null) continue;
      const p = project(u, v), q = project(u + du, v2);
      ctx.strokeStyle = rgba(dark ? [231, 218, 187] : [157, 126, 81], energy * (.28 + seed * .28));
      ctx.lineWidth = .7 + seed * .35; this.path(ctx, [p, q], false); ctx.stroke();
      ctx.strokeStyle = rgba(dark ? [255, 245, 218] : [255, 254, 241], energy * (.45 + seed * .4));
      ctx.lineWidth = .65;
      this.path(ctx, [{ x: p.x, y: p.y - .8 }, { x: q.x, y: q.y - .8 }], false); ctx.stroke();
    }
    for (const grain of this.grains) {
      const relative = (f.reveal - grain.field) / .105;
      if (relative < -1 || relative > .65) continue;
      const envelope = Math.sin(Math.PI * clamp((relative + 1) / 1.65));
      const target = project(grain.u, grain.v);
      const length = Math.max(1, distance(origin, target));
      const settle = 1 - range(relative, -.95, .05);
      const lead = settle * (5 + grain.seed * 13);
      const p = { x: target.x - (target.x - origin.x) / length * lead, y: target.y - (target.y - origin.y) / length * lead };
      const tail = mix(p, origin, Math.min(.008, (1 + 3 * settle) / length));
      ctx.strokeStyle = rgba(dark ? [237, 223, 192] : [155, 124, 78], energy * envelope * (.21 + grain.seed * .34));
      ctx.lineWidth = grain.size * (.55 + .45 * envelope);
      this.path(ctx, [tail, p], false); ctx.stroke();
      if (grain.seed > .78) {
        ctx.fillStyle = rgba(dark ? [255, 244, 218] : [255, 252, 239], energy * envelope * .73);
        ctx.beginPath(); ctx.arc(p.x, p.y, grain.size * .65, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  private aperture(ctx: CanvasRenderingContext2D, origin: Point, edge: readonly [Point, Point], f: OpticalFrame, light: number, dark: boolean) {
    const power = f.charge * f.emitter * light;
    if (power < .001) return;
    const span = distance(edge[0], edge[1]);
    const angle = Math.atan2(edge[1].y - edge[0].y, edge[1].x - edge[0].x);
    const warm = dark ? [209, 177, 123] : [191, 146, 83];
    const white = dark ? [255, 243, 211] : [255, 252, 232];
    ctx.save(); ctx.translate(origin.x, origin.y); ctx.rotate(angle);
    const radius = Math.max(18, span * .67);
    ctx.scale(1, .24);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    halo.addColorStop(0, rgba(white, power * .78));
    halo.addColorStop(.14, rgba(warm, power * .31));
    halo.addColorStop(.52, rgba(warm, power * .075));
    halo.addColorStop(1, rgba(warm, 0));
    ctx.fillStyle = halo; ctx.fillRect(-radius, -radius, radius * 2, radius * 2); ctx.restore();

    const slit = ctx.createLinearGradient(edge[0].x, edge[0].y, edge[1].x, edge[1].y);
    slit.addColorStop(0, rgba(warm, 0));
    slit.addColorStop(.2, rgba(warm, power * .47));
    slit.addColorStop(.48, rgba(white, power * .94));
    slit.addColorStop(.78, rgba(warm, power * .31));
    slit.addColorStop(1, rgba(warm, 0));
    ctx.strokeStyle = slit;
    for (const [width, alpha] of [[4.8, .10], [2.4, .20], [.85, 1]]) {
      ctx.lineWidth = width; ctx.globalAlpha = alpha;
      this.path(ctx, edge, false); ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
    this.beamPixels = undefined; this.beamIdentity = ""; this.beamProfiles.clear();
    this.canvas.width = this.canvas.height = 0;
  }
}
