import { MathUtils, Quaternion, Vector3 } from "three";

/** A camera-local virtual trackball; the hyperbolic rim keeps edge drags usable. */
export function arcballPoint(x: number, y: number, width: number, height: number) {
  const scale = Math.max(1, Math.min(width, height)) * 0.46;
  const px = (x - width / 2) / scale;
  const py = (height / 2 - y) / scale;
  const radius = px * px + py * py;
  const z = radius <= 0.5 ? Math.sqrt(1 - radius) : 0.5 / Math.sqrt(radius);
  return new Vector3(px, py, z).normalize();
}

type PoseSample = { time: number; pose: Quaternion };

/**
 * Free SO(3) inspection, independent of the experiment's mathematical eye.
 * No fixed world-up, latitude clamp or Euler-angle pole is used.
 */
export class CubeArcball {
  readonly orientation = new Quaternion();
  private previous = new Vector3(0, 0, 1);
  private size = { width: 1, height: 1 };
  private samples: PoseSample[] = [];
  private spinAxis = new Vector3(0, 1, 0);
  private spin = 0;
  private lastMovement = -Infinity;
  private resetting: { from: Quaternion; to: Quaternion; elapsed: number } | null = null;
  dragging = false;

  get angularSpeed() { return this.spin; }
  get moving() { return this.dragging || this.spin > 0 || this.resetting !== null; }

  setOrientation(value: Quaternion, animate = false) {
    this.cancel();
    const target = value.clone().normalize();
    if (animate) this.resetting = { from: this.orientation.clone(), to: target, elapsed: 0 };
    else this.orientation.copy(target);
  }

  begin(x: number, y: number, width: number, height: number, time: number) {
    this.cancel();
    this.dragging = true;
    this.size = { width, height };
    this.previous.copy(arcballPoint(x, y, width, height));
    this.samples = [{ time, pose: this.orientation.clone() }];
  }

  move(x: number, y: number, time: number) {
    if (!this.dragging) return false;
    const next = arcballPoint(x, y, this.size.width, this.size.height);
    if (next.distanceToSquared(this.previous) < 1e-14) return false;
    // Reverse the object-facing trackball delta to orbit the inspection camera.
    const delta = new Quaternion().setFromUnitVectors(next, this.previous);
    this.orientation.multiply(delta).normalize();
    this.previous.copy(next);
    this.record(time);
    return true;
  }

  /** Two-finger twist is an explicit roll around the current viewing axis. */
  twist(radians: number, time: number) {
    if (!Number.isFinite(radians) || Math.abs(radians) < 1e-9) return;
    this.resetting = null;
    this.orientation.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -radians)).normalize();
    this.record(time);
  }

  private record(time: number) {
    this.lastMovement = time;
    if (this.samples.at(-1)?.time === time) this.samples.pop();
    this.samples.push({ time, pose: this.orientation.clone() });
    this.samples = this.samples.filter(sample => time - sample.time <= 110).slice(-24);
  }

  end(time: number, reduced = false) {
    this.dragging = false;
    this.spin = 0;
    const first = this.samples[0], last = this.samples.at(-1);
    if (!reduced && first && last && time - this.lastMovement < 85 && last.time - first.time >= 12) {
      const delta = last.pose.clone().multiply(first.pose.clone().invert()).normalize();
      // q and -q represent the same rotation; take its short physical increment.
      if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
      const angle = 2 * Math.acos(MathUtils.clamp(delta.w, -1, 1));
      const axisLength = Math.hypot(delta.x, delta.y, delta.z);
      if (axisLength > 1e-7) {
        this.spinAxis.set(delta.x, delta.y, delta.z).divideScalar(axisLength);
        this.spin = Math.min(7.5, angle * 1000 / (last.time - first.time));
      }
    }
    this.samples = [];
  }

  cancel() {
    this.dragging = false;
    this.spin = 0;
    this.samples = [];
    this.resetting = null;
  }

  step(dt: number, reduced = false) {
    dt = Math.max(0, Math.min(0.1, dt));
    if (this.resetting) {
      const state = this.resetting;
      state.elapsed += dt;
      const t = reduced ? 1 : Math.min(1, state.elapsed / 0.46);
      const eased = t * t * t * (10 + t * (-15 + 6 * t));
      this.orientation.slerpQuaternions(state.from, state.to, eased).normalize();
      if (t === 1) this.resetting = null;
      return true;
    }
    if (this.dragging || !this.spin) return false;
    if (reduced) { this.spin = 0; return false; }
    // Analytical exponential friction makes the released angle frame-rate independent.
    const friction = 7.2;
    const decay = Math.exp(-friction * dt);
    const angle = this.spin * (1 - decay) / friction;
    this.orientation.premultiply(new Quaternion().setFromAxisAngle(this.spinAxis, angle)).normalize();
    this.spin *= decay;
    if (this.spin < 0.012) this.spin = 0;
    return true;
  }
}
