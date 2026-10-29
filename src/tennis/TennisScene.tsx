// Tennis: a 3D tennis court fills the screen and your real hand is the
// racket. Your player runs to the ball on their own; you time the swing.
// An endless rally against the computer, which gets quicker as it grows.
//
//   HandInput.tsx    your hand swings (and tap / click / swipe / keys)
//   sim/             the game: ball flight, shots, the swing reader, the rally
//   Stadium.tsx      sky, court, net, stands and crowd, floodlights, day/night
//   Players.tsx      the two players, running and swinging
//   Ball.tsx         the ball, its shadow, trail, bounce marks, timing ring
//   CameraRig.tsx    behind / first person / side views
//   Racket.tsx       your racket in the first-person view
//   CameraFrame.tsx  your camera in the top-left corner, with palm rings
//   Hud.tsx          rally count, chips, timing pops, the rally card, start
//   Hint.tsx         the wordless ghost-hand swing hint
//   audio.ts         the sound, made in code
import { Suspense } from "react";
import { useFrame } from "@react-three/fiber";

import { sound } from "./audio";
import { Ball } from "./Ball";
import { CameraFrame } from "./CameraFrame";
import { CameraRig } from "./CameraRig";
import { HandInput, TapInput } from "./HandInput";
import { Hint } from "./Hint";
import { Hud } from "./Hud";
import { look } from "./look";
import { Players } from "./Players";
import { Racket } from "./Racket";
import { rallyPressure } from "./sim/shots";
import { Stadium } from "./Stadium";
import { saveBest, sendGameEvent, tennis } from "./state";

/** Every so many returns on a long rally, the crowd goes "ooh". */
const OOH_FROM = 8;
const OOH_EVERY = 4;

/** Steps the game once a frame and turns its events into sound and HUD changes. */
const GameLoop = () => {
  useFrame((_, dt) => {
    const { game } = tennis;
    game.step(dt * tennis.timeScale);
    look.time = game.time;
    look.cheer = Math.max(0, look.cheer - Math.min(dt, 0.1) * 0.45);
    const events = game.drain();
    events.forEach((e) => {
      sendGameEvent(e);
      if (e.kind === "hit") {
        sound.pop(e.power, e.who === "you" ? 1 : 0.45);
        if (e.who === "you" && e.timing) {
          tennis.hitOnce = true;
          tennis.pop = { id: game.hits, timing: e.timing, at: e.t };
          tennis.changed();
        }
      } else if (e.kind === "bounce") {
        sound.bounce(e.speed, e.z > 0 ? 1 : 0.45);
      } else if (e.kind === "net") {
        sound.net();
      } else if (e.kind === "rally") {
        sound.setTension(rallyPressure(e.rally));
        if (e.rally >= OOH_FROM && e.rally % OOH_EVERY === 0) {
          sound.ooh(Math.min(1, e.rally / 24));
          look.cheer = Math.max(look.cheer, 0.35);
        }
        tennis.changed();
      } else if (e.kind === "over") {
        tennis.result = {
          id: Math.round(e.t * 1000),
          reason: e.reason,
          rally: e.rally,
          best: e.best,
        };
        if (e.best) {
          saveBest(game.best);
          sound.applause();
          look.cheer = 1;
        }
        sound.setTension(0);
        tennis.changed();
      } else if (e.kind === "serve") {
        tennis.result = null;
        tennis.pop = null;
        tennis.changed();
      }
    });
  });
  return null;
};

export const TennisScene = () => (
  <>
    <HandInput />
    <TapInput />
    <GameLoop />
    <CameraRig />
    <Stadium />
    <Players />
    <Ball />
    <Racket />
    <CameraFrame />
    <Hud />
    <Suspense fallback={null}>
      <Hint />
    </Suspense>
  </>
);
