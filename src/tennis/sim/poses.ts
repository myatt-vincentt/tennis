// The players' key poses (ready, forehand, backhand, serve) and how a swing
// moves through them: wind back as the ball comes, accelerate into the
// contact moment, follow through over the shoulder, settle back to ready.
// Poses are in the player's own frame (facing +z, right hand at −x).
import type { PlayerState } from "./game";
import type { Stroke } from "./shots";

export type ArmPose = { dir: [number, number, number]; elbow: number };
export type Pose = { yaw: number; r: ArmPose; l: ArmPose; crouch: number };

export const POSES: Record<string, Pose> = {
  ready: {
    yaw: 0,
    r: { dir: [-0.2, -0.9, 0.35], elbow: 1.15 },
    l: { dir: [0.2, -0.9, 0.35], elbow: 1.3 },
    crouch: 0.25,
  },
  fhBack: {
    yaw: -0.85,
    r: { dir: [-0.75, -0.05, -0.65], elbow: 0.5 },
    l: { dir: [0.1, -0.3, 0.95], elbow: 0.6 },
    crouch: 0.4,
  },
  fhHit: {
    yaw: 0.15,
    r: { dir: [-0.6, -0.35, 0.7], elbow: 0.2 },
    l: { dir: [0.5, -0.6, 0.6], elbow: 0.5 },
    crouch: 0.35,
  },
  fhFollow: {
    yaw: 0.85,
    r: { dir: [0.55, 0.55, 0.6], elbow: 1.3 },
    l: { dir: [0.4, -0.7, 0.3], elbow: 0.9 },
    crouch: 0.2,
  },
  bhBack: {
    yaw: 0.95,
    r: { dir: [0.7, -0.3, -0.6], elbow: 0.3 },
    l: { dir: [0.75, -0.2, -0.55], elbow: 0.6 },
    crouch: 0.4,
  },
  bhHit: {
    yaw: -0.1,
    r: { dir: [0.55, -0.35, 0.75], elbow: 0.1 },
    l: { dir: [0.35, -0.45, 0.8], elbow: 0.5 },
    crouch: 0.35,
  },
  bhFollow: {
    yaw: -0.85,
    r: { dir: [-0.45, 0.6, 0.55], elbow: 1.2 },
    l: { dir: [-0.35, 0.55, 0.6], elbow: 1.3 },
    crouch: 0.2,
  },
  toss: {
    yaw: -0.4,
    r: { dir: [-0.6, 0.5, -0.6], elbow: 1.2 },
    l: { dir: [0.1, 1, 0.15], elbow: 0.05 },
    crouch: 0.3,
  },
  serveHit: {
    yaw: 0.2,
    r: { dir: [-0.15, 0.97, 0.3], elbow: 0.05 },
    l: { dir: [0.3, -0.5, 0.7], elbow: 0.8 },
    crouch: 0.1,
  },
  serveFollow: {
    yaw: 0.6,
    r: { dir: [0.45, -0.55, 0.65], elbow: 0.6 },
    l: { dir: [0.3, -0.7, 0.4], elbow: 0.9 },
    crouch: 0.35,
  },
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
const easeIn = (t: number) => clamp01(t) ** 2;
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Blends two poses into `out`. */
export const mixPose = (a: Pose, b: Pose, t: number, out: Pose) => {
  const k = clamp01(t);
  const lerp = (x: number, y: number) => x + (y - x) * k;
  out.yaw = lerp(a.yaw, b.yaw);
  out.crouch = lerp(a.crouch, b.crouch);
  out.r.elbow = lerp(a.r.elbow, b.r.elbow);
  out.l.elbow = lerp(a.l.elbow, b.l.elbow);
  for (let i = 0; i < 3; i += 1) {
    out.r.dir[i] = lerp(a.r.dir[i], b.r.dir[i]);
    out.l.dir[i] = lerp(a.l.dir[i], b.l.dir[i]);
  }
  return out;
};

export const copyPose = (p: Pose): Pose => ({
  yaw: p.yaw,
  crouch: p.crouch,
  r: { dir: [...p.r.dir], elbow: p.r.elbow },
  l: { dir: [...p.l.dir], elbow: p.l.elbow },
});

/** The pose at time `t` for a swing (or none). */
const STROKE_POSES: Record<Stroke | "serve", [Pose, Pose, Pose]> = {
  serve: [POSES.toss, POSES.serveHit, POSES.serveFollow],
  forehand: [POSES.fhBack, POSES.fhHit, POSES.fhFollow],
  backhand: [POSES.bhBack, POSES.bhHit, POSES.bhFollow],
};

export const swingPose = (
  s: PlayerState["swing"],
  t: number,
  serve: boolean,
  out: Pose,
) => {
  if (!s) return mixPose(POSES.ready, POSES.ready, 0, out);
  const kind: Stroke | "serve" = serve ? "serve" : s.stroke;
  const [back, hit, follow] = STROKE_POSES[kind];
  const span = Math.max(0.12, s.contact - s.start);
  if (t < s.start) return mixPose(POSES.ready, POSES.ready, 0, out);
  if (t < s.contact) {
    const u = (t - s.start) / span;
    // Wind back, then accelerate into the ball.
    if (u < 0.55) return mixPose(POSES.ready, back, easeOut(u / 0.55), out);
    return mixPose(back, hit, easeIn((u - 0.55) / 0.45), out);
  }
  const after = t - s.contact;
  if (after < 0.28) return mixPose(hit, follow, easeOut(after / 0.28), out);
  if (after < 0.8)
    return mixPose(follow, POSES.ready, smooth((after - 0.28) / 0.52), out);
  return mixPose(POSES.ready, POSES.ready, 0, out);
};
