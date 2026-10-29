// Where the camera sits for each view, given your player and the ball.
//   behind  a touch above your end, drifting with your player; on a narrow
//           screen it widens so the court's width still fits
//   first   your own eyes, looking down the court (wider on a narrow screen)
//   side    high over the side stand, looking down across the court; on a
//           narrow screen it shows a stretch and pans with the ball
import type { Vector3 } from "three";

export type View = "behind" | "first" | "side";

export type CameraPose = { pos: Vector3; target: Vector3; fov: number };

/** The live pose for a view. */
export const viewPose = (
  view: View,
  aspect: number,
  you: { x: number; z: number },
  ball: { x: number; z: number },
  out: CameraPose,
) => {
  if (view === "first") {
    out.pos.set(you.x + 0.12, 1.62, you.z + 0.05);
    out.target.set(you.x * 0.55 + ball.x * 0.2, 0.95, -9);
    // Wider on a narrow screen, so the court still fits.
    const hfov = 74;
    const vfov =
      (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / aspect) * 180) /
      Math.PI;
    out.fov = Math.min(88, Math.max(60, vfov));
    return out;
  }
  if (view === "side") {
    // High on the side, over the stand, looking down across the court.
    // Wide screens see all of it; narrow ones see a stretch and pan with
    // the ball.
    const dist = 22;
    const maxHalf = Math.tan((60 * Math.PI) / 360) * aspect * dist;
    const half = Math.min(15.5, maxHalf);
    const vfov = Math.max(
      34,
      (2 * Math.atan(half / (dist * aspect)) * 180) / Math.PI,
    );
    const room = 15.5 - half;
    const z = Math.max(-room, Math.min(room, ball.z * 0.9));
    out.pos.set(17.5, 14, z);
    out.target.set(0, 0, z);
    out.fov = vfov;
    return out;
  }
  // Behind: a touch above your end; keep ~16 m across at the far baseline
  // (wider on a narrow screen).
  const z = you.z + 6.6;
  const need = 8 / ((z + 11.9) * aspect);
  const vfov = Math.min(
    64,
    Math.max(44, (2 * Math.atan(need) * 180) / Math.PI),
  );
  out.pos.set(you.x * 0.45, 4.1, z);
  out.target.set(you.x * 0.25, 0.4, -4);
  out.fov = vfov;
  return out;
};
