// The three views, switched with the camera chip:
//   behind  the classic broadcast view from behind your end, a bit above,
//           drifting gently with your player
//   first   your own eyes, with your racket in front following your hand
//   side    the broadcast side view across the whole court
// Switching glides the camera from where it is to the new view (strict
// ease-out). Each view keeps the court's width on screen on a narrow phone
// by moving back (or widening a little), never by cropping the court.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type PerspectiveCamera } from "three";

import { easeOut } from "./look";
import { viewPose, type CameraPose } from "./sim/views";
import { tennis } from "./state";

const GLIDE = 0.9;

/** Development only: a fixed camera instead of the views (null = the views). */
export const cameraOverride: { pose: CameraPose | null } = { pose: null };

const newPose = (): CameraPose => ({
  pos: new Vector3(),
  target: new Vector3(),
  fov: 45,
});

export const CameraRig = () => {
  const from = useMemo(newPose, []);
  const live = useMemo(newPose, []);
  const cur = useMemo(newPose, []);
  const switching = useRef({ view: tennis.view, at: -10, started: false });

  useFrame(({ camera, size }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const sw = switching.current;
    const now = performance.now() / 1000;
    if (sw.view !== tennis.view) {
      // Glide from wherever the camera is right now.
      from.pos.copy(cur.pos);
      from.target.copy(cur.target);
      from.fov = cur.fov;
      sw.view = tennis.view;
      sw.at = now;
    }
    viewPose(tennis.view, aspect, tennis.game.you, tennis.game.ball.p, live);
    if (!sw.started) {
      cur.pos.copy(live.pos);
      cur.target.copy(live.target);
      cur.fov = live.fov;
      sw.started = true;
    }
    const k = easeOut((now - sw.at) / GLIDE);
    if (k < 1) {
      cur.pos.copy(from.pos).lerp(live.pos, k);
      cur.target.copy(from.target).lerp(live.target, k);
      cur.fov = from.fov + (live.fov - from.fov) * k;
    } else {
      // Settled: follow the view smoothly.
      const f = 1 - Math.exp(-dt * 6);
      cur.pos.lerp(live.pos, f);
      cur.target.lerp(live.target, f);
      cur.fov += (live.fov - cur.fov) * f;
    }
    const shown = cameraOverride.pose ?? cur;
    cam.position.copy(shown.pos);
    cam.lookAt(shown.target);
    if (Math.abs(cam.fov - shown.fov) > 0.01 || cam.near !== 0.05) {
      cam.fov = shown.fov;
      cam.near = 0.05;
      cam.far = 900;
      cam.updateProjectionMatrix();
    }
  });
  return null;
};
