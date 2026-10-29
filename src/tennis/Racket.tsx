// Your racket in the first-person view: in front of the camera, following
// your hand (its place in the camera picture), resting low on the right
// without one. It sweeps across on every swing: right to left for a
// forehand, left to right for a backhand.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, MeshStandardMaterial, Vector3, type Group } from "three";

import { hands } from "./HandInput";
import { easeOut } from "./look";
import type { Stroke } from "./sim/shots";
import { onGameEvents, tennis } from "./state";

const REST = { x: 0.3, y: -0.3 };

export const Racket = () => {
  const root = useRef<Group>(null);
  const at = useRef({ x: REST.x, y: REST.y });
  const sweep = useRef<{ t: number; stroke: Stroke }>({
    t: -10,
    stroke: "forehand",
  });
  const tmp = useMemo(() => new Vector3(), []);
  const mats = useMemo(
    () => ({
      frame: new MeshStandardMaterial({
        color: "#2a2d33",
        roughness: 0.35,
        metalness: 0.4,
      }),
      grip: new MeshStandardMaterial({ color: "#f4d968", roughness: 0.7 }),
      strings: new MeshStandardMaterial({
        color: "#f4f4f0",
        transparent: true,
        opacity: 0.35,
        side: DoubleSide,
        depthWrite: false,
      }),
    }),
    [],
  );
  useEffect(
    () => () => Object.values(mats).forEach((m) => m.dispose()),
    [mats],
  );

  useEffect(
    () =>
      onGameEvents((e) => {
        if (e.kind === "hit" && e.who === "you")
          sweep.current = { t: performance.now(), stroke: e.stroke };
        if (e.kind === "whiff") {
          sweep.current = {
            t: performance.now(),
            stroke: tennis.game.you.swing?.stroke ?? "forehand",
          };
        }
      }),
    [],
  );

  useFrame(({ camera }, rawDt) => {
    const g = root.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.1);
    g.visible = tennis.view === "first";
    if (!g.visible) return;
    // Follow the hand that is playing (the picture is mirrored like a mirror).
    const mark = hands[hands.active];
    const want =
      mark.shown > 0.5
        ? { x: (mark.u - 0.5) * 0.8, y: (0.5 - mark.v) * 0.5 - 0.18 }
        : REST;
    const f = 1 - Math.exp(-dt * 14);
    at.current.x += (want.x - at.current.x) * f;
    at.current.y += (want.y - at.current.y) * f;

    // The sweep: across and back over half a second.
    const age = (performance.now() - sweep.current.t) / 1000;
    const dir = sweep.current.stroke === "forehand" ? -1 : 1;
    let out = 0;
    if (age < 0.18) out = easeOut(age / 0.18);
    else if (age < 0.6) out = 1 - easeOut((age - 0.18) / 0.42);
    const x = at.current.x + dir * out * 0.45;
    const roll = dir * out * 1.1;

    tmp
      .set(x, at.current.y, -0.8)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    g.position.copy(tmp);
    g.quaternion.copy(camera.quaternion);
    g.rotateZ(-0.5 - roll * 0.6);
    g.rotateY(roll * 0.8);
    g.rotateX(-0.35);
  });

  return (
    <group ref={root} visible={false} scale={0.75}>
      <mesh material={mats.grip} position={[0, -0.24, 0]}>
        <cylinderGeometry args={[0.018, 0.02, 0.2, 8]} />
      </mesh>
      <mesh material={mats.frame} position={[0, -0.08, 0]}>
        <cylinderGeometry args={[0.012, 0.016, 0.14, 8]} />
      </mesh>
      <group position={[0, 0.12, 0]} scale={[1, 1.25, 1]}>
        <mesh material={mats.frame}>
          <torusGeometry args={[0.12, 0.011, 6, 28]} />
        </mesh>
        <mesh material={mats.strings}>
          <circleGeometry args={[0.12, 24]} />
        </mesh>
      </group>
    </group>
  );
};
