// The endless rally. Pure game logic (no drawing), stepped once a frame.
//
//   start  → the computer serves (a friendly feed into your half)
//   rally  → the ball flies; you only time and swing, your player runs to
//            the ball on their own; the computer always gets it back, a
//            little quicker and wider as the rally grows
//   over   → a missed ball, a shot out or into the net ends the rally: a
//            short pause, the rally count, then a new serve
//
// Every return of yours that lands in adds one to the rally. There is no
// game over.
import {
  newBall,
  predict,
  stepBall,
  v3,
  type Ball,
  type BallEvent,
  type Vec3,
} from "./ball";
import { COURT, landsIn } from "./court";
import {
  computerShot,
  gradeTiming,
  planNetShot,
  planShot,
  serveShot,
  WINDOW,
  yourShot,
  type ShotResult,
  type Stroke,
  type Timing,
} from "./shots";

export type Phase = "start" | "serve" | "rally" | "over";
export type Who = "you" | "cpu";
export type EndReason = "miss" | "out" | "net";

export type PlayerState = {
  x: number;
  z: number;
  /** Speed (m/s) along x and z, for the running legs. */
  vx: number;
  vz: number;
  /** Where they are heading. */
  tx: number;
  tz: number;
  /** The current or last swing: stroke, start and contact (game seconds). */
  swing: {
    stroke: Stroke;
    start: number;
    contact: number;
    power: number;
  } | null;
  /** The side they set up for. */
  side: Stroke;
};

/** The ball on its way to someone: where and when it can be hit. */
export type Incoming = {
  who: Who;
  at: Vec3;
  t: number;
};

export type GameEvent =
  | { kind: "serve"; t: number }
  | {
      kind: "hit";
      who: Who;
      t: number;
      power: number;
      stroke: Stroke;
      timing?: Timing;
      at: Vec3;
    }
  | {
      kind: "bounce";
      t: number;
      x: number;
      z: number;
      speed: number;
      in: boolean;
    }
  | { kind: "net"; t: number; x: number; y: number }
  | { kind: "rally"; t: number; rally: number }
  | { kind: "whiff"; t: number }
  | {
      kind: "over";
      t: number;
      reason: EndReason;
      rally: number;
      best: boolean;
      at: Vec3;
    };

/** A swing, from the hand or a tap. */
export type SwingIn = {
  /** Game time of the swing. */
  t: number;
  /** 0..1, read again at the moment of the hit (a swing can still speed up). */
  power: () => number;
  /** −1..1, read again at the moment of the hit. */
  aim: () => number;
  /** null = pick from where the ball is. */
  stroke: Stroke | null;
};

const HOME = {
  you: { x: 0, z: COURT.halfLength + 0.9 },
  cpu: { x: 0, z: -(COURT.halfLength + 0.9) },
};
/** The ball is met this far to the side of the body. */
const REACH = 0.8;
/** Players run at most this fast (m/s). */
const RUN = 7.5;
/** The ball is taken at the latest this far behind the baseline (m). */
const BEHIND = 2.0;
/** Timings (s). */
const SERVE_WAIT = 1.1;
const OVER_PAUSE = 2.3;
const MISS_PAUSE = 0.7;

/** A small seeded random generator, so a rally can be replayed. */
export const seeded = (seed: number) => {
  let n = seed % 233280;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
};

const player = (home: { x: number; z: number }): PlayerState => ({
  x: home.x,
  z: home.z,
  vx: 0,
  vz: 0,
  tx: home.x,
  tz: home.z,
  swing: null,
  side: "forehand",
});

/** Smooth, eased run towards the player's target, capped. */
const movePlayer = (p: PlayerState, dt: number) => {
  // Smooth, eased run: speed towards the target, capped.
  const dx = p.tx - p.x;
  const dz = p.tz - p.z;
  const want = Math.min(RUN, Math.hypot(dx, dz) * 5);
  const d = Math.hypot(dx, dz) || 1;
  const k = 1 - Math.exp(-12 * dt);
  p.vx += ((dx / d) * want - p.vx) * k;
  p.vz += ((dz / d) * want - p.vz) * k;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
};

/**
 * Where the ball can be hit on `who`'s side: after its first bounce there,
 * at the top of the bounce, or as it reaches a little past the baseline if
 * that comes first.
 */
export const findContact = (ball: Ball, who: Who): Incoming | null => {
  const sign = who === "you" ? 1 : -1;
  const run = predict(ball, 4, (b) => {
    if (b.netted || b.bounces > 1) return true;
    if (b.bounces === 0) return false;
    if (b.p.z * sign > COURT.halfLength + BEHIND) return true;
    return b.v.y <= 0;
  });
  if (run.ball.netted || run.ball.bounces !== 1) return null;
  if (run.ball.p.z * sign < 0) return null;
  return { who, at: { ...run.ball.p }, t: run.t };
};

export class Game {
  phase: Phase = "start";

  time = 0;

  ball: Ball = newBall(v3(0, 1, HOME.cpu.z));

  rally = 0;

  best = 0;

  you = player(HOME.you);

  cpu = player(HOME.cpu);

  /** Who hit last. */
  hitter: Who = "cpu";

  /** The ball on its way to someone, and when it can be hit. */
  incoming: Incoming | null = null;

  /** Your swing waiting for the ball (an early or perfect swing). */
  private pending: (SwingIn & { timing: Timing; stroke: Stroke }) | null = null;

  /** The result your last shot was given (it plays out in the flight). */
  lastShot: ShotResult | null = null;

  /** Ends the rally at this time (after a miss, out or net). */
  private overAt = -1;

  private overReason: EndReason = "miss";

  /** When the next serve goes. */
  private serveAt = -1;

  /** The serve's toss is in the air (for the picture). */
  tossing = false;

  /** Last point's summary, for the HUD. */
  last: { reason: EndReason; rally: number; best: boolean } | null = null;

  /** Your hits so far in this session. */
  hits = 0;

  events: GameEvent[] = [];

  private rnd: () => number;

  private ballEvents: BallEvent[] = [];

  constructor(seed = 1, best = 0) {
    this.rnd = seeded(seed);
    this.best = best;
    this.placeBallForServe();
  }

  /** Starts play (the first tap). */
  start() {
    if (this.phase !== "start") return;
    this.newPoint();
  }

  private placeBallForServe() {
    this.ball = newBall(v3(this.cpu.x + 0.35, 1.0, this.cpu.z + 0.2));
    this.ball.dead = true;
  }

  private newPoint() {
    this.phase = "serve";
    this.rally = 0;
    this.lastShot = null;
    this.incoming = null;
    this.pending = null;
    this.overAt = -1;
    this.you.tx = HOME.you.x;
    this.you.tz = HOME.you.z;
    this.cpu.tx = HOME.cpu.x;
    this.cpu.tz = HOME.cpu.z;
    this.serveAt = this.time + SERVE_WAIT;
    this.tossing = true;
    this.placeBallForServe();
  }

  private serve() {
    const shot = serveShot(this.rnd);
    const from = v3(this.cpu.x + 0.25, 2.55, this.cpu.z + 0.15);
    this.ball = newBall(from);
    const { v } = planShot(from, shot.target, shot.flight, 0.5);
    this.ball.v = v;
    this.ball.spin = 20;
    this.hitter = "cpu";
    this.tossing = false;
    this.phase = "rally";
    this.cpu.swing = {
      stroke: "forehand",
      start: this.time - 0.3,
      contact: this.time,
      power: 0.6,
    };
    this.events.push({ kind: "serve", t: this.time });
    this.events.push({
      kind: "hit",
      who: "cpu",
      t: this.time,
      power: 0.55,
      stroke: "forehand",
      at: { ...from },
    });
    this.setIncoming("you");
  }

  private setIncoming(who: Who) {
    const c = findContact(this.ball, who);
    const inc = c ? { ...c, t: this.time + c.t } : null;
    this.incoming = inc;
    if (!inc) return;
    const p = who === "you" ? this.you : this.cpu;
    // Your player sets up on the side you are swinging on (see `aimSide`);
    // the computer takes forehands on its right (−x as it faces you).
    if (who === "cpu") {
      p.side = inc.at.x <= this.cpu.x + 0.6 ? "forehand" : "backhand";
      p.swing = {
        stroke: p.side,
        start: inc.t - 0.32,
        contact: inc.t,
        power: Math.min(1, 0.3 + this.rally / 30),
      };
    }
    this.placeFor(p, who);
  }

  /** Moves a player's target so the ball meets their racket side. */
  private placeFor(p: PlayerState, who: Who) {
    const c = this.incoming;
    if (!c || c.who !== who) return;
    // Facing −z (you), the right hand is +x; facing +z (computer), it is −x.
    const right = who === "you" ? 1 : -1;
    const side = p.side === "forehand" ? 1 : -1;
    p.tx = c.at.x - right * side * REACH;
    p.tz = c.at.z + (who === "you" ? 0.25 : -0.25);
  }

  /**
   * Which side your player sets up on, from where your hand is (before a
   * swing). Ignored once a swing is locked in.
   */
  aimSide(stroke: Stroke) {
    if (this.pending || this.you.side === stroke) return;
    this.you.side = stroke;
    this.placeFor(this.you, "you");
  }

  /** The stroke a swing with no side of its own gets: from where the ball is. */
  private strokeFor(at: Vec3) {
    return at.x >= this.you.x - 0.2 ? "forehand" : "backhand";
  }

  /**
   * A swing (hand or tap). Returns its timing, or null if it was outside
   * the window (too early is ignored; too late is a miss already).
   */
  swing(s: SwingIn): Timing | null {
    const c = this.incoming;
    const stroke = s.stroke ?? (c ? this.strokeFor(c.at) : this.you.side);
    if (this.phase !== "rally" || !c || c.who !== "you" || this.pending) {
      this.whiff(s.t, stroke);
      return null;
    }
    const timing = gradeTiming(s.t - c.t);
    if (!timing) {
      this.whiff(s.t, stroke);
      return null;
    }
    this.pending = { ...s, timing, stroke };
    this.you.side = stroke;
    this.placeFor(this.you, "you");
    this.you.swing = {
      stroke,
      start: Math.min(s.t, c.t) - 0.22,
      contact: Math.max(c.t, s.t),
      power: s.power(),
    };
    return timing;
  }

  /** A swing at nothing still swings the racket. */
  private whiff(t: number, stroke: Stroke) {
    const sw = this.you.swing;
    if (sw && this.time < sw.contact + 0.35) return;
    this.you.swing = { stroke, start: t, contact: t + 0.22, power: 0.4 };
    this.events.push({ kind: "whiff", t });
  }

  private yourHit() {
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    const power = p.power();
    const plan = yourShot({
      power,
      aim: p.aim(),
      timing: p.timing,
      stroke: p.stroke,
    });
    const from = { ...this.ball.p };
    const launch =
      plan.result === "net"
        ? planNetShot(from, plan.netX ?? 0, plan.flight)
        : planShot(
            from,
            plan.target,
            plan.flight,
            plan.result === "in" ? 0.35 : 0.6,
          );
    this.ball = newBall(from);
    this.ball.v = launch.v;
    this.ball.spin = 25 + power * 40;
    this.hitter = "you";
    this.lastShot = plan.result;
    this.hits += 1;
    if (this.you.swing) this.you.swing.power = power;
    this.events.push({
      kind: "hit",
      who: "you",
      t: this.time,
      power,
      stroke: p.stroke,
      timing: p.timing,
      at: from,
    });
    this.incoming = null;
    if (plan.result === "in") this.setIncoming("cpu");
    // The computer drifts back towards the middle while it waits.
    else {
      this.cpu.tx = HOME.cpu.x;
      this.cpu.tz = HOME.cpu.z;
    }
  }

  private cpuHit() {
    const from = { ...this.ball.p };
    const shot = computerShot(this.rally, this.rnd);
    const { v } = planShot(from, shot.target, shot.flight);
    this.ball = newBall(from);
    this.ball.v = v;
    this.ball.spin = 30;
    this.hitter = "cpu";
    this.events.push({
      kind: "hit",
      who: "cpu",
      t: this.time,
      power: Math.min(1, 0.3 + this.rally / 30),
      stroke: this.cpu.side,
      at: from,
    });
    this.incoming = null;
    this.setIncoming("you");
    // Back towards the middle for the next one.
    this.cpu.tx = HOME.cpu.x * 0.5 + from.x * 0.25;
    this.cpu.tz = HOME.cpu.z;
  }

  private endPoint(reason: EndReason, delay: number) {
    if (this.overAt >= 0) return;
    this.overAt = this.time + delay;
    this.overReason = reason;
    this.incoming = null;
    this.pending = null;
  }

  private finishPoint() {
    const best = this.rally > this.best;
    if (best) this.best = this.rally;
    this.last = { reason: this.overReason, rally: this.rally, best };
    this.phase = "over";
    this.events.push({
      kind: "over",
      t: this.time,
      reason: this.overReason,
      rally: this.rally,
      best,
      at: { ...this.ball.p },
    });
    this.serveAt = this.time + OVER_PAUSE;
  }

  step(rawDt: number) {
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    this.time += dt;
    const now = this.time;
    movePlayer(this.you, dt);
    movePlayer(this.cpu, dt);

    if (this.phase === "start") return;
    if (this.phase === "over") {
      if (now < this.serveAt) {
        stepBall(this.ball, dt);
        return;
      }
      this.newPoint();
    }
    if (this.currentPhase() === "serve") {
      if (now < this.serveAt) return;
      this.serve();
    }

    // Your hit lands when the ball arrives (an early or perfect swing), or
    // straight away for a late one.
    const inc = this.incoming;
    if (inc && inc.who === "you" && this.pending) {
      if (now >= Math.max(inc.t, this.pending.t)) this.yourHit();
    } else if (inc && inc.who === "you" && now > inc.t + WINDOW.late) {
      this.endPoint("miss", MISS_PAUSE);
    } else if (inc && inc.who === "cpu" && now >= inc.t) {
      this.cpuHit();
    }

    this.ballEvents.length = 0;
    stepBall(this.ball, dt, this.ballEvents);
    this.ballEvents.forEach((e) => {
      if (e.kind === "net") {
        this.events.push({ kind: "net", t: now, x: e.x, y: e.y });
        if (this.hitter === "you") this.endPoint("net", 0.9);
        return;
      }
      const target = this.hitter === "you" ? "opponent" : "player";
      const first = this.ball.bounces === 1 && !this.ball.netted;
      const isIn = first ? landsIn(e.x, e.z, target) : true;
      this.events.push({
        kind: "bounce",
        t: now,
        x: e.x,
        z: e.z,
        speed: e.speed,
        in: isIn,
      });
      if (!first || this.overAt >= 0) return;
      if (this.hitter === "you") {
        if (isIn) {
          this.rally += 1;
          this.events.push({ kind: "rally", t: now, rally: this.rally });
        } else this.endPoint("out", 0.5);
      }
    });
    if (this.overAt >= 0 && now >= this.overAt) this.finishPoint();
  }

  /** Seconds until the serve goes (0 when not waiting to serve). */
  serveIn() {
    return this.phase === "serve" ? Math.max(0, this.serveAt - this.time) : 0;
  }

  /** The phase (read fresh: the calls above change it). */
  currentPhase(): Phase {
    return this.phase;
  }

  /** Takes the events since the last call. */
  drain() {
    const out = this.events;
    this.events = [];
    return out;
  }
}
