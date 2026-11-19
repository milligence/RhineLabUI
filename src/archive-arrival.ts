const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return clamp(t * t * t * (10 + t * (-15 + t * 6)));
};

/** The web entrance forms the final interactive field once. The separately
 * calibrated film keeps its original camera, wave packets and timing. */
export function webArrayArrival(time: number, start: number, end: number) {
  const progress = clamp((time - start) / Math.max(.001, end - start));
  const camera = smooth(progress);
  const opacity = smooth(progress / .38);
  const field = smooth((progress - .06) / .78);
  const selection = smooth((progress - .38) / .44);
  const brand = smooth((progress - .32) / .6);
  return {
    kind: "web" as const,
    progress,
    camera,
    opacity,
    field,
    selection,
    brand,
    entryZ: 3.4 * (camera - 1),
    phase: progress === 0 ? "covered" : opacity < 1 ? "revealing"
      : progress < .84 ? "forming" : progress < 1 ? "settling" : "ready",
  };
}
export type WebArrayArrival = ReturnType<typeof webArrayArrival>;

/** Correct the existing opening clock after a slow first GPU frame. Both the
 * 2D veil and the actual camera consume this same presented time. */
export function presentedOpeningTime(
  requested: number,
  previous: number | null,
  start: number,
  end: number,
  maxStep = .05,
) {
  if (previous === null || requested < previous || requested < start || previous >= end)
    return requested;
  return Math.min(requested, Math.max(previous, start) + maxStep);
}

/** Paper is a consequence of a cleared, framed carrier. A late render cannot
 * turn its first visible frame into a completely opaque document. */
export class ArchiveDocumentArrival {
  private progress = 0;
  private started = false;
  private ready = false;
  private clear = false;
  private active = false;

  reset() {
    this.progress = 0;
    this.started = this.ready = this.clear = this.active = false;
  }

  update(dt: number, active: boolean, ready: boolean, clear: boolean, immediate: boolean) {
    this.active = active;
    this.ready = ready;
    this.clear = clear;
    if (!active) {
      this.progress = immediate ? 0 : Math.max(0, this.progress - Math.max(0, dt) / .24);
      if (this.progress === 0) this.started = false;
      return;
    }
    if (!this.started && ready && clear) this.started = true;
    if (this.started)
      this.progress = immediate ? 1 : Math.min(1, this.progress + Math.max(0, dt) / 1.1);
  }

  get frame() {
    return {
      ready: this.ready,
      clear: this.clear,
      progress: this.progress,
      visibility: smooth(this.progress),
      phase: !this.active ? (this.progress > 0 ? "closing" : "hidden")
        : this.progress === 1 ? "visible" : this.started ? "revealing"
        : this.ready ? "unsealing" : "lifting",
    };
  }
}
