// Where the corner camera frame sits (CSS px), shared by the picture
// (CameraFrame.tsx) and its glass edge (Hud.tsx).
export const GUTTER = 16;

export const frameRect = (width: number, height: number) => {
  // Portrait-ish on a phone, landscape-ish on a laptop, never extreme.
  const aspect = Math.min(1.33, Math.max(0.75, width / Math.max(1, height)));
  const h = Math.min(150, Math.max(96, height * 0.17));
  return {
    left: GUTTER,
    top: GUTTER,
    width: Math.round(h * aspect),
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
