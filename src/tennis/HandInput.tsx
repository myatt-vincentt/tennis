// Your swing, three ways:
//
//   - your hand in the camera: a quick swing of either hand hits (see
//     sim/swing.ts). Where the hand starts and which way it moves picks
//     forehand or backhand; its speed is the power and its sideways angle
//     the aim. Between swings, the side your hand is on tells your player
//     which side to set up on.
//   - a tap or click anywhere (not on a control) swings at that moment; a
//     quick swipe right after it aims the shot (left / right) and a fast
//     swipe hits harder.
//   - space or enter on a keyboard swings too.
//
// Hands follow their stable identity (the SDK's `poses.left` / `.right`);
// only fresh readings count.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { XRModel } from "@vincentt-xr/sdk";
import { HandTracker } from "@vincentt-xr/sdk/tracking";
import {
  useXRModelNode,
  type XRModelNodeHandTracking,
} from "@vincentt-xr/sdk/low-level";

import { sound } from "./audio";
import type { Stroke } from "./sim/shots";
import {
  SwingReader,
  swingAim,
  swingPower,
  type HandSample,
} from "./sim/swing";
import { tennis } from "./state";

/** Hand readings per second: swings are quick, so more than usual. */
const HAND_FPS = 30;
/** Camera and tracking delay before a reading exists (s), taken off swing times. */
const LATENCY = 0.05;
/** The hand's side of the body has to pass this far (screen heights) to switch. */
const SIDE_HYSTERESIS = 0.035;

type Side = "left" | "right";
const SIDES: Side[] = ["left", "right"];

/** What the camera frame draws for each hand. */
export type HandMark = {
  /** Palm on screen, 0..1 (v down). */
  u: number;
  v: number;
  /** 0..1, fades in and out. */
  shown: number;
  /** performance.now() of its last swing. */
  swungAt: number;
};

export const hands: Record<Side, HandMark> & { active: Side } = {
  left: { u: 0.5, v: 0.5, shown: 0, swungAt: -1e9 },
  right: { u: 0.5, v: 0.5, shown: 0, swungAt: -1e9 },
  /** The hand you last swung or moved (the racket in first person follows it). */
  active: "right",
};

/**
 * Development only: readings to use instead of the tracker's
 * (window.__tennis.fakeHand), in tracker units: x right, y up (−1..1), and
 * the palm length as a share of the screen height.
 */
export const devHands: Partial<
  Record<Side, { x: number; y: number; size: number; stamp: number } | null>
> = {};

/** Swings read so far (for the debug readout). */
export const swingLog: {
  t: number;
  side: Side;
  speed: number;
  stroke: Stroke;
  timing: string | null;
}[] = [];

type Pose = NonNullable<NonNullable<XRModelNodeHandTracking["poses"]>["left"]>;
const PALM = [0, 5, 9, 13, 17];

/** One reading of a hand: palm centre and size in screen heights. */
const readPose = (pose: Pose, aspect: number) => {
  const pts = pose.image;
  let x = 0;
  let y = 0;
  PALM.forEach((i) => {
    x += pts[i].x;
    y += pts[i].y;
  });
  x /= PALM.length;
  y /= PALM.length;
  const d = (a: number, b: number) =>
    Math.hypot(
      (pts[a].x - pts[b].x) * 0.5 * aspect,
      (pts[a].y - pts[b].y) * 0.5,
    );
  return {
    tx: x,
    ty: y,
    x: x * 0.5 * aspect,
    y: y * 0.5,
    size: Math.max(d(0, 9), d(5, 17) * 1.15),
  };
};

export const HandInput = () => {
  const node = useXRModelNode<XRModelNodeHandTracking>(XRModel.HAND_TRACKER);
  const size = useThree((s) => s.size);
  const readers = useRef({ left: new SwingReader(), right: new SwingReader() });
  const stamps = useRef<Record<Side, number>>({ left: -1, right: -1 });
  const sideOf = useRef<Record<Side, Stroke | null>>({
    left: null,
    right: null,
  });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const aspect = size.width / Math.max(1, size.height);
    const { game } = tennis;
    const nowS = performance.now() / 1000;
    SIDES.forEach((side) => {
      const fake = devHands[side];
      const pose = node?.poses?.[side] ?? null;
      let reading:
        | (ReturnType<typeof readPose> & { stamp: number; right: boolean })
        | null = null;
      if (fake !== undefined) {
        if (fake)
          reading = {
            tx: fake.x,
            ty: fake.y,
            x: fake.x * 0.5 * aspect,
            y: fake.y * 0.5,
            size: fake.size,
            stamp: fake.stamp,
            right: side === "right",
          };
      } else if (pose && !pose.held) {
        reading = {
          ...readPose(pose, aspect),
          stamp: pose.timestampMs,
          right: pose.handedness === "right",
        };
      }
      const mark = hands[side];
      mark.shown += ((reading ? 1 : 0) - mark.shown) * (1 - Math.exp(-dt * 10));
      if (!reading) {
        if (stamps.current[side] >= 0 && !pose) readers.current[side].reset();
        return;
      }
      mark.u = reading.tx * 0.5 + 0.5;
      mark.v = 0.5 - reading.ty * 0.5;
      if (reading.stamp === stamps.current[side]) return;
      stamps.current[side] = reading.stamp;

      const sample: HandSample = {
        t: reading.stamp / 1000,
        x: reading.x,
        y: reading.y,
        size: reading.size,
      };
      const reader = readers.current[side];
      const swing = reader.push(sample);

      // Between swings: the side your hand is on sets your player up.
      const hand = reading.right ? 1 : -1;
      const out = reading.x * hand;
      const was = sideOf.current[side];
      let now: Stroke | null = was;
      if (out > SIDE_HYSTERESIS) now = "forehand";
      else if (out < -SIDE_HYSTERESIS) now = "backhand";
      else if (!was) now = out >= 0 ? "forehand" : "backhand";
      sideOf.current[side] = now;
      if (reader.speed > 3) hands.active = side;
      if (now && hands.active === side && game.phase === "rally")
        game.aimSide(now);

      if (!swing) return;
      hands.active = side;
      mark.swungAt = performance.now();
      // The swing's side: where it began, and which way it went (a forehand
      // of the right hand starts on the right and sweeps left).
      const score = hand * (swing.startX * 12 - swing.dir.x);
      const stroke: Stroke = score >= 0 ? "forehand" : "backhand";
      let age = nowS - sample.t;
      if (!(age >= 0 && age < 0.5)) age = 0;
      const timing = game.swing({
        t: game.time - age - LATENCY,
        power: () => swingPower(swing.speed),
        aim: () => swingAim(swing.dir),
        stroke,
      });
      swingLog.push({ t: game.time, side, speed: swing.speed, stroke, timing });
      if (swingLog.length > 50) swingLog.shift();
    });
  });

  return <HandTracker targetFps={HAND_FPS} />;
};

/** Is this event on a control (a chip, the media switcher…), not the court? */
const onControl = (e: Event) => {
  const el = e.target as HTMLElement | null;
  return !!el?.closest?.(
    "[data-hud], button, select, input, a, [role='button']",
  );
};

/** Tap, click, swipe and keyboard swings. */
export const TapInput = () => {
  useEffect(() => {
    let down: {
      x: number;
      y: number;
      t: number;
      aim: number;
      power: number;
    } | null = null;
    const swingNow = (drag: () => { aim: number; power: number }) => {
      const { game } = tennis;
      sound.unlock();
      if (game.phase === "start") {
        game.start();
        tennis.changed();
        return;
      }
      // The stroke follows where the ball is (the game picks it).
      game.swing({
        t: game.time,
        power: () => drag().power,
        aim: () => drag().aim,
        stroke: null,
      });
    };
    const onDown = (e: PointerEvent) => {
      if (onControl(e)) return;
      const d = {
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        aim: 0,
        power: 0.55,
      };
      down = d;
      swingNow(() => d);
    };
    const onMove = (e: PointerEvent) => {
      const d = down;
      if (!d) return;
      const ms = performance.now() - d.t;
      if (ms > 350) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 18) return;
      // A swipe: its sideways share aims, its speed adds power.
      d.aim = Math.max(-1, Math.min(1, (dx / dist) * 1.1));
      const pxPerS = dist / Math.max(0.03, ms / 1000);
      d.power = Math.min(1, 0.5 + pxPerS / 4000);
    };
    const onUp = () => {
      down = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== " " && e.key !== "Enter")) return;
      if (onControl(e)) return;
      e.preventDefault();
      swingNow(() => ({ aim: 0, power: 0.55 }));
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
};
