// Shared state: the one game, the view and court settings, and a small
// change signal so the HUD re-renders only when something it shows changes.
import { useSyncExternalStore } from "react";

import { Game, type GameEvent } from "./sim/game";
import type { Timing } from "./sim/shots";

import type { View } from "./sim/views";

export type { View };
export const VIEWS: View[] = ["behind", "first", "side"];

const BEST_KEY = "tennis.bestRally";

const readBest = () => {
  try {
    const n = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
};

export const saveBest = (n: number) => {
  try {
    window.localStorage.setItem(BEST_KEY, String(n));
  } catch {
    // Private mode or storage off: the best lasts for this visit only.
  }
};

/** A timing word popping up after a hit. */
export type Pop = { id: number; timing: Timing; at: number };

/** The rally result shown after a point. */
export type Result = {
  id: number;
  reason: "miss" | "out" | "net";
  rally: number;
  best: boolean;
};

const listeners = new Set<() => void>();
const gameListeners = new Set<(e: GameEvent) => void>();

/** Hears every game event (hits, bounces, the end of a rally…). */
export const onGameEvents = (l: (e: GameEvent) => void) => {
  gameListeners.add(l);
  return () => {
    gameListeners.delete(l);
  };
};

/** Hands one event to every listener. */
export const sendGameEvent = (e: GameEvent) =>
  gameListeners.forEach((l) => l(e));
let version = 0;

export const tennis = {
  game: new Game(Math.floor(Math.random() * 1e9), readBest()),
  view: "behind" as View,
  night: false,
  /** The latest timing pop and rally result (null = none showing). */
  pop: null as Pop | null,
  result: null as Result | null,
  /** Game speed (1 = normal; development uses others for slow motion). */
  timeScale: 1,
  /** True once you have hit the ball yourself (the hint goes for good). */
  hitOnce: false,
  /** Bumps on every change the HUD shows. */
  changed() {
    version += 1;
    listeners.forEach((l) => l());
  },
};

export const setView = (v: View) => {
  tennis.view = v;
  tennis.changed();
};

export const nextView = () =>
  setView(VIEWS[(VIEWS.indexOf(tennis.view) + 1) % VIEWS.length]);

export const setNight = (on: boolean) => {
  tennis.night = on;
  tennis.changed();
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Re-renders the caller when the HUD state changes. */
export const useTennisVersion = () =>
  useSyncExternalStore(subscribe, () => version);
