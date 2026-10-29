// Reading a swing from a tracked hand.
//
// Each hand reading gives the palm's place on screen and the palm's size.
// Speed is measured in palm lengths per second, so a hand near the camera
// and one further away swing the same. A swing starts when the hand moves
// fast (above ON) and has really travelled, smoothly (not one jumpy
// reading), and
// ends when it slows below OFF: that gap is the hysteresis, so one swing is
// one hit. A slowly drifting hand never gets near ON. After a swing there
// is a short rest before the next one can start.
//
// Moving towards the camera counts too: the palm grows, and that growth is
// read as forward speed.

export type HandSample = {
  /** Seconds (the reading's own clock). */
  t: number;
  /** Palm centre in screen heights from the middle, x right, y up. */
  x: number;
  y: number;
  /** Palm length, in screen heights. */
  size: number;
};

export type Swing = {
  /** When it started (the reading's clock). */
  t: number;
  /** Peak speed so far, palm lengths per second (grows while it lasts). */
  speed: number;
  /** Direction: x right, y up, f towards the camera (a unit vector). */
  dir: { x: number; y: number; f: number };
  /** Where the hand was as the swing began (screen heights, x right). */
  startX: number;
  /** True while the hand is still moving fast. */
  live: boolean;
};

export const SWING = {
  /** Start and end speeds, palm lengths per second (a wave is ~10). */
  on: 15,
  off: 8,
  /** A swing has to have travelled this far (palm lengths) to count. */
  travel: 1.6,
  /** No single reading may carry more than this share of that travel. */
  oneStep: 0.7,
  /** Rest after a swing before the next can start (s). */
  rest: 0.3,
  /** The speed is measured over this long (s). */
  window: 0.1,
  /** Readings jumping further than this in one step (palm lengths) are a glitch. */
  jump: 4.5,
  /** Forward speed weighting: palm growth rate × this ≈ palm lengths per second. */
  forward: 3,
  /** Palm sizes are held within this range (screen heights). */
  minSize: 0.035,
  maxSize: 0.3,
  /** At least this fast in screen heights per second too (tiny hands far away). */
  minScreenSpeed: 0.55,
} as const;

/** Power 0..1 from a swing's peak speed. */
export const swingPower = (speed: number) =>
  Math.min(1, Math.max(0, (speed - SWING.on) / 40));

export class SwingReader {
  private samples: HandSample[] = [];

  private current: Swing | null = null;

  private restUntil = -Infinity;

  /** The latest speed (palm lengths per second), for the debug readout. */
  speed = 0;

  reset() {
    this.samples = [];
    if (this.current) this.current.live = false;
    this.current = null;
    this.speed = 0;
  }

  /**
   * Feeds one reading. Returns a new swing when one starts, else null. The
   * swing object keeps updating (speed, direction) while it is live.
   */
  push(s: HandSample): Swing | null {
    const size = Math.min(SWING.maxSize, Math.max(SWING.minSize, s.size));
    const last = this.samples[this.samples.length - 1];
    if (last) {
      if (s.t <= last.t) return null;
      const step = Math.hypot(s.x - last.x, s.y - last.y) / size;
      // A big jump in a short time is the tracker swapping or losing the
      // hand, not a swing: start over from here.
      if (step > SWING.jump && s.t - last.t < 0.08) {
        this.reset();
        this.samples.push({ ...s, size });
        return null;
      }
      // A long gap: the old readings say nothing about now.
      if (s.t - last.t > 0.25) this.reset();
    }
    this.samples.push({ ...s, size });
    while (this.samples.length > 2 && s.t - this.samples[0].t > 0.4)
      this.samples.shift();

    // Speed over the last window: the newest reading against the oldest
    // one inside it (at least two readings apart in time).
    let ref: HandSample | null = null;
    for (let i = this.samples.length - 2; i >= 0; i -= 1) {
      ref = this.samples[i];
      if (s.t - ref.t >= SWING.window) break;
    }
    if (!ref) {
      this.speed = 0;
      return null;
    }
    const dt = Math.max(1e-3, s.t - ref.t);
    const meanSize = (size + ref.size) / 2;
    const vx = (s.x - ref.x) / dt;
    const vy = (s.y - ref.y) / dt;
    const vf = (Math.log(size / ref.size) / dt) * SWING.forward * meanSize;
    const screenSpeed = Math.hypot(vx, vy);
    const speed = Math.hypot(vx, vy, vf) / meanSize;
    this.speed = speed;
    const travelled = Math.hypot(s.x - ref.x, s.y - ref.y, vf * dt) / meanSize;
    // The biggest single step inside the window: a swing moves smoothly,
    // a glitch (a clip looping, a hand swapped) arrives in one jump.
    let biggest = 0;
    let steps = 0;
    for (let i = this.samples.length - 1; i > 0; i -= 1) {
      const a = this.samples[i];
      const b = this.samples[i - 1];
      if (s.t - b.t > dt + 1e-6) break;
      biggest = Math.max(biggest, Math.hypot(a.x - b.x, a.y - b.y) / meanSize);
      steps += 1;
    }
    const smoothMove = steps < 2 || biggest <= travelled * SWING.oneStep;

    const cur = this.current;
    if (cur?.live) {
      if (speed > cur.speed) {
        cur.speed = speed;
        const n = Math.hypot(vx, vy, vf) || 1;
        cur.dir = { x: vx / n, y: vy / n, f: vf / n };
      }
      if (speed < SWING.off) cur.live = false;
      return null;
    }
    if (s.t < this.restUntil) return null;
    if (
      speed > SWING.on &&
      travelled > SWING.travel &&
      smoothMove &&
      screenSpeed + Math.abs(vf) > SWING.minScreenSpeed
    ) {
      const n = Math.hypot(vx, vy, vf) || 1;
      // Where the hand began: the oldest reading of the last ~0.2 s.
      let start = ref;
      for (let i = 0; i < this.samples.length; i += 1) {
        if (s.t - this.samples[i].t <= 0.2) {
          start = this.samples[i];
          break;
        }
      }
      const swing: Swing = {
        t: s.t,
        speed,
        dir: { x: vx / n, y: vy / n, f: vf / n },
        startX: start.x,
        live: true,
      };
      this.current = swing;
      this.restUntil = s.t + SWING.rest;
      return swing;
    }
    return null;
  }
}

/**
 * The sideways aim of a swing, −1..1 (− = to your left on the court). A
 * swing straight across the body gives about ±0.75; swinging up or
 * towards the camera brings it back to the middle.
 */
export const swingAim = (dir: Swing["dir"]) => {
  const lateral = dir.x;
  return Math.min(1, Math.max(-1, lateral * 0.8));
};
