// The two players, built from simple rounded shapes: you at the near end
// (yellow shirt), the computer at the far end (coral shirt). Both are
// right-handed.
//
// They run with swinging arms and legs at the speed they move, stand in a
// light ready crouch, and swing to match the hit: a forehand from the right
// side across the body, or a two-handed backhand from the left. The swing
// winds back as the ball comes, meets it at the contact moment and follows
// through over the shoulder. The computer tosses the ball up to serve.
//
// In the first-person view your own body is hidden (the racket in front of
// the camera is yours, see Racket.tsx).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CapsuleGeometry,
  CircleGeometry,
  DoubleSide,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Group,
} from "three";

import { PALETTE } from "./look";
import {
  copyPose,
  easeOut,
  mixPose,
  POSES,
  swingPose,
  type ArmPose,
} from "./sim/poses";
import { onGameEvents, tennis } from "./state";

const DOWN = new Vector3(0, -1, 0);
const armQuat = (p: ArmPose, out: Quaternion) =>
  out.setFromUnitVectors(DOWN, new Vector3(...p.dir).normalize());

type Look = { shirt: string; shorts: string; band: string };

const Player = ({
  who,
  colours,
  skin,
}: {
  who: "you" | "cpu";
  colours: Look;
  skin: string;
}) => {
  const root = useRef<Group>(null);
  const hips = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const legs = [useRef<Group>(null), useRef<Group>(null)];
  const knees = [useRef<Group>(null), useRef<Group>(null)];
  const shoulders = [useRef<Group>(null), useRef<Group>(null)];
  const elbows = [useRef<Group>(null), useRef<Group>(null)];
  const run = useRef(0);
  const serveAt = useRef(-10);
  const pose = useMemo(() => copyPose(POSES.ready), []);
  const q = useMemo(() => new Quaternion(), []);

  const mats = useMemo(
    () => ({
      shirt: new MeshStandardMaterial({ color: colours.shirt, roughness: 0.7 }),
      shorts: new MeshStandardMaterial({
        color: colours.shorts,
        roughness: 0.75,
      }),
      skin: new MeshStandardMaterial({ color: skin, roughness: 0.65 }),
      band: new MeshStandardMaterial({ color: colours.band, roughness: 0.6 }),
      shoe: new MeshStandardMaterial({ color: "#f2f3f5", roughness: 0.6 }),
      frame: new MeshStandardMaterial({
        color: "#2a2d33",
        roughness: 0.35,
        metalness: 0.4,
      }),
      strings: new MeshStandardMaterial({
        color: "#f4f4f0",
        transparent: true,
        opacity: 0.45,
        side: DoubleSide,
        depthWrite: false,
      }),
    }),
    [colours, skin],
  );
  const geo = useMemo(
    () => ({
      chest: new CapsuleGeometry(0.17, 0.3, 4, 10),
      shorts: new CapsuleGeometry(0.16, 0.12, 4, 10),
      head: new SphereGeometry(0.115, 14, 10),
      band: new TorusGeometry(0.112, 0.022, 6, 16),
      upper: new CapsuleGeometry(0.052, 0.22, 3, 8),
      fore: new CapsuleGeometry(0.046, 0.2, 3, 8),
      hand: new SphereGeometry(0.05, 8, 6),
      thigh: new CapsuleGeometry(0.075, 0.3, 3, 8),
      shin: new CapsuleGeometry(0.062, 0.3, 3, 8),
      handle: new CapsuleGeometry(0.016, 0.22, 2, 6),
      rim: new TorusGeometry(0.13, 0.012, 6, 24),
      strings: new CircleGeometry(0.13, 20),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
      Object.values(geo).forEach((g) => g.dispose());
    },
    [mats, geo],
  );

  useEffect(
    () =>
      onGameEvents((e) => {
        if (who === "cpu" && e.kind === "serve") serveAt.current = e.t;
      }),
    [who],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const { game } = tennis;
    const p = who === "you" ? game.you : game.cpu;
    const g = root.current;
    if (!g) return;
    g.visible = !(who === "you" && tennis.view === "first");
    g.position.set(p.x, 0, p.z);
    // Face the net, turned a little towards the ball.
    const facing = who === "you" ? Math.PI : 0;
    const toBall = Math.atan2(
      game.ball.p.x - p.x,
      Math.abs(game.ball.p.z - p.z) + 4,
    );
    g.rotation.y = facing + (who === "you" ? -toBall : toBall) * 0.35;

    // The swing (or the serve toss).
    const t = game.time;
    const serving =
      who === "cpu" &&
      (game.tossing ||
        (p.swing !== null &&
          Math.abs(p.swing.contact - serveAt.current) < 0.02));
    if (who === "cpu" && game.tossing && game.phase === "serve") {
      // The toss: the free arm lifts the ball while the racket winds back.
      mixPose(POSES.ready, POSES.toss, easeOut(1 - game.serveIn() / 1.1), pose);
    } else swingPose(p.swing, t, serving, pose);

    // Running legs at the speed they move; a light bounce when still.
    const speed = Math.hypot(p.vx, p.vz);
    run.current += speed * dt * 2.3;
    const stride = Math.min(1, speed / 5) * 0.85;
    const ph = run.current;
    const idle = Math.sin(t * 6) * 0.02 * (1 - Math.min(1, speed));
    hips.current?.position.set(
      0,
      0.95 - pose.crouch * 0.12 + Math.abs(Math.sin(ph)) * stride * 0.05 + idle,
      0,
    );
    for (let i = 0; i < 2; i += 1) {
      const s = i === 0 ? 1 : -1;
      const leg = legs[i].current;
      if (leg) {
        leg.rotation.x = Math.sin(ph) * stride * s - pose.crouch * 0.35;
        leg.rotation.z = s * 0.06;
      }
      const knee = knees[i].current;
      if (knee)
        knee.rotation.x =
          Math.max(0, -Math.sin(ph) * s) * stride * 1.3 + pose.crouch * 0.7;
    }
    if (torso.current) torso.current.rotation.y = pose.yaw;
    // Arms: the swing pose, with a running swing on the free arm.
    const arms: ArmPose[] = [pose.r, pose.l];
    arms.forEach((a, i) => {
      const sh = shoulders[i].current;
      const el = elbows[i].current;
      if (!sh || !el) return;
      armQuat(a, q);
      sh.quaternion.copy(q);
      if (i === 1 && !p.swing) sh.rotateX(Math.sin(ph) * stride * 0.6);
      el.rotation.x = -a.elbow;
    });
  });

  return (
    <group ref={root}>
      <group ref={hips}>
        {[-0.1, 0.1].map((x, i) => (
          <group key={x} ref={legs[i]} position={[x, -0.02, 0]}>
            <mesh
              geometry={geo.thigh}
              material={mats.skin}
              position={[0, -0.22, 0]}
              castShadow
            />
            <group ref={knees[i]} position={[0, -0.44, 0]}>
              <mesh
                geometry={geo.shin}
                material={mats.skin}
                position={[0, -0.2, 0]}
                castShadow
              />
              <mesh material={mats.shoe} position={[0, -0.42, 0.05]} castShadow>
                <boxGeometry args={[0.11, 0.08, 0.26]} />
              </mesh>
            </group>
          </group>
        ))}
        <mesh
          geometry={geo.shorts}
          material={mats.shorts}
          position={[0, -0.02, 0]}
          castShadow
        />
        <group ref={torso} position={[0, 0.05, 0]}>
          <mesh
            geometry={geo.chest}
            material={mats.shirt}
            position={[0, 0.3, 0]}
            castShadow
          />
          <mesh
            geometry={geo.head}
            material={mats.skin}
            position={[0, 0.72, 0]}
            castShadow
          />
          <mesh
            geometry={geo.band}
            material={mats.band}
            position={[0, 0.76, 0]}
            rotation-x={Math.PI / 2}
          />
          {[-0.215, 0.215].map((x, i) => (
            <group key={x} ref={shoulders[i]} position={[x, 0.5, 0]}>
              <mesh
                geometry={geo.upper}
                material={mats.shirt}
                position={[0, -0.14, 0]}
                castShadow
              />
              <group ref={elbows[i]} position={[0, -0.29, 0]}>
                <mesh
                  geometry={geo.fore}
                  material={mats.skin}
                  position={[0, -0.13, 0]}
                  castShadow
                />
                <mesh
                  geometry={geo.hand}
                  material={mats.skin}
                  position={[0, -0.27, 0]}
                />
                {i === 0 ? (
                  <group position={[0, -0.29, 0]}>
                    <mesh
                      geometry={geo.handle}
                      material={mats.frame}
                      position={[0, -0.08, 0]}
                      castShadow
                    />
                    <group
                      position={[0, -0.38, 0]}
                      rotation-y={Math.PI / 2}
                      scale={[1, 1.25, 1]}
                    >
                      <mesh
                        geometry={geo.rim}
                        material={mats.frame}
                        castShadow
                      />
                      <mesh geometry={geo.strings} material={mats.strings} />
                    </group>
                  </group>
                ) : null}
              </group>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
};

export const Players = () => (
  <>
    <Player who="you" colours={PALETTE.you} skin={PALETTE.skin[0]} />
    <Player who="cpu" colours={PALETTE.cpu} skin={PALETTE.skin[1]} />
  </>
);
