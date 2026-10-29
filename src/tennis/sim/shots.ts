// Shots: where a hit sends the ball, and how fast.
//
//   - planShot: the launch speed that lands the ball on a spot after a set
//     flight time, lofted until it clears the net.
//   - your shot: swing speed is pace and depth, the swing's sideways angle
//     aims, and the timing pulls it (early drags it the way you swing, late
//     pushes it the other way). A mistimed swing aimed wide can go out, a
//     slapped early one can go long, and a weak late one finds the net.
//   - the computer's shot: gentle and central at first, faster and wider
//     as the rally grows.
import { GRAVITY, type Vec3 } from "./ball";
import { BALL_RADIUS, COURT, netHeight } from "./court";

export type Timing = "perfect" | "good" | "early" | "late";
export type Stroke = "forehand" | "backhand";
export type ShotResult = "in" | "wide" | "long" | "net";

/** The hit window, seconds from the moment the ball reaches you (− early). */
export const WINDOW = {
  perfect: 0.075,
  good: 0.16,
  /** Earliest swing that still counts (earlier ones are ignored). */
  early: 0.34,
  /** Latest swing that still reaches the ball; past this it is a miss. */
  late: 0.25,
};

/** Grades a swing `dt` seconds from the ball's arrival (null = outside the window). */
export const gradeTiming = (dt: number): Timing | null => {
  if (dt < -WINDOW.early || dt > WINDOW.late) return null;
  const a = Math.abs(dt);
  if (a <= WINDOW.perfect) return "perfect";
  if (a <= WINDOW.good) return "good";
  return dt < 0 ? "early" : "late";
};

/** Net clearance a planned shot keeps (m). */
const CLEARANCE = 0.35;

/**
 * Launch velocity from `p` to land at `target` (x, z on the court) after
 * `flight` seconds. If that path would clip the net, the flight is
 * lengthened (a higher arc) until it clears by `clearance`.
 */
export const planShot = (
  p: Vec3,
  target: { x: number; z: number },
  flight: number,
  clearance = CLEARANCE,
) => {
  let t = flight;
  for (let i = 0; i < 40; i += 1) {
    const v = {
      x: (target.x - p.x) / t,
      y: (BALL_RADIUS - p.y + 0.5 * GRAVITY * t * t) / t,
      z: (target.z - p.z) / t,
    };
    if (v.z === 0 || Math.sign(-p.z) !== Math.sign(v.z))
      return { v, flight: t };
    const s = -p.z / v.z;
    const y = p.y + v.y * s - 0.5 * GRAVITY * s * s;
    if (y >= netHeight(p.x + v.x * s) + clearance) return { v, flight: t };
    t += 0.04;
  }
  return {
    v: {
      x: (target.x - p.x) / t,
      y: (BALL_RADIUS - p.y + 0.5 * GRAVITY * t * t) / t,
      z: (target.z - p.z) / t,
    },
    flight: t,
  };
};

/**
 * A shot that meets the net tape: it reaches the net in `toNet` seconds at
 * `height` (below the tape), aimed at `x` there.
 */
export const planNetShot = (
  p: Vec3,
  x: number,
  toNet: number,
  height = 0.5,
) => ({
  v: {
    x: (x - p.x) / toNet,
    y: (height - p.y + 0.5 * GRAVITY * toNet * toNet) / toNet,
    z: -p.z / toNet,
  },
  flight: toNet,
});

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type SwingInput = {
  /** 0..1: how hard (swing speed). */
  power: number;
  /** −1..1: the swing's sideways angle (− = to your left). */
  aim: number;
  timing: Timing;
  stroke: Stroke;
};

export type PlannedHit = {
  target: { x: number; z: number };
  flight: number;
  result: ShotResult;
  /** For a net shot: where it meets the net. */
  netX?: number;
};

/** How far sideways full aim sends the ball (m from the middle). */
const AIM_X = 3.3;
/** How far a mistimed swing pulls the ball sideways (m). */
const PULL_X = 1.05;

/**
 * Your shot, from the swing. The result is decided here (in / wide / long
 * / net) so the flight shows it honestly: the ball really goes there.
 */
export const yourShot = (s: SwingInput): PlannedHit => {
  const power = clamp(s.power, 0, 1);
  // Early pulls the ball across (the way a forehand swings: to your left;
  // a backhand: to your right), late pushes it the other way.
  const across = s.stroke === "forehand" ? -1 : 1;
  let pull = 0;
  if (s.timing === "early") pull = across * PULL_X;
  else if (s.timing === "late") pull = -across * PULL_X;
  else if (s.timing === "good")
    pull = across * 0.25 * Math.sign(s.aim || across);
  let x = clamp(s.aim, -1, 1) * AIM_X + pull;
  let depth = lerp(7.4, 10.6, power);
  let flight = lerp(1.3, 0.72, power);
  if (s.timing === "perfect") {
    // A clean hit: a little extra pace, and it always lands in.
    flight *= 0.94;
    x = clamp(x, -3.6, 3.6);
    depth = Math.min(depth, 10.9);
  }
  const mistimed = s.timing === "early" || s.timing === "late";
  if (s.timing === "late" && power < 0.32) {
    return {
      target: { x, z: -depth },
      flight: 0.42,
      result: "net",
      netX: clamp(x * 0.4, -3.5, 3.5),
    };
  }
  if (s.timing === "early" && power > 0.9) {
    return {
      target: { x, z: -(COURT.halfLength + 1.4) },
      flight,
      result: "long",
    };
  }
  const wide = Math.abs(x) > COURT.halfSingles - 0.05;
  if (wide && mistimed) {
    x = Math.sign(x) * Math.max(Math.abs(x), COURT.halfSingles + 0.55);
    return { target: { x, z: -depth }, flight, result: "wide" };
  }
  x = clamp(x, -(COURT.halfSingles - 0.3), COURT.halfSingles - 0.3);
  return { target: { x, z: -depth }, flight, result: "in" };
};

/** 0..1 eased: how far into its build-up the rally is. */
export const rallyPressure = (rally: number) => {
  const t = clamp(rally / 24, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * The computer's return, at rally `rally` (0 = the serve). `rnd` is 0..1
 * random numbers. Gentle and near the middle first; with the rally it gets
 * quicker, deeper and wider.
 */
export const computerShot = (rally: number, rnd: () => number) => {
  const k = rallyPressure(rally);
  const spread = lerp(0.9, 3.4, k);
  const side = rnd() < 0.5 ? -1 : 1;
  const x = side * spread * lerp(0.35, 1, rnd());
  const z = lerp(7.6, 10.2, k) + (rnd() - 0.5) * lerp(0.6, 1.4, k);
  const flight = lerp(1.6, 0.98, k) * lerp(0.96, 1.04, rnd());
  return {
    target: { x: clamp(x, -3.7, 3.7), z: Math.min(z, 11.1) },
    flight,
  };
};

/** The serve: a friendly feed into your half (no service-box rules). */
export const serveShot = (rnd: () => number) => ({
  target: { x: (rnd() - 0.5) * 2.4, z: 8.6 + rnd() * 1.2 },
  flight: 1.5,
});
