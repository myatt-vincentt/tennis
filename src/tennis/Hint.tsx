// The only hint, wordless: a small see-through ghost hand (the SDK's hint
// hand, no disc behind it) low in the middle of the screen, swinging a
// forehand over and over: it waits on the right, sweeps quickly across to
// the left and glides back. It goes for good after your first hit (strict
// ease-out).
import { useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";
// eslint-disable-next-line import/extensions
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  HandGestureHint,
  type HandGestureHintProps,
} from "@vincentt-xr/sdk/instructions";

import { easeOut } from "./look";
import { tennis } from "./state";

const HAND_URL = "/models/hand-v1.glb";

const HINT = {
  /** Hand height (CSS px). */
  px: 78,
  /** How far the swing travels across (px). */
  span: 150,
  /** Down from the top, as a share of the screen height. */
  at: 0.8,
  /** How far from the camera it is drawn (world): in front of everything. */
  distance: 1.2,
  /** Fade in after load, fade out after the first hit (s). */
  delay: 0.8,
  fade: 0.4,
  order: 1100,
};

/** One cycle (s): wait, sweep, glide back. */
const CYCLE = 2.2;
const SWEEP = [0.32, 0.52] as const;

/** Ghost style: see-through white, no dark edge and no disc behind it. */
const LOOK: HandGestureHintProps["look"] = {
  ghost: { core: 0.42, rim: 0.8, whiten: 0.75 },
  halo: false,
  glow: false,
};

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

export const Hint = () => {
  const camera = useThree((st) => st.camera);
  const size = useThree((st) => st.size);
  const hand = useLoader(GLTFLoader, HAND_URL);
  const root = useRef<Group>(null);
  const born = useRef(-1);
  const gone = useRef(-1);
  const ray = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const now = performance.now() / 1000;
    if (born.current < 0) born.current = now;
    if (gone.current < 0 && tennis.hitOnce) gone.current = now;
    const shown = easeOut((now - born.current - HINT.delay) / HINT.fade);
    const left =
      gone.current < 0 ? 1 : 1 - easeOut((now - gone.current) / HINT.fade);
    const k = shown * left;
    g.visible = k > 0.01;
    if (!g.visible) return;

    // Where the hand is in its swing: −1 (right, wound up) … +1 (left, done).
    const phase = (now % CYCLE) / CYCLE;
    let s: number;
    if (phase < SWEEP[0]) s = 0;
    else if (phase < SWEEP[1])
      s = smooth((phase - SWEEP[0]) / (SWEEP[1] - SWEEP[0]));
    else s = 1 - smooth((phase - SWEEP[1]) / (1 - SWEEP[1]));
    const x = HINT.span / 2 - s * HINT.span;
    // A shallow arc: lowest in the middle of the sweep.
    const y = -Math.sin(s * Math.PI) * 14;

    // Low and to the right of your player, clear of the court's middle.
    const cx = size.width / 2 + Math.min(size.width * 0.24, 190) + x;
    const cy = size.height * HINT.at - y;
    const tan = Math.tan(
      ((camera as { fov?: number }).fov ?? 45) * (Math.PI / 360),
    );
    const perPx = (2 * HINT.distance * tan) / size.height;
    ray
      .set((2 * cx) / size.width - 1, 1 - (2 * cy) / size.height, 0.5)
      .unproject(camera)
      .sub(camera.position);
    g.position
      .copy(camera.position)
      .addScaledVector(ray.normalize(), HINT.distance);
    g.quaternion.copy(camera.quaternion);
    // The palm turns through the swing, leading with the fingers.
    g.rotateZ(0.35 - s * 0.7);
    g.rotateY(-0.5 + s * 1.0);
    g.scale.setScalar(Math.max(1e-4, HINT.px * perPx * k));
  });

  return (
    <group ref={root} visible={false}>
      <HandGestureHint
        gesture="palm"
        model={hand.scene}
        poses={hand.animations}
        height={1}
        orbit={0}
        loop={{ seconds: 0 }}
        look={LOOK}
        renderOrder={HINT.order}
      />
    </group>
  );
};
