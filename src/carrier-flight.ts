/** The optical image has a source, a held projection plane and a camera transfer.
 * This timeline is shared by research and experiment archives. All coordinates
 * are surface-local CSS pixels; no archive geometry is moved to frame them. */
export type OpticalPoint = { x: number; y: number };
export type CarrierSample = {
  origin: OpticalPoint;
  edge?: [OpticalPoint, OpticalPoint];
  /** Model-local TL, TR, BR, BL, projected by the camera already on screen. */
  corners?: [OpticalPoint, OpticalPoint, OpticalPoint, OpticalPoint];
  outline?: OpticalPoint[];
};
export type FlightBox = { left: number; top: number; width: number; height: number };
/** Carrier samples arrive in screen CSS pixels, while the stage itself may be
 * scaled. Convert once at the boundary; image boxes, SVG and camera projection
 * must all use the same unscaled surface coordinates. */
export function carrierLocalPoint(point: OpticalPoint, bounds: FlightBox, surface: { width: number; height: number }): OpticalPoint {
  return {
    x: (point.x - bounds.left) * surface.width / Math.max(1e-6, bounds.width),
    y: (point.y - bounds.top) * surface.height / Math.max(1e-6, bounds.height),
  };
}
export type OpticalVector = { x: number; y: number; z: number };
/** Lens distance in units of the initial vertical field of view. The rendered
 * phase lets the DOM follow the frame actually drawn by the physical scene. */
export type CarrierCameraPose = { position: OpticalVector; aim: OpticalVector; up: OpticalVector };
export type CarrierCameraSample = {
  perspective: number;
  progress: number;
  /** The optical phase that produced this presented camera/source frame. */
  phase?: number;
  frameId?: number;
  /** Actual pose in the frozen entry basis, including finite entry inertia. */
  position?: OpticalVector;
  aim?: OpticalVector;
  up?: OpticalVector;
};
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * t * (t * (t * 6 - 15) + 10); };
const between = (v: number, a: number, b: number) => smooth((v - a) / (b - a));
// Join a stationary phase to linear travel with zero first/second derivatives
// at departure. The flight itself supplies the final arrival ease, so the
// camera must not ease twice and spend its last second apparently motionless.
const depart = (value: number, ramp = .22) => {
  const t = clamp(value), speed = 1 / (1 - ramp / 2);
  if (t >= ramp) return speed * (t - ramp / 2);
  const u = t / ramp;
  return speed * ramp * (u ** 6 - 3 * u ** 5 + 2.5 * u ** 4);
};
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

export const CARRIER_ENTRANCE_MS = 6100;
export const CARRIER_RETURN_MS = 2400;

/** A stalled render must not consume the light-up and image-formation beats.
 * This is presentation time, shared by the flight and its reversals; the
 * ordinary 30/60/144 Hz path is unchanged. Hidden tabs do not run the show. */
export class CarrierPresentationClock {
  value = 0;
  private previous = 0;
  reset(now: number) { this.value = 0; this.previous = now; }
  step(now: number, visible = true) {
    const elapsed = Math.max(0, now - this.previous);
    this.previous = Math.max(this.previous, now);
    if (visible) this.value += Math.min(64, elapsed);
    return this.value;
  }
}

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

/** Cues are expressed in presentation milliseconds, then mapped into the same
 * reversible quintic phase as the flight. A return revisits the same field. */
export const carrierCue = (milliseconds: number) => smooth(milliseconds / CARRIER_ENTRANCE_MS);

/** One continuous camera path: a slow drift establishes the source and formed
 * image, then the same path accelerates into it. There is no stationary camera
 * plateau or second camera clock at the coexistence/approach boundary. */
export const carrierCameraProgress = (progress: number) => {
  const p = clamp(progress), approach = carrierCue(3650);
  return .16 * p + .84 * depart((p - approach) / (1 - approach), .25);
};

/** Independent optical envelopes. Source/beam may fade while the finite plate
 * and its closed rim remain visible; no single light gate owns all materials. */
export function carrierChannels(progress: number, camera = carrierCameraProgress(progress)) {
  const p = clamp(progress), cue = (a: number, b: number) => between(p, carrierCue(a), carrierCue(b));
  const frameBuild = cue(1100, 1750);
  const contentResolve = cue(1800, 3000);
  const sourcePower = cue(0, 400) * (1 - between(camera, .38, .80));
  const beamPower = cue(400, 1050) * (1 - between(camera, .30, .72));
  const platePresence = cue(1100, 1450) * (1 - between(camera, .88, 1));
  const edgePresence = cue(1100, 1350) * (1 - between(camera, .985, 1));
  const image = cue(1700, 1800);
  return {
    sourcePower, beamPower, platePresence, edgePresence, frameBuild, contentResolve,
    image, reveal: contentResolve,
    charge: cue(0, 400), beamReach: cue(400, 1100), beamSpread: cue(650, 1100),
    environment: between(camera, .70, .95),
    interface: between(camera, .80, .98),
    // Title and content inhabit one plane and resolve through the same mask.
    header: image,
    light: Math.max(sourcePower, beamPower, platePresence, edgePresence),
    emitter: sourcePower,
    frame: frameBuild * edgePresence,
  };
}

/** The projection plane is fixed in the entry camera's basis. A single camera
 * orbits toward its normal and closes distance with the original fixed lens.
 * An already-drawn pose can override the ideal path without moving the plane. */
export function carrierCamera(progress: number, viewport: { width: number; height: number }, perspective = 12, pose?: Partial<CarrierCameraPose>) {
  const p = clamp(progress), aspect = viewport.width / Math.max(1, viewport.height);
  const portrait = aspect < 1.05;
  const lens = Math.max(1e-4, perspective);
  const centre: OpticalVector = { x: aspect * (portrait ? .025 : .255), y: portrait ? -.245 : .035, z: -.52 };
  const normal = normalize({ x: portrait ? .09 : .18, y: portrait ? -.12 : .055, z: 1 });
  const planeRight = normalize(cross(vertical, normal));
  const planeUp = cross(normal, planeRight);
  const planeScale = portrait ? .49 : .46;
  const firstPosition = { x: 0, y: 0, z: lens };
  const firstOffset = subtract(firstPosition, centre);
  const orbit = p, focus = p, approach = p;
  const radius = Math.exp(Math.log(length(firstOffset)) * (1 - approach) + Math.log(planeScale * lens) * approach);
  const direction = shortArc(normalize(firstOffset), normal, orbit);
  const position = pose?.position ?? (p === 0 ? firstPosition : add(centre, multiply(direction, radius)));
  const aim = pose?.aim ?? mix(zero, centre, focus);
  const backward = normalize(subtract(position, aim));
  const right = normalize(cross(pose?.up ?? vertical, backward));
  const up = cross(backward, right);
  return { progress: p, perspective: lens, position, aim, right, up, backward, centre, normal, planeRight, planeUp, planeScale, orbit, focus, approach };
}

/** A finite C2 continuation of the entry camera's measured derivatives. The
 * perturbation starts at zero and rejoins the fixed path with zero derivatives.
 * It affects the camera only: the source and receiving plane never inherit it. */
export function carrierInertiaOffset(elapsed: number, velocity: OpticalVector, acceleration: OpticalVector, duration = .8): OpticalVector {
  if (elapsed >= duration) return { ...zero };
  const t = clamp(elapsed / duration);
  const value = (v: number, a: number) => {
    const first = v * duration, second = a * duration * duration;
    return first * (t - 6 * t ** 3 + 8 * t ** 4 - 3 * t ** 5) +
      second * (.5 * t ** 2 - 1.5 * t ** 3 + 1.5 * t ** 4 - .5 * t ** 5);
  };
  return { x: value(velocity.x, acceleration.x), y: value(velocity.y, acceleration.y), z: value(velocity.z, acceleration.z) };
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
  const p = clamp(rendered?.phase ?? progress), requestedCamera = carrierCameraProgress(progress);
  const camera = clamp(rendered?.progress ?? carrierCameraProgress(p));
  const rig = carrierCamera(camera, viewport, rendered?.perspective, rendered);
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
  const channels = carrierChannels(p, camera);
  return {
    progress: p, camera, requestedCamera, rig,
    beat: p < carrierCue(400) ? "ignition" : p < carrierCue(1100) ? "beam-forming" :
      p < carrierCue(1800) ? "frame-forming" : channels.contentResolve < .999 ? "image-forming" :
      p < carrierCue(3650) ? "image-held" : camera < .96 ? "camera-transfer" : "settling",
    ...channels,
    rayLength: channels.beamReach,
    transform: "matrix3d(" + matrix.map(v => Number(v.toFixed(12))).join(",") + ")",
    matrix, corners,
    scanLine: [project(0, box.height * (1 - channels.reveal)), project(box.width, box.height * (1 - channels.reveal))],
  };
}
