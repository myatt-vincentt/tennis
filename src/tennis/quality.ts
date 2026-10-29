// How much detail this device gets, from the SDK's adaptive quality tier:
//   2 (high)    full crowd, soft shadows at 1024
//   1 (medium)  three quarters of the crowd, shadows at 512
//   0 (low)     half the crowd, no cast shadows (the soft contact shadows
//               under the players and the ball stay)
// The SDK also lowers the render resolution and tracking rate on its own.
import { useXRQuality } from "@vincentt-xr/sdk";

export const detail = {
  level: 2,
  /** Development only: a fixed level (null = follow the device). */
  forced: null as number | null,
};

/** The level to draw with right now. */
export const detailNow = () => detail.forced ?? detail.level;

const LEVEL: Record<string, number> = { high: 2, medium: 1, low: 0 };

/** Reads the tier into `detail.level` (mount once). */
export const useDetailLevel = () => {
  const { tier } = useXRQuality();
  const fromTier = tier ? (LEVEL[tier.name] ?? 2) : 2;
  detail.level = fromTier;
  return detailNow();
};

export const CROWD_SHARE = [0.5, 0.75, 1];
export const SHADOW_SIZE = [0, 512, 1024];
