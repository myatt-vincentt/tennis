import { describe, expect, it } from "vitest";

import { Game, type GameEvent } from "./game";
import { landsIn } from "./court";
import { gradeTiming, yourShot } from "./shots";

const DT = 1 / 60;

type Plan = (
  n: number,
) => { offset: number; power: number; aim: number } | null;

/** Plays the game with a scripted swinger until `stop` or the time runs out. */
const play = (
  game: Game,
  plan: Plan,
  seconds: number,
  stop?: (e: GameEvent) => boolean,
) => {
  const events: GameEvent[] = [];
  let swungFor = -1;
  let ball = 0;
  for (let i = 0; i < seconds / DT; i += 1) {
    const inc = game.incoming;
    if (inc && inc.who === "you" && inc.t !== swungFor) {
      const p = plan(ball);
      if (!p) {
        swungFor = inc.t;
        ball += 1;
      } else if (game.time >= inc.t + p.offset - DT / 2) {
        swungFor = inc.t;
        ball += 1;
        game.swing({
          t: game.time,
          power: () => p.power,
          aim: () => p.aim,
          stroke: null,
        });
      }
    }
    game.step(DT);
    const got = game.drain();
    events.push(...got);
    if (stop && got.some(stop)) break;
  }
  return events;
};

describe("timing", () => {
  it("grades the window", () => {
    expect(gradeTiming(0)).toBe("perfect");
    expect(gradeTiming(0.12)).toBe("good");
    expect(gradeTiming(-0.25)).toBe("early");
    expect(gradeTiming(0.2)).toBe("late");
    expect(gradeTiming(0.4)).toBeNull();
    expect(gradeTiming(-0.5)).toBeNull();
  });
});

describe("endless rally", () => {
  it("counts every return that lands in, speeds up, and keeps the best", () => {
    const game = new Game(7, 3);
    game.start();
    const events = play(
      game,
      () => ({ offset: 0, power: 0.6, aim: 0.3 }),
      120,
      (e) => e.kind === "rally" && e.rally >= 20,
    );
    const rallies = events
      .filter((e) => e.kind === "rally")
      .map((e) => (e as { rally: number }).rally);
    expect(rallies.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(rallies[rallies.length - 1]).toBeGreaterThanOrEqual(20);
    // The computer's shots get quicker: its ball speeds early vs late.
    const cpuHits = events.filter((e) => e.kind === "hit" && e.who === "cpu");
    expect(cpuHits.length).toBeGreaterThan(15);
    expect(events.some((e) => e.kind === "over")).toBe(false);
  });

  it("a missed ball ends the rally and the next serve follows", () => {
    const game = new Game(3, 0);
    game.start();
    const events = play(
      game,
      (n) => (n < 3 ? { offset: 0, power: 0.6, aim: 0 } : null),
      30,
      (e) => e.kind === "serve" && game.rally === 0 && game.last !== null,
    );
    const over = events.find((e) => e.kind === "over");
    expect(over).toMatchObject({ reason: "miss", rally: 3, best: true });
    expect(game.best).toBe(3);
  });

  it("a weak late swing goes into the net", () => {
    const game = new Game(5, 10);
    game.start();
    const events = play(
      game,
      () => ({ offset: 0.21, power: 0.1, aim: 0 }),
      20,
      (e) => e.kind === "over",
    );
    expect(events.find((e) => e.kind === "over")).toMatchObject({
      reason: "net",
      rally: 0,
      best: false,
    });
    expect(events.some((e) => e.kind === "net")).toBe(true);
  });

  it("a slapped early swing goes long and out", () => {
    const game = new Game(5, 10);
    game.start();
    const events = play(
      game,
      () => ({ offset: -0.25, power: 1, aim: 0 }),
      20,
      (e) => e.kind === "over",
    );
    expect(events.find((e) => e.kind === "over")).toMatchObject({
      reason: "out",
    });
  });

  it("a mistimed swing aimed wide goes out wide", () => {
    const game = new Game(5, 10);
    game.start();
    const events = play(
      game,
      () => ({ offset: 0.2, power: 0.6, aim: 1 }),
      20,
      (e) => e.kind === "over",
    );
    expect(events.find((e) => e.kind === "over")).toMatchObject({
      reason: "out",
    });
    const bounce = events.find((e) => e.kind === "bounce" && !e.in);
    expect(bounce).toBeTruthy();
  });

  it("perfect shots always land in", () => {
    for (let a = -1; a <= 1; a += 0.25)
      for (let p = 0; p <= 1; p += 0.25) {
        const s = yourShot({
          power: p,
          aim: a,
          timing: "perfect",
          stroke: "forehand",
        });
        expect(s.result).toBe("in");
        expect(landsIn(s.target.x, s.target.z, "opponent")).toBe(true);
      }
  });

  it("forehand and backhand follow the swing's side", () => {
    const game = new Game(9, 0);
    game.start();
    let strokes: string[] = [];
    let n = 0;
    for (let i = 0; i < 40 / DT && strokes.length < 4; i += 1) {
      const inc = game.incoming;
      if (inc && inc.who === "you" && game.time >= inc.t) {
        game.swing({
          t: game.time,
          power: () => 0.5,
          aim: () => 0,
          stroke: n % 2 ? "backhand" : "forehand",
        });
        n += 1;
      }
      game.step(DT);
      strokes = strokes.concat(
        game
          .drain()
          .filter((e) => e.kind === "hit" && e.who === "you")
          .map((e) => (e as { stroke: string }).stroke),
      );
    }
    expect(strokes).toEqual(["forehand", "backhand", "forehand", "backhand"]);
  });
});
