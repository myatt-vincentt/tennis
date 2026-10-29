// Day and night as one number, eased (0 = day, 1 = night), plus the colours
// both ends of it use. Everything that changes between them reads `look`.
import { Color } from "three";

export const look = {
  /** 0 day … 1 night, eased towards the chosen one. */
  night: 0,
  /** Seconds, the game clock for shaders. */
  time: 0,
  /** 0..1: how excited the crowd is right now (bob, claps). */
  cheer: 0,
};

export const PALETTE = {
  court: new Color("#2f62a6"),
  courtNight: new Color("#244d86"),
  apron: new Color("#3c8a5b"),
  apronNight: new Color("#2a6544"),
  wall: new Color("#1f5a3c"),
  stand: new Color("#b9c0c8"),
  seatsA: new Color("#2d4f8a"),
  seatsB: new Color("#e8ecf2"),
  skyTop: new Color("#5d9fe6"),
  skyLow: new Color("#d8ecfb"),
  nightTop: new Color("#050a1c"),
  nightLow: new Color("#1d2a4d"),
  you: {
    shirt: "#f4d968",
    shorts: "#2a2d33",
    band: "#ffffff",
    hair: "#3b2a20",
    long: false,
    shoe: "#ffffff",
    grip: "#2a2d33",
  },
  cpu: {
    shirt: "#e86f5a",
    shorts: "#f2f2f2",
    band: "#2a2d33",
    hair: "#17130f",
    long: true,
    shoe: "#2a2d33",
    grip: "#f2f2f2",
  },
  skin: ["#e9b892", "#a86f4c"],
  /** Crowd shirts. */
  crowd: [
    "#e86f5a",
    "#f4d968",
    "#5d9fe6",
    "#ffffff",
    "#2a2d33",
    "#7cc59a",
    "#c58bd8",
    "#f29d4b",
    "#e3e7ee",
    "#3a5fa0",
  ],
};

/** Strict ease-out (cubic). */
export const easeOut = (t: number) =>
  1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
