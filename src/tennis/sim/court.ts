// The court, in metres. x runs across (right as you look from your end), y
// up, z along the court: your end is +z, the computer's is −z, the net is at
// z = 0. Real singles-court sizes, so the ball flies believably.

export const COURT = {
  /** Half the court's length (net to baseline). */
  halfLength: 11.885,
  /** Half the singles width (where the ball must land). */
  halfSingles: 4.115,
  /** Half the doubles width (only drawn). */
  halfDoubles: 5.485,
  /** Net to service line. */
  service: 6.4,
  /** Net height in the middle and at the posts. */
  netMiddle: 0.914,
  netPost: 1.07,
  /** The posts stand this far out from the middle. */
  postX: 6.4,
  /** The hard-court surround (the green apron) reaches this far. */
  apronX: 10.5,
  apronZ: 18.5,
} as const;

/** The ball's real radius (it is drawn a little bigger so it reads). */
export const BALL_RADIUS = 0.034;

/** Net height at a point across the court (it sags towards the middle). */
export const netHeight = (x: number) => {
  const k = Math.min(1, Math.abs(x) / COURT.postX);
  return COURT.netMiddle + (COURT.netPost - COURT.netMiddle) * k * k;
};

/** True if a bounce at (x, z) is inside the singles court on that half. */
export const landsIn = (x: number, z: number, side: "player" | "opponent") => {
  const inSide = side === "player" ? z >= 0 : z <= 0;
  return (
    inSide &&
    Math.abs(x) <= COURT.halfSingles + BALL_RADIUS &&
    Math.abs(z) <= COURT.halfLength + BALL_RADIUS
  );
};

/** Which half a z is on. */
export const halfAt = (z: number): "player" | "opponent" =>
  z >= 0 ? "player" : "opponent";
