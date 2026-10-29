// Where the corner camera frame sits (CSS px): top right, clear of the
// rally count in the middle, with the two chips under it. The picture, its
// glass edge and its shadow are all drawn from this one rect
// (CameraFrame.tsx); the chips are placed from it too (Hud.tsx).
export const GUTTER = 16;
/** The frame's corner radius (CSS px). */
export const FRAME_RADIUS = 14;

export const frameRect = (width: number, height: number) => {
  // Portrait-ish on a phone, landscape-ish on a laptop, never extreme.
  const aspect = Math.min(1.33, Math.max(0.75, width / Math.max(1, height)));
  const h = Math.min(150, Math.max(96, height * 0.17));
  const w = Math.round(h * aspect);
  return {
    left: width - GUTTER - w,
    top: GUTTER,
    width: w,
    height: Math.round(h),
  };
};

/**
 * For drei's `<Html fullscreen>`: pin the page UI to the screen. By default
 * it follows the scene's origin, which moves on screen with the camera.
 */
export const pinToScreen = (
  _el: unknown,
  _camera: unknown,
  size: { width: number; height: number },
) => [size.width / 2, size.height / 2];
