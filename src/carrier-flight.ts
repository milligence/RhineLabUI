/** The optical image has a source, a held projection plane and a camera transfer.
 * This timeline is shared by research and experiment archives. All coordinates
 * are viewport pixels; no archive geometry is moved to achieve the framing. */
export type OpticalPoint = { x: number; y: number };
export type CarrierSample = { origin: OpticalPoint; edge?: [OpticalPoint, OpticalPoint] };
export type FlightBox = { left: number; top: number; width: number; height: number };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * t * (t * (t * 6 - 15) + 10); };
const between = (v: number, a: number, b: number) => smooth((v - a) / (b - a));

/** A quintic segment retains position, velocity and acceleration when reversed.
 * A rapid close therefore first brakes the moving image rather than teleporting
 * it to a separate exit pose. Time is in milliseconds, derivatives per ms. */
export class CarrierFlight {
  value = 0;
  velocity = 0;
  acceleration = 0;
  target = 0;
  private start = 0;
  private duration = 0;
  private coefficients = [0, 0, 0, 0, 0, 0];
  active = false;
  jump(value: number) {
    this.value = this.target = value;
    this.velocity = this.acceleration = 0;
    this.active = false;
  }
  move(target: number, now: number, duration: number) {
    this.step(now);
    const delta = target - this.value;
    const v = this.velocity * duration, a = this.acceleration * duration * duration;
    this.coefficients = [this.value, v, a / 2,
      10 * delta - 6 * v - 1.5 * a,
      -15 * delta + 8 * v + 1.5 * a,
      6 * delta - 3 * v - .5 * a];
    this.start = now; this.duration = Math.max(1, duration); this.target = target; this.active = true;
  }
  step(now: number) {
    if (!this.active) return this.value;
    const t = clamp((now - this.start) / this.duration), c = this.coefficients;
    this.value = c[0] + t * (c[1] + t * (c[2] + t * (c[3] + t * (c[4] + t * c[5]))));
    this.velocity = (c[1] + t * (2*c[2] + t * (3*c[3] + t * (4*c[4] + t * 5*c[5])))) / this.duration;
    this.acceleration = (2*c[2] + t * (6*c[3] + t * (12*c[4] + t * 20*c[5]))) / (this.duration * this.duration);
    if (t === 1) this.jump(this.target);
    return this.value;
  }
}

export function carrierFrame(progress: number, viewport: { width: number; height: number }, box: FlightBox) {
  const p = clamp(progress), mobile = viewport.width < 760;
  const camera = between(p, .50, .98);
  const growth = between(p, .12, .32);
  const scale = (.30 + .12 * growth) * (1 - camera) + camera;
  const tx = (viewport.width * (mobile ? .53 : .67) - box.left - box.width / 2) * (1 - camera);
  const ty = (viewport.height * (mobile ? .30 : .34) - box.top - box.height / 2) * (1 - camera);
  const z = -140 * (1 - camera);
  const rx = 11 * (1 - camera), ry = -18 * (1 - camera);
  const perspective = 1400;
  const ax = rx * Math.PI / 180, ay = ry * Math.PI / 180;
  const project = (x: number, y: number): OpticalPoint => {
    const u = (x - box.width / 2) * scale, v = (y - box.height / 2) * scale;
    const vy = v * Math.cos(ax), vz = v * Math.sin(ax);
    const px = u * Math.cos(ay) + vz * Math.sin(ay) + tx;
    const pz = -u * Math.sin(ay) + vz * Math.cos(ay) + z;
    const d = perspective / (perspective - pz);
    return { x: box.left + box.width / 2 + px * d, y: box.top + box.height / 2 + (vy + ty) * d };
  };
  const corners = [project(0,0), project(box.width,0), project(box.width,box.height), project(0,box.height)];
  return {
    progress: p, camera,
    beat: p < .15 ? "ignition" : p < .50 ? "image-formed" : p < .98 ? "camera-transfer" : "settling",
    environment: between(p, .66, .98),
    image: between(p, .13, .24),
    header: between(p, .94, 1),
    light: between(p, 0, .15) * (1 - between(p, .84, .98)),
    emitter: between(p, 0, .1) * (1 - between(p, .82, .98)),
    rayLength: between(p, .045, .25),
    frame: between(p, .12, .30) * (1 - between(p, .89, .99)),
    transform: "perspective(" + perspective + "px) translate3d(" + tx.toFixed(3) + "px," + ty.toFixed(3) + "px," + z.toFixed(3) + "px) rotateY(" + ry.toFixed(3) + "deg) rotateX(" + rx.toFixed(3) + "deg) scale(" + scale.toFixed(6) + ")",
    corners,
  };
}
