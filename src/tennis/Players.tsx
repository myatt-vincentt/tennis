// The two players, built in code from smooth shapes (character.ts): you at
// the near end (yellow shirt, short hair, headband), the computer at the far
// end (coral shirt, ponytail). Both are right-handed, with a strung racket.
// A soft contact shadow sits under each player's feet.
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
  DoubleSide,
  MeshStandardMaterial,
  Quaternion,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
  type Group,
  type Mesh,
} from "three";

import {
  bodyGeometry,
  fabric,
  hairGeometry,
  headGeometry,
  racketGeometry,
  skin as skinMaterial,
  stringsMap,
} from "./character";
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

type Look = {
  shirt: string;
  shorts: string;
  band: string;
  hair: string;
  long: boolean;
  shoe: string;
  grip: string;
};

const contactVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const contactFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float opacity;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    gl_FragColor = vec4(0.0, 0.02, 0.05, (1.0 - smoothstep(0.1, 1.0, d)) * opacity);
  }
`;

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

  const contact = useRef<Mesh>(null);

  const mats = useMemo(
    () => ({
      shirt: fabric(colours.shirt, 1),
      collar: fabric(colours.band, 0.3),
      shorts: fabric(colours.shorts, 0.6),
      sock: fabric("#f4f5f7", 0.2),
      skin: skinMaterial(skin),
      hair: new MeshStandardMaterial({ color: colours.hair, roughness: 0.62 }),
      eyes: new MeshStandardMaterial({ color: "#1c1a1a", roughness: 0.25 }),
      band: fabric(colours.band, 0.2),
      shoe: new MeshStandardMaterial({ color: colours.shoe, roughness: 0.5 }),
      sole: new MeshStandardMaterial({ color: "#e9eaec", roughness: 0.75 }),
      frame: new MeshStandardMaterial({
        color: "#262a31",
        roughness: 0.3,
        metalness: 0.5,
      }),
      grip: new MeshStandardMaterial({ color: colours.grip, roughness: 0.8 }),
      strings: new MeshStandardMaterial({
        color: "#f4f4ec",
        roughness: 0.6,
        alphaMap: stringsMap(),
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
      }),
      contact: new ShaderMaterial({
        uniforms: { opacity: { value: 0.42 } },
        vertexShader: contactVert,
        fragmentShader: contactFrag,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    }),
    [colours, skin],
  );
  const geo = useMemo(() => {
    const body = bodyGeometry();
    const head = headGeometry();
    const racket = racketGeometry();
    return {
      ...body,
      head: head.skin,
      eyes: head.eyes,
      brows: head.brows,
      hair: hairGeometry(colours.long),
      headband: new TorusGeometry(0.106, 0.014, 8, 28),
      grip: racket.grip,
      frame: racket.frame,
      strings: racket.strings,
    };
  }, [colours.long]);
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
    const c = contact.current;
    if (c) {
      c.position.set(p.x, 0.004, p.z);
      c.visible = g.visible;
    }
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

  const sh = (
    m: keyof typeof mats,
    g: keyof typeof geo,
    pos?: [number, number, number],
  ) => <mesh geometry={geo[g]} material={mats[m]} position={pos} castShadow />;

  return (
    <>
      <mesh
        ref={contact}
        rotation-x={-Math.PI / 2}
        material={mats.contact}
        renderOrder={2}
      >
        <planeGeometry args={[1.1, 1.1]} />
      </mesh>
      <group ref={root}>
        <group ref={hips}>
          {[-0.092, 0.092].map((x, i) => (
            <group key={x} ref={legs[i]} position={[x, -0.06, 0]}>
              {sh("shorts", "shortsLeg")}
              {sh("skin", "thigh")}
              <group ref={knees[i]} position={[0, -0.44, 0]}>
                {sh("skin", "calf")}
                {sh("sock", "sock")}
                <group position={[0, -0.42, 0.03]}>
                  {sh("shoe", "shoe")}
                  {sh("sole", "sole", [0, -0.022, 0.035])}
                </group>
              </group>
            </group>
          ))}
          {sh("shorts", "shorts")}
          <group ref={torso} position={[0, 0.05, 0]}>
            {sh("shirt", "shirt")}
            <mesh
              geometry={geo.collar}
              material={mats.collar}
              position={[0, 0.565, 0.01]}
              rotation-x={Math.PI / 2 - 0.2}
              scale={[1, 0.8, 1]}
            />
            {sh("skin", "neck")}
            <group position={[0, 0.755, 0.012]}>
              {sh("skin", "head")}
              {sh("hair", "hair")}
              <mesh geometry={geo.eyes} material={mats.eyes} />
              <mesh geometry={geo.brows} material={mats.hair} />
              {who === "you" ? (
                <mesh
                  geometry={geo.headband}
                  material={mats.band}
                  position={[0, 0.03, 0]}
                  rotation-x={Math.PI / 2 + 0.12}
                />
              ) : null}
            </group>
            {[-0.2, 0.2].map((x, i) => (
              <group key={x} ref={shoulders[i]} position={[x, 0.47, 0]}>
                {sh("shirt", "sleeve")}
                {sh("skin", "upperArm")}
                <group ref={elbows[i]} position={[0, -0.29, 0]}>
                  {sh("skin", "forearm")}
                  {who === "you" ? sh("band", "wristband") : null}
                  {sh("skin", "hand", [0, -0.25, 0])}
                  {i === 0 ? (
                    <group position={[0, -0.42, 0]} rotation-x={Math.PI}>
                      {sh("grip", "grip")}
                      {sh("frame", "frame")}
                      <mesh geometry={geo.strings} material={mats.strings} />
                    </group>
                  ) : null}
                </group>
              </group>
            ))}
          </group>
        </group>
      </group>
    </>
  );
};

export const Players = () => (
  <>
    <Player who="you" colours={PALETTE.you} skin={PALETTE.skin[0]} />
    <Player who="cpu" colours={PALETTE.cpu} skin={PALETTE.skin[1]} />
  </>
);
