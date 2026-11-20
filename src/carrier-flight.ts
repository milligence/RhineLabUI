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
  /** The aperture and light volume already belong to the depth-tested scene. */
  physicalSource?: boolean;
  sceneBeam?: boolean;
  visible?: boolean;
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
/** A fixed receiving surface, in the frozen entry camera's normalized basis. */
export type CarrierPlane = {
  centre: OpticalVector;
  normal: OpticalVector;
  right: OpticalVector;
  up: OpticalVector;
  scale: number;
};
/** Lens distance in units of the initial vertical field of view. The rendered
 * phase lets the DOM follow the frame actually drawn by the physical scene. */
export type CarrierCameraPose = { position: OpticalVector; aim: OpticalVector; up: OpticalVector };
export type CarrierCameraSample = {
  perspective: number;
  progress: number;
  /** The optical phase that produced this presented camera/source frame. */
  phase?: number;
  frameId?: number;
  /** Actual pose and physical receiving plane in the frozen entry basis. */
  position?: OpticalVector;
  aim?: OpticalVector;
  up?: OpticalVector;
  plane?: CarrierPlane;
};
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

export const CARRIER_ENTRANCE_MS = 6800;
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
  /** Presentation time is uniform. Individual physical envelopes own their
   * easing, so image formation cannot be compressed by two nested quintics. */
  startPresentation(now: number, duration = CARRIER_ENTRANCE_MS) {
    this.jump(0);
    this.target = this.segmentTarget = 1;
    this.start = now; this.duration = Math.max(1, duration);
    this.coefficients = [0, 1, 0, 0, 0, 0];
    this.velocity = 1 / this.duration;
    this.active = true;
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

/** A return revisits the same presentation field; only its travel is eased. */
export const carrierCue = (milliseconds: number) => clamp(milliseconds / CARRIER_ENTRANCE_MS);

/** Let the original detail shot settle, establish the complete physical event,
 * then make one C2 approach. No transient velocity is returned to zero later. */
export const carrierCameraProgress = (progress: number) => between(progress, carrierCue(4200), 1);

/** Independent optical envelopes. Source/beam may fade while the finite plate
 * and its closed rim remain visible; no single light gate owns all materials. */
export function carrierChannels(progress: number, camera = carrierCameraProgress(progress)) {
  const p = clamp(progress), cue = (a: number, b: number) => between(p, carrierCue(a), carrierCue(b));
  const frameBuild = cue(1350, 1850);
  const contentResolve = clamp((p - carrierCue(1900)) / (carrierCue(3600) - carrierCue(1900)));
  const sourcePower = cue(0, 550) * (1 - between(camera, .38, .80));
  const beamPower = cue(550, 1050) * (1 - between(camera, .30, .72));
  const platePresence = cue(1350, 1650) * (1 - between(camera, .88, 1));
  const edgePresence = cue(1350, 1550) * (1 - between(camera, .985, 1));
  const image = cue(1850, 1900);
  return {
    sourcePower, beamPower, platePresence, edgePresence, frameBuild, contentResolve,
    image, reveal: contentResolve,
    charge: cue(0, 550), beamReach: cue(550, 1350), beamSpread: cue(750, 1350),
    environment: between(camera, .70, .95),
    interface: between(camera, .80, .98),
    // Title and content inhabit one plane and resolve through the same mask.
    header: image,
    light: Math.max(sourcePower, beamPower, platePresence, edgePresence),
    emitter: sourcePower,
    frame: frameBuild * edgePresence,
  };
}

export function carrierPlaneCorners(plane: CarrierPlane, viewport: { width: number; height: number }): [OpticalVector, OpticalVector, OpticalVector, OpticalVector] {
  const halfWidth = plane.scale * viewport.width / Math.max(1, viewport.height) / 2;
  const halfHeight = plane.scale / 2;
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) =>
    add(plane.centre, add(multiply(plane.right, x * halfWidth), multiply(plane.up, y * halfHeight)))) as [OpticalVector, OpticalVector, OpticalVector, OpticalVector];
}

/** Compose the held shot in screen space, then solve its world depth against
 * all four real aperture corners. Scaling about the entry eye preserves that
 * exact composition while bringing every receiver corner in front of the
 * glass: no ray can cross the cover's back half-space. The solution is frozen
 * for the whole entrance/return, rather than following either camera. */
export function carrierReceiverPlane(viewport: { width: number; height: number }, perspective: number,
  source?: { corners: readonly OpticalVector[]; normal: OpticalVector; clearance?: number }): CarrierPlane {
  const aspect = viewport.width / Math.max(1, viewport.height), portrait = aspect < 1.05;
  const lens = Math.max(1e-4, perspective);
  const sourceNormal = source ? normalize(source.normal) : normalize({ x: .285, y: -.228, z: .931 });
  // The receiving face turns toward the source side of the entry shot. The
  // later orbit then carries the physical archive out through that same edge,
  // instead of pushing it behind an enlarging foreground document.
  const normal = normalize(mix(sourceNormal, portrait ? { x: -.08, y: .55, z: 1 } : { x: -.60, y: .17, z: 1 }, .8));
  const uprightRight = normalize(cross(vertical, normal)), uprightUp = cross(normal, uprightRight);
  const roll = portrait ? .045 : -.065;
  const right = add(multiply(uprightRight, Math.cos(roll)), multiply(uprightUp, Math.sin(roll)));
  const up = add(multiply(uprightUp, Math.cos(roll)), multiply(uprightRight, -Math.sin(roll)));
  const centre = { x: portrait ? 0 : aspect * .255, y: portrait ? -.235 : .04, z: 0 };
  const plane: CarrierPlane = { centre, normal, right, up, scale: .5 };
  // A restrained angle is deliberately readable during formation. Solve the
  // bounding size after this tilt rather than clipping an already sized panel.
  const targetX = centre.x, targetY = centre.y;
  for (let i = 0; i < 7; i++) {
    const points = carrierPlaneCorners(plane, viewport).map(point => ({ x: lens * point.x / (lens - point.z), y: lens * point.y / (lens - point.z) }));
    const left = Math.min(...points.map(point => point.x)), right = Math.max(...points.map(point => point.x));
    const bottom = Math.min(...points.map(point => point.y)), top = Math.max(...points.map(point => point.y));
    plane.scale *= portrait ? .46 / (top - bottom) : aspect * .45 / (right - left);
    centre.x += targetX - (left + right) / 2;
    centre.y += targetY - (bottom + top) / 2;
  }
  const eye = { x: 0, y: 0, z: lens };
  let depthScale = 1 - Math.min(.35, lens * .1) / lens;
  if (source) {
    const receiver = carrierPlaneCorners(plane, viewport);
    const clearance = source.clearance ?? .12;
    depthScale = 1;
    for (let i = 0; i < receiver.length; i++) for (const aperture of source.corners) {
      const eyeClearance = dot(subtract(eye, aperture), sourceNormal);
      const slope = dot(subtract(receiver[i], eye), sourceNormal);
      if (slope < 0) depthScale = Math.min(depthScale, (eyeClearance - clearance) / -slope);
    }
    // Entry is gated on a front-facing port. This bound also keeps a malformed
    // external sample away from the eye instead of producing an inverted plane.
    depthScale = Math.max(.15, Math.min(1, depthScale));
  }
  plane.centre = add(eye, multiply(subtract(centre, eye), depthScale));
  plane.scale *= depthScale;
  return plane;
}

/** The projection plane is fixed in the entry camera's basis. A single camera
 * orbits toward its normal and closes distance with the original fixed lens.
 * An already-drawn pose can override the ideal path without moving the plane. */
export function carrierCamera(progress: number, viewport: { width: number; height: number }, perspective = 12, pose?: Partial<CarrierCameraPose> & { plane?: CarrierPlane }) {
  const p = clamp(progress);
  const lens = Math.max(1e-4, perspective);
  const plane = pose?.plane ?? carrierReceiverPlane(viewport, lens);
  const { centre, normal, right: planeRight, up: planeUp, scale: planeScale } = plane;
  const firstPosition = { x: 0, y: 0, z: lens };
  const firstOffset = subtract(firstPosition, centre);
  const orbit = p, focus = p, approach = p;
  const radius = Math.exp(Math.log(length(firstOffset)) * (1 - approach) + Math.log(planeScale * lens) * approach);
  const direction = shortArc(normalize(firstOffset), normal, orbit);
  const position = pose?.position ?? (p === 0 ? firstPosition : add(centre, multiply(direction, radius)));
  const aim = pose?.aim ?? mix(zero, centre, focus);
  const backward = normalize(subtract(position, aim));
  const right = normalize(cross(pose?.up ?? shortArc(vertical, planeUp, p), backward));
  const up = cross(backward, right);
  return { progress: p, perspective: lens, position, aim, right, up, backward, centre, normal, planeRight, planeUp, planeScale, plane, orbit, focus, approach };
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
    beat: p < carrierCue(550) ? "ignition" : p < carrierCue(1350) ? "beam-forming" :
      p < carrierCue(1900) ? "frame-forming" : channels.contentResolve < .999 ? "image-forming" :
      p < carrierCue(4200) ? "image-held" : camera < .96 ? "camera-transfer" : "settling",
    ...channels,
    rayLength: channels.beamReach,
    transform: "matrix3d(" + matrix.map(v => Number(v.toFixed(12))).join(",") + ")",
    matrix, corners,
    scanLine: [project(0, box.height * (1 - channels.reveal)), project(box.width, box.height * (1 - channels.reveal))],
  };
}
