// The stadium around the court:
//   - stepped concrete stands on all four sides, rows of coloured seats,
//     stair aisles, a metal rail along the front and the back, a back wall
//   - roofs over the two end stands and one side (the other side stays open
//     for the side camera), with a fascia along the front edge
//   - the crowd: people of different sizes, skin, hair and shirt colours,
//     some in caps; they breathe and shift a little, turn their heads to
//     follow the ball, and jump up with their arms in the air on a big moment
//   - four floodlight masts: by night the lamps glow, with faint light cones
//     and a soft haze around each lamp
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  SpriteMaterial,
  Vector3,
} from "three";
// eslint-disable-next-line import/extensions
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { lathe } from "./character";
import { look, PALETTE } from "./look";
import { CROWD_SHARE, detailNow } from "./quality";
import { seeded } from "./sim/game";
import { tennis } from "./state";

// ---------------------------------------------------------------- layout

const STANDS = {
  side: { from: 11.4, rows: 9, depth: 0.95, rise: 0.72, span: 17.2 },
  end: { from: 19.6, rows: 7, depth: 0.95, rise: 0.72, span: 11.4 },
  firstY: 1.5,
  /** A stair aisle every this many metres along a stand. */
  aisleEvery: 6.2,
  aisleWidth: 1.1,
};
export const MASTS = [
  [-15, -22],
  [15, -22],
  [-15, 22],
  [15, 22],
] as const;
export const MAST_H = 24;

type Stand = {
  /** Where the front row's middle is, which way the seats face (yaw), how long. */
  x: number;
  z: number;
  ry: number;
  len: number;
  rows: number;
  depth: number;
  rise: number;
  roof: boolean;
};

const STAND_LIST: Stand[] = [
  {
    x: STANDS.side.from,
    z: 0,
    ry: -Math.PI / 2,
    len: STANDS.side.span * 2,
    rows: 9,
    depth: 0.95,
    rise: 0.72,
    roof: false,
  },
  {
    x: -STANDS.side.from,
    z: 0,
    ry: Math.PI / 2,
    len: STANDS.side.span * 2,
    rows: 9,
    depth: 0.95,
    rise: 0.72,
    roof: true,
  },
  {
    x: 0,
    z: STANDS.end.from,
    ry: Math.PI,
    len: STANDS.end.span * 2,
    rows: 7,
    depth: 0.95,
    rise: 0.72,
    roof: true,
  },
  {
    x: 0,
    z: -STANDS.end.from,
    ry: 0,
    len: STANDS.end.span * 2,
    rows: 7,
    depth: 0.95,
    rise: 0.72,
    roof: true,
  },
];

const UP = new Vector3(0, 1, 0);
/** The stand's own axes: along its length, and towards the court. */
const axes = (s: Stand) => ({
  along: new Vector3(1, 0, 0).applyAxisAngle(UP, s.ry),
  fwd: new Vector3(0, 0, 1).applyAxisAngle(UP, s.ry),
});
/** True if a spot along the stand (m from its middle) is in a stair aisle. */
const inAisle = (a: number) =>
  Math.abs(a - Math.round(a / STANDS.aisleEvery) * STANDS.aisleEvery) <
  STANDS.aisleWidth / 2;

// ---------------------------------------------------------------- structure

/** A box at a spot in a stand's own frame (a = along, b = back, y up). */
const placeBox = (
  o: Object3D,
  s: Stand,
  a: number,
  b: number,
  y: number,
  size: [number, number, number],
) => {
  const { along, fwd } = axes(s);
  o.position.set(
    s.x + along.x * a - fwd.x * b,
    y,
    s.z + along.z * a - fwd.z * b,
  );
  o.rotation.set(0, s.ry, 0);
  o.scale.set(...size);
  o.updateMatrix();
  return o.matrix;
};

const Structure = () => {
  const built = useMemo(() => {
    const concrete: { m: ReturnType<typeof placeBox>; c: Color }[] = [];
    const o = new Object3D();
    const steps: [number, Color][] = [];
    const add = (m: ReturnType<typeof placeBox>, c: Color) =>
      concrete.push({ m: m.clone(), c });
    const stand = new Color("#b4bbc4");
    const riser = new Color("#9aa2ad");
    const stair = new Color("#d6dbe1");
    const wall = new Color("#7d8794");
    STAND_LIST.forEach((s) => {
      for (let r = 0; r < s.rows; r += 1) {
        const top = STANDS.firstY + r * s.rise;
        const back = r * s.depth;
        // The step: concrete down to the ground, then the seat band in front.
        add(
          placeBox(o, s, 0, back + s.depth / 2, top / 2, [s.len, top, s.depth]),
          stand,
        );
        add(
          placeBox(o, s, 0, back + 0.02, top - 0.12, [s.len, 0.24, 0.04]),
          riser,
        );
        const seats = r % 2 ? PALETTE.seatsB : PALETTE.seatsA;
        add(
          placeBox(o, s, 0, back + 0.32, top + 0.13, [s.len, 0.26, 0.34]),
          seats,
        );
        steps.push([top, seats]);
      }
      // Stair aisles: a lighter strip up each one.
      const n = Math.floor(s.len / 2 / STANDS.aisleEvery);
      for (let k = -n; k <= n; k += 1) {
        const a = k * STANDS.aisleEvery;
        if (Math.abs(a) < s.len / 2 - 1) {
          for (let r = 0; r < s.rows; r += 1) {
            const top = STANDS.firstY + r * s.rise;
            add(
              placeBox(o, s, a, r * s.depth + s.depth / 2, top + 0.01, [
                STANDS.aisleWidth,
                0.04,
                s.depth,
              ]),
              stair,
            );
          }
        }
      }
      // The back wall behind the top row.
      const backTop = STANDS.firstY + s.rows * s.rise + 2.4;
      add(
        placeBox(o, s, 0, s.rows * s.depth + 0.2, backTop / 2, [
          s.len,
          backTop,
          0.4,
        ]),
        wall,
      );
    });
    const mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshLambertMaterial({ color: "#ffffff" }),
      concrete.length,
    );
    concrete.forEach((b, i) => {
      mesh.setMatrixAt(i, b.m);
      mesh.setColorAt(i, b.c);
    });
    return mesh;
  }, []);

  // Rails: posts and bars along the front and back of every stand.
  const rails = useMemo(() => {
    const o = new Object3D();
    const bars: { m: ReturnType<typeof placeBox> }[] = [];
    const posts: { m: ReturnType<typeof placeBox> }[] = [];
    STAND_LIST.forEach((s) => {
      const front = STANDS.firstY;
      const backY = STANDS.firstY + s.rows * s.rise;
      [
        [front + 1.0, -0.1],
        [backY + 1.0, s.rows * s.depth - 0.05],
      ].forEach(([y, b]) => {
        bars.push({ m: placeBox(o, s, 0, b, y, [s.len, 0.05, 0.05]).clone() });
        bars.push({
          m: placeBox(o, s, 0, b, y - 0.45, [s.len, 0.03, 0.03]).clone(),
        });
        for (let a = -s.len / 2; a <= s.len / 2 + 0.01; a += 2) {
          posts.push({
            m: placeBox(o, s, a, b, y - 0.5, [0.04, 1.0, 0.04]).clone(),
          });
        }
      });
    });
    const mat = new MeshStandardMaterial({
      color: "#c9d0d8",
      roughness: 0.35,
      metalness: 0.7,
    });
    const mk = (list: { m: ReturnType<typeof placeBox> }[]) => {
      const m = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, list.length);
      list.forEach((x, i) => m.setMatrixAt(i, x.m));
      return m;
    };
    return { bars: mk(bars), posts: mk(posts), mat };
  }, []);

  // Roofs: a thin slab reaching out over the stand from the back wall, a
  // dark fascia along its front, and columns at the back.
  const roofs = useMemo(() => {
    const o = new Object3D();
    const slabs: ReturnType<typeof placeBox>[] = [];
    const fascia: ReturnType<typeof placeBox>[] = [];
    const columns: ReturnType<typeof placeBox>[] = [];
    STAND_LIST.filter((s) => s.roof).forEach((s) => {
      const backY = STANDS.firstY + s.rows * s.rise + 2.4;
      const reach = s.rows * s.depth + 1.8;
      const mid = s.rows * s.depth + 0.4 - reach / 2;
      slabs.push(
        placeBox(o, s, 0, mid, backY + 0.6, [s.len + 1, 0.25, reach]).clone(),
      );
      fascia.push(
        placeBox(o, s, 0, mid - reach / 2, backY + 0.35, [
          s.len + 1,
          0.7,
          0.18,
        ]).clone(),
      );
      for (let a = -s.len / 2; a <= s.len / 2 + 0.01; a += s.len / 4) {
        columns.push(
          placeBox(o, s, a, s.rows * s.depth + 0.5, backY / 2 + 0.3, [
            0.35,
            backY + 0.6,
            0.35,
          ]).clone(),
        );
      }
    });
    const slabMat = new MeshStandardMaterial({
      color: "#e6eaee",
      roughness: 0.6,
      metalness: 0.2,
    });
    const fasciaMat = new MeshStandardMaterial({
      color: "#2a2d33",
      roughness: 0.5,
      emissive: new Color("#cfe0ff"),
      emissiveIntensity: 0,
    });
    const mk = (
      list: ReturnType<typeof placeBox>[],
      mat: MeshStandardMaterial,
    ) => {
      const m = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, list.length);
      list.forEach((x, i) => m.setMatrixAt(i, x));
      return m;
    };
    return {
      slabs: mk(slabs, slabMat),
      fascia: mk(fascia, fasciaMat),
      columns: mk(columns, slabMat),
      slabMat,
      fasciaMat,
    };
  }, []);

  useEffect(
    () => () => {
      [
        built,
        rails.bars,
        rails.posts,
        roofs.slabs,
        roofs.fascia,
        roofs.columns,
      ].forEach((m) => m.geometry.dispose());
      (built.material as MeshLambertMaterial).dispose();
      rails.mat.dispose();
      roofs.slabMat.dispose();
      roofs.fasciaMat.dispose();
    },
    [built, rails, roofs],
  );

  useFrame(() => {
    // A thin light strip under the roof edge at night.
    roofs.fasciaMat.emissiveIntensity = look.night * 0.25;
  });

  return (
    <group>
      <primitive object={built} />
      <primitive object={rails.bars} />
      <primitive object={rails.posts} />
      <primitive object={roofs.slabs} />
      <primitive object={roofs.fascia} />
      <primitive object={roofs.columns} />
      {/* The ground under and around the stands. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
        <planeGeometry args={[90, 100]} />
        <meshLambertMaterial color="#59616b" />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------- crowd

/**
 * One seated person, as one mesh: body, head, hair, two arms. Vertex flags
 * say which part each vertex is (the shader moves heads and arms).
 */
const personGeometry = () => {
  const flag = (g: BufferGeometry, part: number, side = 0) => {
    const n = g.getAttribute("position").count;
    g.setAttribute(
      "aPart",
      new Float32BufferAttribute(new Array(n).fill(part), 1),
    );
    g.setAttribute(
      "aSide",
      new Float32BufferAttribute(new Array(n).fill(side), 1),
    );
    return g.toNonIndexed();
  };
  const body = lathe(
    [
      [0.07, 0.66],
      [0.19, 0.58],
      [0.2, 0.42],
      [0.17, 0.2],
      [0.2, 0.02],
    ],
    0.7,
    7,
    4,
  );
  // Few faces each: there are about 1,500 of them, all small on screen.
  const head = new SphereGeometry(0.105, 7, 5);
  head.scale(1, 1.15, 1.05);
  head.translate(0, 0.79, 0.01);
  const hair = new SphereGeometry(
    0.112,
    7,
    3,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.5,
  );
  hair.scale(1, 1.1, 1.06);
  hair.rotateX(-0.25);
  hair.translate(0, 0.81, -0.005);
  const arms = [-1, 1].map((s) => {
    const a = new CylinderGeometry(0.045, 0.04, 0.42, 5, 1, true);
    a.translate(s * 0.215, 0.38, 0.03);
    return flag(a, 3, s);
  });
  const g = mergeGeometries([
    flag(body, 0),
    flag(head, 1),
    flag(hair, 2),
    ...arms,
  ]);
  return g;
};

const crowdVert = /* glsl */ `
  uniform float uTime;
  uniform float uCheer;
  uniform vec3 uBall;
  attribute float aPart;
  attribute float aSide;
  attribute vec3 aSkin;
  attribute vec3 aHair;
  varying vec4 vTint;
`;

const Crowd = () => {
  const { mesh, uniforms, total } = useMemo(() => {
    const rnd = seeded(11);
    const spots: { x: number; y: number; z: number; ry: number }[] = [];
    STAND_LIST.forEach((s) => {
      const { along, fwd } = axes(s);
      for (let r = 0; r < s.rows; r += 1) {
        const top = STANDS.firstY + r * s.rise;
        const back = r * s.depth + 0.55;
        const n = Math.floor(s.len / 0.6);
        for (let i = 0; i < n; i += 1) {
          const a = (i + 0.5) * (s.len / n) - s.len / 2;
          // Aisles and a few empty seats stay empty.
          if (!inAisle(a) && rnd() >= 0.12) {
            spots.push({
              x: s.x + along.x * a - fwd.x * back + (rnd() - 0.5) * 0.06,
              y: top + 0.02,
              z: s.z + along.z * a - fwd.z * back + (rnd() - 0.5) * 0.06,
              ry: s.ry + (rnd() - 0.5) * 0.35,
            });
          }
        }
      }
    });
    // Shuffle, so dropping the tail for a lighter crowd thins it evenly.
    for (let i = spots.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const u = {
      uTime: { value: 0 },
      uCheer: { value: 0 },
      uBall: { value: new Vector3() },
    };
    const material = new MeshLambertMaterial({ color: "#ffffff" });
    material.onBeforeCompile = (compiled) => {
      const shader = compiled;
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${crowdVert}`)
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `#include <begin_vertex>
          vec3 ip = instanceMatrix[3].xyz;
          float ph = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);
          float eager = step(0.3, ph);
          // Breathing and shifting a little.
          float idle = sin(uTime * (0.7 + ph * 0.6) + ph * 6.283);
          // Heads follow the ball (turned in the person's own frame).
          mat3 rs = mat3(instanceMatrix);
          float sc = length(rs[0]);
          vec3 toBall = transpose(rs) * (uBall - ip) / (sc * sc);
          float yaw = clamp(atan(toBall.x, toBall.z), -0.9, 0.9) * (0.6 + 0.4 * ph);
          if (aPart > 0.5 && aPart < 2.5) {
            vec3 h = transformed - vec3(0.0, 0.68, 0.0);
            float c = cos(yaw), s = sin(yaw);
            h.xz = mat2(c, -s, s, c) * h.xz;
            transformed = h + vec3(0.0, 0.68, 0.0);
          }
          // Arms up on a big moment (for the eager ones).
          if (aPart > 2.5) {
            float up = uCheer * eager * (0.8 + 0.2 * sin(uTime * 9.0 + ph * 20.0));
            vec3 a = transformed - vec3(aSide * 0.215, 0.58, 0.03);
            float ang = -aSide * up * 2.6;
            float c = cos(ang), s = sin(ang);
            a.xy = mat2(c, s, -s, c) * a.xy;
            transformed = a + vec3(aSide * 0.215, 0.58, 0.03);
          }
          float jump = max(0.0, sin(uTime * (7.0 + ph * 3.0) + ph * 6.283)) * 0.2 * uCheer * eager;
          transformed.y += idle * 0.008 + jump;
          transformed.x += idle * 0.006;
          // The shirt keeps the instance colour; skin and hair replace it.
          vTint = aPart < 0.5 ? vec4(0.0) : vec4(aPart > 1.5 && aPart < 2.5 ? aHair : aSkin, 1.0);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec4 vTint;")
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vTint.rgb, vTint.w);",
        );
    };
    material.customProgramCacheKey = () => "crowd";

    const geo = personGeometry();
    const n = spots.length;
    const skinA = new Float32Array(n * 3);
    const hairA = new Float32Array(n * 3);
    const im = new InstancedMesh(geo, material, n);
    const o = new Object3D();
    const c = new Color();
    const skins = [
      "#f1c9a5",
      "#e0ac7e",
      "#c68a5e",
      "#9a6440",
      "#6e4528",
      "#4a2e1c",
    ].map((h) => new Color(h));
    const hairs = [
      "#1a1410",
      "#3b2a20",
      "#6b4a2b",
      "#b88a4a",
      "#d9c7a0",
      "#8a8f96",
      "#a83a24",
    ].map((h) => new Color(h));
    spots.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z);
      o.rotation.set(0, s.ry, 0);
      o.scale.setScalar(0.86 + rnd() * 0.26);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      im.setColorAt(
        i,
        c.set(PALETTE.crowd[Math.floor(rnd() * PALETTE.crowd.length)]),
      );
      const sk = skins[Math.floor(rnd() * skins.length)];
      sk.toArray(skinA, i * 3);
      // A few wear caps in their shirt colour, the rest show their hair.
      if (rnd() < 0.18) c.toArray(hairA, i * 3);
      else hairs[Math.floor(rnd() * hairs.length)].toArray(hairA, i * 3);
    });
    geo.setAttribute("aSkin", new InstancedBufferAttribute(skinA, 3));
    geo.setAttribute("aHair", new InstancedBufferAttribute(hairA, 3));
    im.frustumCulled = false;
    return { mesh: im, uniforms: u, total: n };
  }, []);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshLambertMaterial).dispose();
    },
    [mesh],
  );

  useFrame(() => {
    uniforms.uTime.value = look.time;
    uniforms.uCheer.value = look.cheer;
    const b = tennis.game.ball.p;
    uniforms.uBall.value.set(b.x, b.y, b.z);
    mesh.count = Math.round(total * CROWD_SHARE[detailNow()]);
  });
  return <primitive object={mesh} />;
};

// ---------------------------------------------------------------- floodlights

const coneVert = /* glsl */ `
  varying float vAlong;
  varying float vRim;
  void main() {
    vAlong = clamp(-position.y / ${(MAST_H * 1.6).toFixed(1)}, 0.0, 1.0);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);
    vec3 v = normalize(cameraPosition - wp.xyz);
    vRim = abs(dot(n, v));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const coneFrag = /* glsl */ `
  uniform float strength;
  varying float vAlong;
  varying float vRim;
  void main() {
    float a = strength * pow(vRim, 1.6) * (1.0 - vAlong) * smoothstep(0.0, 0.08, vAlong);
    gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a);
  }
`;

/** A soft round glow, for the haze around each lamp. */
const glowTexture = () => {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,250,235,1)");
    r.addColorStop(0.18, "rgba(255,246,225,0.55)");
    r.addColorStop(0.5, "rgba(220,230,255,0.12)");
    r.addColorStop(1, "rgba(220,230,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(c);
};

const Floodlights = () => {
  const parts = useMemo(() => {
    const len = MAST_H * 1.6;
    const cone = new ConeGeometry(9, len, 24, 1, true);
    // Apex at the lamp, opening downwards along −y.
    cone.translate(0, -len / 2, 0);
    const coneMat = new ShaderMaterial({
      uniforms: { strength: { value: 0 } },
      vertexShader: coneVert,
      fragmentShader: coneFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    const lampMat = new MeshStandardMaterial({
      color: "#dfe6ee",
      emissive: new Color("#fff6e0"),
      emissiveIntensity: 0.2,
      roughness: 0.4,
    });
    const mastMat = new MeshStandardMaterial({
      color: "#8b939c",
      roughness: 0.5,
      metalness: 0.5,
    });
    const glow = new SpriteMaterial({
      map: glowTexture(),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
    const masts = MASTS.map(([x, z]) => {
      const head = new Vector3(x, MAST_H, z);
      const aim = new Vector3(-Math.sign(x) * 2, 0, -Math.sign(z) * 7);
      const dir = aim.clone().sub(head).normalize();
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), dir);
      return { x, z, head, q, yaw: Math.atan2(-x, -z) };
    });
    return { cone, coneMat, lampMat, mastMat, glow, masts };
  }, []);

  useEffect(
    () => () => {
      parts.cone.dispose();
      parts.coneMat.dispose();
      parts.lampMat.dispose();
      parts.mastMat.dispose();
      parts.glow.map?.dispose();
      parts.glow.dispose();
    },
    [parts],
  );

  useFrame(() => {
    parts.coneMat.uniforms.strength.value = look.night * 0.08;
    parts.lampMat.emissiveIntensity = 0.2 + look.night * 3.5;
    parts.glow.opacity = look.night * 0.9;
  });

  return (
    <group>
      {parts.masts.map((m) => (
        <group key={`${m.x},${m.z}`}>
          <mesh position={[m.x, MAST_H / 2, m.z]} material={parts.mastMat}>
            <cylinderGeometry args={[0.18, 0.32, MAST_H, 12]} />
          </mesh>
          <mesh
            position={m.head}
            rotation={[0.45, m.yaw, 0]}
            material={parts.lampMat}
          >
            <boxGeometry args={[3.4, 1.8, 0.35]} />
          </mesh>
          <sprite
            position={m.head}
            scale={[9, 9, 1]}
            material={parts.glow}
            renderOrder={6}
          />
          <mesh
            position={m.head}
            quaternion={m.q}
            geometry={parts.cone}
            material={parts.coneMat}
            renderOrder={5}
            frustumCulled={false}
          />
        </group>
      ))}
    </group>
  );
};

export const Stands = () => (
  <>
    <Structure />
    <Crowd />
    <Floodlights />
  </>
);
