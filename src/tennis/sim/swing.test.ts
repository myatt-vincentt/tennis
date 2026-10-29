import { describe, expect, it } from "vitest";

import { SwingReader, swingAim, swingPower, type HandSample } from "./swing";
import { seeded } from "./game";

const PALM = 0.08; // palm length, screen heights

/** Readings at `hz` from a path x(t), y(t) over `seconds`. */
const sample = (
  hz: number,
  seconds: number,
  at: (t: number) => { x: number; y: number; size?: number },
) => {
  const out: HandSample[] = [];
  for (let i = 0; i <= seconds * hz; i += 1) {
    const t = i / hz;
    const p = at(t);
    out.push({ t, x: p.x, y: p.y, size: p.size ?? PALM });
  }
  return out;
};

const feed = (samples: HandSample[]) => {
  const r = new SwingReader();
  return samples.map((s) => r.push(s)).filter((s) => s !== null);
};

/** A forehand: hand still, then a quick sweep to the left (~0.25 s), then still. */
const forehand = (t: number) => {
  const k = Math.min(1, Math.max(0, (t - 0.5) / 0.25));
  const e = k * k * (3 - 2 * k);
  return { x: 0.25 - 0.5 * e, y: -0.05 + 0.08 * e };
};

describe("swing reader", () => {
  it("reads one quick swing as one swing, at 30 and 15 readings a second", () => {
    for (const hz of [30, 15]) {
      const swings = feed(sample(hz, 1.5, forehand));
      expect(swings).toHaveLength(1);
      const s = swings[0]!;
      expect(s.t).toBeGreaterThan(0.5);
      expect(s.t).toBeLessThan(0.75);
      expect(s.dir.x).toBeLessThan(-0.8);
      expect(swingAim(s.dir)).toBeLessThan(-0.5);
      expect(s.startX).toBeGreaterThan(0.15);
      expect(swingPower(s.speed)).toBeGreaterThan(0.2);
    }
  });

  it("ignores a hand drifting slowly, even a long way", () => {
    expect(
      feed(
        sample(30, 6, (t) => ({ x: -0.4 + t * 0.12, y: Math.sin(t) * 0.05 })),
      ),
    ).toHaveLength(0);
  });

  it("ignores a still hand with tracking jitter", () => {
    const rnd = seeded(4);
    const jitter = sample(30, 8, () => ({
      x: (rnd() - 0.5) * PALM * 0.4,
      y: (rnd() - 0.5) * PALM * 0.4,
    }));
    expect(feed(jitter)).toHaveLength(0);
  });

  it("ignores a one-reading jump (a lost or swapped hand)", () => {
    const s = sample(30, 2, (t) => ({ x: t > 1 && t < 1.04 ? 0.6 : 0, y: 0 }));
    expect(feed(s)).toHaveLength(0);
  });

  it("ignores a gentle wave (about 10 palm lengths a second)", () => {
    // Side to side, 0.08 screen heights each way, once a second.
    const wave = (t: number) => ({ x: 0.08 * Math.sin(t * Math.PI * 2), y: 0 });
    expect(feed(sample(30, 6, wave))).toHaveLength(0);
  });

  it("ignores a clip looping back (the hand jumps in one reading)", () => {
    // A slow drift, and every second a jump of 3 palm lengths in one step.
    const s = sample(30, 4, (t) => ({
      x: (t % 1) * 0.04 + (Math.floor(t) % 2) * 0.24,
      y: 0,
    }));
    expect(feed(s)).toHaveLength(0);
  });

  it("reads a push towards the camera as a swing", () => {
    const push = (t: number) => {
      // A hard punch at the camera: the palm grows 2.6× in 0.15 s.
      const k = Math.min(1, Math.max(0, (t - 0.5) / 0.15));
      return { x: 0, y: 0, size: PALM * (1 + 1.6 * k) };
    };
    const swings = feed(sample(30, 1.2, push));
    expect(swings).toHaveLength(1);
    expect(swings[0]!.dir.f).toBeGreaterThan(0.8);
    expect(Math.abs(swingAim(swings[0]!.dir))).toBeLessThan(0.2);
  });

  it("two swings need the rest between them", () => {
    // Back-and-forth wave: right, left, right… every 0.3 s.
    const wave = (t: number) => ({
      x: 0.2 * Math.sin(t * Math.PI * 2 * 1.6),
      y: 0,
    });
    const waves = feed(sample(30, 3, wave));
    expect(waves.length).toBeGreaterThan(2);
    // Never more than one per rest period.
    for (let i = 1; i < waves.length; i += 1)
      expect(waves[i]!.t - waves[i - 1]!.t).toBeGreaterThanOrEqual(0.299);
  });
});
