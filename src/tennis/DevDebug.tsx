// Dev only: keys and window.__tennis, for playing and checking without a
// camera.
//   1 / 2 / 3   behind / first person / side view
//   n           day ↔ night
//   p           autoplay with perfect timing on / off
//   m / x / o / w   the next ball: miss it / into the net / long / wide
// window.__tennis:
//   game, rally(), best(), stored(), phase(), view(v), night(on), start()
//   autoplay("perfect" | "good" | "early" | "late" | null)
//   force("miss" | "net" | "out" | "wide" | null)   the next ball only
//   stroke(s)     autoplay forehands / backhands only (null = by the ball)
//   handSwing(side, stroke)  a pretend hand swings at the next ball (read
//                 by the real swing reader, 30 readings a second)
//   drift(side, seconds)     a pretend hand drifts slowly (no swing should be read)
//   fakeHand(side, { x, y, size } | null | undefined)  hold a pretend hand
//   swings()      every swing read: time, hand, speed, stroke, timing
//   log           the last game events
//   meter(), peak(), resetPeak()  the sound level
//   detail(0 | 1 | 2 | null)  force the device detail level
//   speed(k), camera(pos, target, fov), pose(who, stroke, t), renderer()
// Scene.tsx lazy-imports this behind an inline NODE_ENV check, so it never
// reaches production.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import { Vector3 } from "three";

import { sound } from "./audio";
import { cameraOverride } from "./CameraRig";
import { detail } from "./quality";
import { devHands, swingLog } from "./HandInput";
import type { GameEvent } from "./sim/game";
import type { Stroke } from "./sim/shots";
import { onGameEvents, setNight, setView, tennis, type View } from "./state";

type Side = "left" | "right";
type Auto = "perfect" | "good" | "early" | "late" | null;
type Force = "miss" | "net" | "out" | "wide" | null;

const OFFSET: Record<Exclude<Auto, null>, number> = {
  perfect: 0,
  good: 0.12,
  early: -0.24,
  late: 0.2,
};

const DevDebug = () => {
  const gl = useThree((st) => st.gl);
  const auto = useRef<Auto>(null);
  const force = useRef<Force>(null);
  const strokeOnly = useRef<Stroke | null>(null);
  const swungFor = useRef(-1);
  const handPlan = useRef<{ side: Side; stroke: Stroke; for: number } | null>(
    null,
  );
  const drift = useRef<{ side: Side; until: number; t0: number } | null>(null);
  const lastStamp = useRef(0);
  const log = useRef<GameEvent[]>([]);

  useEffect(
    () =>
      onGameEvents((e) => {
        log.current.push(e);
        if (log.current.length > 400) log.current.shift();
      }),
    [],
  );

  useEffect(() => {
    const api = {
      get game() {
        return tennis.game;
      },
      rally: () => tennis.game.rally,
      best: () => tennis.game.best,
      stored: () => window.localStorage.getItem("tennis.bestRally"),
      phase: () => tennis.game.phase,
      view: (v: View) => setView(v),
      night: (on: boolean) => setNight(on),
      start: () => {
        sound.unlock();
        tennis.game.start();
        tennis.changed();
      },
      autoplay: (m: Auto) => {
        auto.current = m;
      },
      force: (f: Force) => {
        force.current = f;
      },
      stroke: (s: Stroke | null) => {
        strokeOnly.current = s;
      },
      handSwing: (side: Side, stroke: Stroke) => {
        handPlan.current = { side, stroke, for: -1 };
      },
      drift: (side: Side, seconds: number) => {
        drift.current = {
          side,
          until: performance.now() / 1000 + seconds,
          t0: performance.now() / 1000,
        };
      },
      fakeHand: (
        side: Side,
        h: { x: number; y: number; size: number } | null | undefined,
      ) => {
        if (h === undefined) delete devHands[side];
        else devHands[side] = h ? { ...h, stamp: performance.now() } : null;
      },
      swings: () => swingLog.map((s) => ({ ...s })),
      get log() {
        return log.current.map((e) => ({ ...e }));
      },
      hits: () => tennis.game.hits,
      meter: () => sound.meter(),
      peak: () => sound.peak,
      resetPeak: () => {
        sound.peak = 0;
      },
      soundOn: () => sound.running,
      /** Renderer facts: tone mapping, colour space, pixel ratio, draw calls. */
      renderer: () => ({
        toneMapping: gl.toneMapping,
        outputColorSpace: gl.outputColorSpace,
        pixelRatio: gl.getPixelRatio(),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        shadows: gl.shadowMap.enabled,
      }),
      /** Detail level 0 low, 1 medium, 2 high (null = follow the device). */
      detail: (n: number | null) => {
        detail.forced = n;
      },
      /** Game speed: 1 normal, 0 frozen, 0.25 slow motion. */
      speed: (k: number) => {
        tennis.timeScale = k;
      },
      /** A fixed camera (null = back to the views). */
      camera: (pos: number[] | null, target?: number[], fov = 40) => {
        cameraOverride.pose = pos
          ? {
              pos: new Vector3(...pos),
              target: new Vector3(...(target ?? [0, 1, 0])),
              fov,
            }
          : null;
      },
      /** Pose a player mid-swing: who, stroke, seconds from contact (− before). */
      pose: (who: "you" | "cpu", stroke: Stroke, fromContact: number) => {
        const p = who === "you" ? tennis.game.you : tennis.game.cpu;
        const t = tennis.game.time;
        p.swing = {
          stroke,
          start: t - fromContact - 0.4,
          contact: t - fromContact,
          power: 0.6,
        };
      },
    };
    (window as unknown as { __tennis: typeof api }).__tennis = api;
    const onKey = (e: KeyboardEvent) => {
      const views: Record<string, View> = {
        "1": "behind",
        "2": "first",
        "3": "side",
      };
      if (views[e.key]) setView(views[e.key]);
      else if (e.key === "n") setNight(!tennis.night);
      else if (e.key === "p") auto.current = auto.current ? null : "perfect";
      else if (e.key === "m") force.current = "miss";
      else if (e.key === "x") force.current = "net";
      else if (e.key === "o") force.current = "out";
      else if (e.key === "w") force.current = "wide";
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gl]);

  useFrame(() => {
    // Keep the loudest output level seen (window.__tennis.peak()).
    if (sound.running) sound.meter();
    const { game } = tennis;
    const inc = game.incoming;
    const nowS = performance.now() / 1000;

    // A fixed stroke also sets your player up on that side early.
    if (strokeOnly.current && game.phase === "rally")
      game.aimSide(strokeOnly.current);

    // Autoplay: swing at the planned moment of each ball coming to you.
    if (
      auto.current &&
      inc &&
      inc.who === "you" &&
      inc.t !== swungFor.current
    ) {
      const f = force.current;
      let offset = OFFSET[auto.current];
      let power = 0.6;
      let aim = (Math.random() - 0.5) * 0.8;
      if (f === "net") {
        offset = 0.2;
        power = 0.1;
      } else if (f === "out") {
        offset = -0.25;
        power = 1;
      } else if (f === "wide") {
        offset = 0.2;
        aim = 1;
      }
      if (f === "miss") {
        swungFor.current = inc.t;
        force.current = null;
      } else if (game.time >= inc.t + offset) {
        swungFor.current = inc.t;
        force.current = null;
        game.swing({
          t: game.time,
          power: () => power,
          aim: () => aim,
          stroke: strokeOnly.current,
        });
      }
    }

    // A pretend hand swinging at the next ball, read like a real one.
    const plan = handPlan.current;
    if (plan && inc && inc.who === "you") {
      if (plan.for < 0) plan.for = inc.t;
      // The fast part of the sweep lands on the contact moment.
      const u = (game.time - (inc.t - 0.06)) / 0.24;
      const k = Math.min(1, Math.max(0, u));
      const e = k * k * (3 - 2 * k);
      const dir = plan.stroke === "forehand" ? 1 : -1;
      const handSign = plan.side === "right" ? 1 : -1;
      const startX = 0.35 * dir * handSign;
      const x = startX - 0.7 * dir * handSign * e;
      if (nowS - lastStamp.current >= 1 / 30) {
        lastStamp.current = nowS;
        devHands[plan.side] = {
          x,
          y: -0.1 + 0.15 * e,
          size: 0.09,
          stamp: performance.now(),
        };
      }
      if (u > 1.6) {
        handPlan.current = null;
        delete devHands[plan.side];
      }
    }

    // A pretend hand drifting slowly, with a little jitter.
    const d = drift.current;
    if (d) {
      if (nowS > d.until) {
        drift.current = null;
        delete devHands[d.side];
      } else if (nowS - lastStamp.current >= 1 / 30) {
        lastStamp.current = nowS;
        const t = nowS - d.t0;
        devHands[d.side] = {
          x: Math.sin(t * 0.6) * 0.5 + (Math.random() - 0.5) * 0.01,
          y: Math.cos(t * 0.45) * 0.25 + (Math.random() - 0.5) * 0.01,
          size: 0.09,
          stamp: performance.now(),
        };
      }
    }
  });

  return null;
};

export default DevDebug;
