// The page UI, minimal, on Night glass:
//   - the rally count, big in Arles, top centre, with your best under it
//   - top right, under your camera: the view chip (a camera; each tap goes to the next view:
//     behind, first person, side) and the day / night chip (sun / moon)
//   - after a hit, a small timing word pops up: Perfect, Good, Early, Late
//   - after a rally, a short card: "Rally 7" and why it ended (Out, Net,
//     Missed), or "New best"
//   - before the first serve: a softly pulsing "Tap to play" button. That
//     tap turns the sound on and starts the first serve.
import type { ReactNode } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";

import { sound } from "./audio";
import { frameRect, pinToScreen } from "./layout";
import {
  nextView,
  setNight,
  tennis,
  useTennisVersion,
  type View,
} from "./state";

const ARLES = "#f4d968";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const CSS = `
.tn-root { position: absolute; inset: 0; pointer-events: none; color: #fff;
  -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.tn-glass { background: rgb(35 37 40 / .64);
  backdrop-filter: blur(20px) saturate(1.5); -webkit-backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid rgb(235 246 253 / .18);
  box-shadow: inset 0 1px 1px rgb(255 255 255 / .22), 0 8px 24px rgb(0 0 0 / .22); }
.tn-strong { background: rgb(35 37 40 / .82); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .tn-glass { background: rgb(35 37 40 / .82); } }
.tn-scrim { position: absolute; left: 0; right: 0; top: 0; height: 120px;
  background: linear-gradient(rgb(35 37 40 / .4), rgb(35 37 40 / 0)); }
.tn-rally { position: absolute; left: 50%; top: 16px; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 0;
  padding: 6px 18px 7px; border-radius: 18px; min-width: 76px; }
.tn-label { font: 600 11px/1 system-ui, -apple-system, sans-serif; letter-spacing: .14em;
  text-transform: uppercase; opacity: .9; }
.tn-count { font: 700 40px/1.05 system-ui, -apple-system, sans-serif; color: ${ARLES};
  font-variant-numeric: tabular-nums; }
.tn-count.bump { animation: tn-bump 260ms ${EASE}; }
@keyframes tn-bump { from { transform: scale(1.18); } to { transform: scale(1); } }
.tn-best { font: 600 13px/1 system-ui, -apple-system, sans-serif; opacity: .85;
  font-variant-numeric: tabular-nums; margin-top: 2px; }
.tn-chips { position: absolute; right: 16px; display: flex; gap: 8px; }
.tn-btn { pointer-events: auto; border: 0; padding: 0; margin: 0; color: inherit;
  display: grid; place-items: center; cursor: pointer; outline: none; touch-action: manipulation;
  width: 44px; height: 44px; border-radius: 50%; transition: transform 160ms ease-out; }
.tn-btn:active { transform: scale(0.94); }
.tn-btn:focus-visible { box-shadow: 0 0 0 2px ${ARLES}; }
.tn-btn .tn-view { position: absolute; bottom: -2px; right: -2px; width: 18px; height: 18px;
  border-radius: 50%; background: ${ARLES}; color: #232528; display: grid; place-items: center;
  font: 700 10px/1 system-ui, -apple-system, sans-serif; }
.tn-btn { position: relative; }
.tn-pop { position: absolute; left: 50%; top: 64%; transform: translate(-50%, -50%);
  padding: 6px 16px; border-radius: 999px; font: 700 24px/1.1 system-ui, -apple-system, sans-serif;
  white-space: nowrap; animation: tn-pop 900ms ${EASE} forwards; }
.tn-pop.perfect { color: ${ARLES}; }
@keyframes tn-pop {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(.9); }
  18% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  70% { opacity: 1; transform: translate(-50%, -60%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -70%) scale(1); } }
.tn-result { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 14px 26px 12px; border-radius: 22px; animation: tn-in 320ms ${EASE} both; }
.tn-result .big { font: 700 34px/1.05 system-ui, -apple-system, sans-serif; color: ${ARLES};
  font-variant-numeric: tabular-nums; white-space: nowrap; }
.tn-result .why { font: 600 14px/1.2 system-ui, -apple-system, sans-serif; opacity: .92; }
@keyframes tn-in { from { opacity: 0; transform: translate(-50%, -42%); } to { opacity: 1; transform: translate(-50%, -50%); } }
.tn-start { pointer-events: auto; position: absolute; left: 50%; top: 58%;
  transform: translate(-50%, -50%); display: flex; align-items: center; gap: 10px;
  padding: 0 24px 0 18px; height: 52px; border-radius: 999px; cursor: pointer;
  font: 600 16px/1 system-ui, -apple-system, sans-serif; color: #fff; }
.tn-start::after { content: ""; position: absolute; inset: -1px; border-radius: 999px;
  border: 2px solid ${ARLES}; animation: tn-pulse 1.8s ${EASE} infinite; pointer-events: none; }
@keyframes tn-pulse { from { transform: scale(1); opacity: .9; } to { transform: scale(1.25, 1.6); opacity: 0; } }
.tn-ball { width: 22px; height: 22px; border-radius: 50%; background: #d9f04a;
  box-shadow: inset -3px -3px 5px rgb(0 0 0 / .25); position: relative; overflow: hidden; }
.tn-ball::before, .tn-ball::after { content: ""; position: absolute; width: 22px; height: 22px;
  border-radius: 50%; border: 2px solid rgb(255 255 255 / .9); }
.tn-ball::before { left: -14px; top: 0; }
.tn-ball::after { right: -14px; top: 0; }
@media (prefers-reduced-motion: reduce) {
  .tn-start::after { animation: none; }
  .tn-count.bump { animation: none; } }
`;

const Icon = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width={20}
    height={20}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const CameraIcon = () => (
  <Icon>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);
const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);
const MoonIcon = () => (
  <Icon>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </Icon>
);

const VIEW_MARK: Record<View, string> = { behind: "1", first: "2", side: "3" };
const VIEW_NAME: Record<View, string> = {
  behind: "View: behind the player",
  first: "View: first person",
  side: "View: side",
};
const WHY = { miss: "Missed", out: "Out", net: "Net" } as const;
const TIMING_WORD = {
  perfect: "Perfect",
  good: "Good",
  early: "Early",
  late: "Late",
} as const;

export const Hud = () => {
  useTennisVersion();
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const { game, pop, result } = tennis;
  const started = game.phase !== "start";
  const frame = frameRect(width, height);

  return (
    <Html
      fullscreen
      calculatePosition={pinToScreen}
      zIndexRange={[30, 0]}
      style={{ pointerEvents: "none" }}
    >
      <style>{CSS}</style>
      <div className="tn-root">
        <div className="tn-scrim" />
        <div className="tn-rally tn-glass" aria-live="polite">
          <div className="tn-label">Rally</div>
          <div
            key={game.rally}
            className={`tn-count ${game.rally > 0 ? "bump" : ""}`}
          >
            {game.rally}
          </div>
          <div className="tn-best">Best {game.best}</div>
        </div>
        <div
          className="tn-chips"
          style={{ top: frame.top + frame.height + 10 }}
        >
          <button
            type="button"
            data-hud="view"
            className="tn-btn tn-glass"
            aria-label={VIEW_NAME[tennis.view]}
            onClick={() => nextView()}
          >
            <CameraIcon />
            <span className="tn-view">{VIEW_MARK[tennis.view]}</span>
          </button>
          <button
            type="button"
            data-hud="court"
            className="tn-btn tn-glass"
            aria-label={
              tennis.night
                ? "Night court (tap for day)"
                : "Day court (tap for night)"
            }
            onClick={() => setNight(!tennis.night)}
          >
            {tennis.night ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
        {pop ? (
          <div key={pop.id} className={`tn-pop tn-glass ${pop.timing}`}>
            {TIMING_WORD[pop.timing]}
          </div>
        ) : null}
        {result ? (
          <div key={result.id} className="tn-result tn-glass tn-strong">
            <div className="big">Rally {result.rally}</div>
            <div className="why">
              {result.best ? "New best" : WHY[result.reason]}
            </div>
          </div>
        ) : null}
        {!started ? (
          <button
            type="button"
            data-hud="start"
            className="tn-start tn-glass"
            onClick={() => {
              sound.unlock();
              game.start();
              tennis.changed();
            }}
          >
            <span className="tn-ball" aria-hidden="true" />
            Tap to play
          </button>
        ) : null}
      </div>
    </Html>
  );
};
