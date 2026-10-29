// The ball's flight: gravity, a bounce that loses height and some of its
// speed along the court (the spin scrubbing off), and the net. Pure numbers,
// so the game and the tests share it.
import { BALL_RADIUS, COURT, netHeight } from "./court";

/** The low wall around the court (m). */
const WALL_H = 1.1;

/** Arcade gravity: a touch lighter than real, so rallies breathe. */
export const GRAVITY = 9.0;
/** Height kept on a bounce, and speed kept along the court. */
export const BOUNCE_UP = 0.62;
export const BOUNCE_ALONG = 0.8;

export type Vec3 = { x: number; y: number; z: number };

export type Ball = {
  p: Vec3;
  v: Vec3;
  /** Spin, only for the picture (radians per second). */
  spin: number;
  /** Bounces since the last hit. */
  bounces: number;
  /** True once it has hit the net (it then drops dead on that side). */
  netted: boolean;
  /** At rest on the court (rolled out). */
  dead: boolean;
};

export type BallEvent =
  | { kind: "bounce"; x: number; z: number; speed: number }
  | { kind: "net"; x: number; y: number };

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const newBall = (p: Vec3 = v3(0, 1, 0)): Ball => ({
  p: { ...p },
  v: v3(),
  spin: 0,
  bounces: 0,
  netted: false,
  dead: false,
});

/** A slow ball at rest stops bouncing. */
const REST = 0.6;

/**
 * Moves the ball by `dt` seconds and reports bounces and a net hit. Small
 * fixed sub-steps keep the net and the bounces exact at any frame rate.
 */
export const stepBall = (ball: Ball, dt: number, out: BallEvent[] = []) => {
  if (ball.dead) return out;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    const { p, v } = ball;
    const z0 = p.z;
    v.y -= GRAVITY * h;
    p.x += v.x * h;
    p.y += v.y * h;
    p.z += v.z * h;
    // The net: crossing z = 0 below the tape.
    if (!ball.netted && Math.sign(z0) !== Math.sign(p.z) && z0 !== 0) {
      const t = z0 / (z0 - p.z);
      const x = p.x - v.x * h * (1 - t);
      const y = p.y - v.y * h * (1 - t);
      if (y < netHeight(x) + BALL_RADIUS * 0.5) {
        ball.netted = true;
        // Back off the net on the side it came from, nearly dead.
        p.z = Math.sign(z0) * (BALL_RADIUS + 0.01);
        v.z = -v.z * 0.12;
        v.x *= 0.3;
        v.y = Math.min(v.y, 0) * 0.3;
        out.push({ kind: "net", x, y });
      }
    }
    // The low wall around the court: a dull knock back off it.
    if (p.y < WALL_H) {
      if (Math.abs(p.x) > COURT.apronX - BALL_RADIUS && p.x * v.x > 0) {
        p.x = Math.sign(p.x) * (COURT.apronX - BALL_RADIUS);
        v.x *= -0.3;
        v.z *= 0.6;
      }
      if (Math.abs(p.z) > COURT.apronZ - BALL_RADIUS && p.z * v.z > 0) {
        p.z = Math.sign(p.z) * (COURT.apronZ - BALL_RADIUS);
        v.z *= -0.3;
        v.x *= 0.6;
      }
    }
    if (p.y < BALL_RADIUS && v.y < 0) {
      p.y = BALL_RADIUS;
      const speed = Math.hypot(v.x, v.y, v.z);
      v.y = -v.y * BOUNCE_UP;
      v.x *= BOUNCE_ALONG;
      v.z *= BOUNCE_ALONG;
      ball.spin *= 0.5;
      ball.bounces += 1;
      out.push({ kind: "bounce", x: p.x, z: p.z, speed });
      if (v.y < REST) {
        v.y = 0;
        // Rolling: let it slow down and stop.
        if (Math.hypot(v.x, v.z) < 0.4) ball.dead = true;
      }
    }
    if (p.y <= BALL_RADIUS && v.y === 0) {
      const k = Math.exp(-1.5 * h);
      v.x *= k;
      v.z *= k;
      if (Math.hypot(v.x, v.z) < 0.2) ball.dead = true;
    }
  }
  return out;
};

/** Where the ball will be after `t` seconds of free flight (no bounce). */
export const flightAt = (p: Vec3, v: Vec3, t: number): Vec3 => ({
  x: p.x + v.x * t,
  y: p.y + v.y * t - 0.5 * GRAVITY * t * t,
  z: p.z + v.z * t,
});

/**
 * Plays the ball forward on a copy and returns every sample (every `h` s)
 * until `until(ball, t)` says stop or `maxT` passes.
 */
export const predict = (
  ball: Ball,
  maxT: number,
  until: (b: Ball, t: number) => boolean,
  h = 1 / 120,
) => {
  const b: Ball = {
    ...ball,
    p: { ...ball.p },
    v: { ...ball.v },
  };
  let t = 0;
  const events: BallEvent[] = [];
  while (t < maxT) {
    stepBall(b, h, events);
    t += h;
    if (until(b, t)) return { ball: b, t, events };
  }
  return { ball: b, t, events, timedOut: true };
};
