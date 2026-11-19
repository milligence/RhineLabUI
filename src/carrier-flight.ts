/** The optical image has a source, a held projection plane and a camera transfer.
 * This timeline is shared by research and experiment archives. All coordinates
 * are viewport pixels; no archive geometry is moved to achieve the framing. */
export type OpticalPoint = { x: number; y: number };
export type CarrierSample = { origin: OpticalPoint; edge?: [OpticalPoint, OpticalPoint] };
export type FlightBox = { left: number; top: number; width: number; height: number };
export type OpticalVector = { x: number; y: number; z: number };
/** Lens distance in units of the initial vertical field of view. The rendered
 * phase lets the DOM follow the frame actually drawn by the physical scene. */
export type CarrierCameraSample = { perspective: number; progress: number };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * t * (t * (t * 6 - 15) + 10); };
const between = (v: number, a: number, b: number) => smooth((v - a) / (b - a));
const add = (a: OpticalVector, b: OpticalVector): OpticalVector => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const multiply = (a: OpticalVector, k: number): OpticalVector => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const subtract = (a: OpticalVector, b: OpticalVector) => add(a, multiply(b, -1));
const dot = (a: OpticalVector, b: OpticalVector) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: OpticalVector) => Math.hypot(a.x, a.y, a.z);
const normalize = (a: OpticalVector) => multiply(a, 1 / length(a));
const cross = (a: OpticalVector, b: OpticalVector): OpticalVector => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const mix = (a: OpticalVector, b: OpticalVector, t: number) => add(multiply(a, 1 - t), multiply(b, t));
const zero: OpticalVector = { x: 0, y: 0, z: 0 };
const vertical: OpticalVector = { x: 0, y: 1, z: 0 };

function shortArc(a: OpticalVector, b: OpticalVector, t: number) {
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  if (angle < 1e-6) return normalize(mix(a, b, t));
  return add(multiply(a, Math.sin((1 - t) * angle) / Math.sin(angle)), multiply(b, Math.sin(t * angle) / Math.sin(angle)));
}

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
  private segmentTarget = 0;
  private continuation?: { target: number; duration: number };
  active = false;
  jump(value: number) {
    this.value = this.target = value;
    this.velocity = this.acceleration = 0;
    this.continuation = undefined;
    this.active = false;
  }
  move(target: number, now: number, duration: number) {
    this.step(now);
    this.target = target;
    this.continuation = undefined;
    duration = Math.max(1, duration);
    // These are the two nontrivial control points of the quintic's Bezier
    // form. A long reverse segment can otherwise overshoot 0/1, after which
    // clamping the camera phase creates a visible stop and restart.
    const bounded = (time: number) => {
      const b1 = this.value + this.velocity * time / 5;
      const b2 = this.value + 2 * this.velocity * time / 5 + this.acceleration * time * time / 20;
      return b1 >= 0 && b1 <= 1 && b2 >= 0 && b2 <= 1;
    };
    if (!bounded(duration)) {
      let braking = Math.min(260, duration * .25);
      while (!bounded(braking) && braking > .01) braking *= .7;
      const stop = clamp(this.value + this.velocity * braking / 2 + this.acceleration * braking * braking / 12);
      this.continuation = { target, duration: Math.max(350, duration - braking) };
      this.segment(stop, now, braking);
    } else this.segment(target, now, duration);
  }
  private segment(target: number, now: number, duration: number) {
    const delta = target - this.value;
    const v = this.velocity * duration, a = this.acceleration * duration * duration;
    this.coefficients = [this.value, v, a / 2,
      10 * delta - 6 * v - 1.5 * a,
      -15 * delta + 8 * v + 1.5 * a,
      6 * delta - 3 * v - .5 * a];
    this.start = now; this.duration = Math.max(.01, duration); this.segmentTarget = target; this.active = true;
  }
  step(now: number): number {
    if (!this.active) return this.value;
    // Resolve segment boundaries at their own time even when rendering skips
    // frames, so a reversal follows the same path at 30, 60 or 144 Hz.
    if (now >= this.start + this.duration) {
      this.value = this.segmentTarget; this.velocity = this.acceleration = 0;
      const next = this.continuation;
      if (next) {
        this.continuation = undefined;
        this.segment(next.target, this.start + this.duration, next.duration);
        return this.step(now);
      }
      this.active = false;
      return this.value;
    }
    const t = clamp((now - this.start) / this.duration), c = this.coefficients;
    this.value = c[0] + t * (c[1] + t * (c[2] + t * (c[3] + t * (c[4] + t * c[5]))));
    this.velocity = (c[1] + t * (2*c[2] + t * (3*c[3] + t * (4*c[4] + t * 5*c[5])))) / this.duration;
    this.acceleration = (2*c[2] + t * (6*c[3] + t * (12*c[4] + t * 20*c[5]))) / (this.duration * this.duration);
    return this.value;
  }
}

// CarrierFlight already supplies a C2 ease in time. Applying another ease to
// the camera phase would squeeze the whole journey into its middle frames.
export const carrierCameraProgress = (progress: number) => clamp(progress);

/** The image is a stationary plane. A camera travels around its focus on a
 * short spherical arc, then closes the distance with a fixed lens. Positions
 * use the entry camera's own right/up/back frame and its vertical view span. */
export function carrierCamera(progress: number, viewport: { width: number; height: number }, perspective = 12) {
  const p = clamp(progress), aspect = viewport.width / Math.max(1, viewport.height);
  const portrait = aspect < 1.05;
  const lens = Math.max(1e-4, perspective);
  // On a tall screen the carrier occupies the upper third. The image forms
  // below it; the same orbit transfers the carrier out through the upper edge.
  const centre: OpticalVector = { x: aspect * (portrait ? .075 : .24), y: portrait ? -.22 : .22, z: -.65 };
  const normal = normalize({ x: portrait ? .12 : .28, y: portrait ? -.16 : .13, z: 1 });
  const planeRight = normalize(cross(vertical, normal));
  const planeUp = cross(normal, planeRight);
  const planeScale = portrait ? .34 : .36;
  const firstPosition = { x: 0, y: 0, z: lens };
  const firstOffset = subtract(firstPosition, centre);
  const orbit = p, focus = 1 - Math.pow(1 - p, 3), approach = p;
  const radius = Math.exp(Math.log(length(firstOffset)) * (1 - approach) + Math.log(planeScale * lens) * approach);
  const direction = shortArc(normalize(firstOffset), normal, orbit);
  const position = p === 0 ? firstPosition : add(centre, multiply(direction, radius));
  const aim = mix(zero, centre, focus);
  const backward = normalize(subtract(position, aim));
  const right = normalize(cross(vertical, backward));
  const up = cross(backward, right);
  return { progress: p, perspective: lens, position, aim, right, up, backward, centre, normal, planeRight, planeUp, planeScale, orbit, focus, approach };
}

export function projectOpticalPoint(point: OpticalVector, camera: ReturnType<typeof carrierCamera>, viewport: { width: number; height: number }): OpticalPoint {
  const relative = subtract(point, camera.position);
  const depth = -dot(relative, camera.backward);
  return {
    x: viewport.width / 2 + viewport.height * camera.perspective * dot(relative, camera.right) / depth,
    y: viewport.height / 2 - viewport.height * camera.perspective * dot(relative, camera.up) / depth,
  };
}

export function carrierFrame(progress: number, viewport: { width: number; height: number }, box: FlightBox, rendered?: CarrierCameraSample) {
  const p = clamp(progress), requestedCamera = carrierCameraProgress(p);
  const camera = clamp(rendered?.progress ?? requestedCamera);
  const rig = carrierCamera(camera, viewport, rendered?.perspective);
  const centreX = box.left + box.width / 2, centreY = box.top + box.height / 2;
  const unitX = multiply(rig.planeRight, rig.planeScale / viewport.height);
  const unitY = multiply(rig.planeUp, -rig.planeScale / viewport.height);
  const planeCentre = add(rig.centre, add(multiply(unitX, centreX - viewport.width / 2), multiply(unitY, centreY - viewport.height / 2)));
  const relative = subtract(planeCentre, rig.position);
  const depth = -dot(relative, rig.backward);
  // A projective transform of the fixed plane, derived from the same camera
  // as ArchiveScene. No independently animated translate/scale approximation.
  const coefficient = (v: OpticalVector) => {
    const z = -dot(v, rig.backward);
    return [((viewport.width / 2 - centreX) * z + viewport.height * rig.perspective * dot(v, rig.right)) / depth,
      ((viewport.height / 2 - centreY) * z - viewport.height * rig.perspective * dot(v, rig.up)) / depth, z / depth];
  };
  const [a,b,g] = coefficient(unitX), [c,d,h] = coefficient(unitY), [e,f] = coefficient(relative);
  const matrix = [a,b,0,g, c,d,0,h, 0,0,1,0, e,f,0,1];
  const project = (x: number, y: number) => projectOpticalPoint(add(planeCentre, add(multiply(unitX, x - box.width / 2), multiply(unitY, y - box.height / 2))), rig, viewport);
  const corners = [project(0,0), project(box.width,0), project(box.width,box.height), project(0,box.height)];
  return {
    progress: p, camera, requestedCamera, rig,
    beat: p < .11 ? "ignition" : p < .31 ? "image-formed" : p < .92 ? "camera-transfer" : "settling",
    // Keep the source readable only for the short formation handoff. Once the
    // camera has cleared it, the observation field can take over unobstructed.
    environment: between(camera, .45, .77),
    image: between(p, .12, .31),
    header: between(p, .89, 1),
    light: between(p, 0, .11) * (1 - between(camera, .28, .58)),
    emitter: between(p, 0, .08) * (1 - between(camera, .24, .48)),
    rayLength: between(p, .025, .19),
    frame: between(p, .08, .22) * (1 - between(camera, .64, .92)),
    transform: "matrix3d(" + matrix.map(v => Number(v.toFixed(12))).join(",") + ")",
    matrix, corners,
  };
}
