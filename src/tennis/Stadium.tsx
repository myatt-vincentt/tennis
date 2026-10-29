// The stadium: sky, the blue hard court on its green surround with crisp
// lines, the net, a low wall, stepped stands on all four sides full of
// people, and four floodlight masts.
//
// Day: bright sky, a warm sun with soft shadows. Night: a dark sky with a
// few stars, the floodlights on with faint light cones, darker stands and
// court lines that glow a little. The two blend smoothly (look.night).
//
// Few lights: one sky/ground fill and one shadow-casting key light (the sun
// by day, the floodlights' combined light by night). Only the players cast
// shadows; the ball has its own soft blob (Ball.tsx).
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  Matrix4,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  ShaderMaterial,
  Vector3,
} from "three";
// eslint-disable-next-line import/extensions
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { look, PALETTE } from "./look";
import { COURT, netHeight } from "./sim/court";
import { seeded } from "./sim/game";
import { tennis } from "./state";

// ---------------------------------------------------------------- layout

/** Side stands (along x) and end stands (along z). */
const STANDS = {
  wallH: 1.1,
  side: { from: 11.4, rows: 9, depth: 0.95, rise: 0.72, span: 17.2 },
  end: { from: 19.6, rows: 7, depth: 0.95, rise: 0.72, span: 11.4 },
  firstY: 1.5,
};
const MASTS = [
  [-15, -22],
  [15, -22],
  [-15, 22],
  [15, 22],
] as const;
const MAST_H = 24;

// ---------------------------------------------------------------- sky

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }
`;
const skyFrag = /* glsl */ `
  uniform vec3 dayTop;
  uniform vec3 dayLow;
  uniform vec3 nightTop;
  uniform vec3 nightLow;
  uniform float night;
  uniform vec3 sunDir;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 day = mix(dayLow, dayTop, pow(h, 0.55));
    float sun = max(dot(d, sunDir), 0.0);
    day += vec3(1.0, 0.92, 0.75) * (pow(sun, 600.0) * 4.0 + pow(sun, 12.0) * 0.25);
    vec3 nite = mix(nightLow, nightTop, pow(h, 0.45));
    // A few stars, steady.
    vec3 g = floor(d * 160.0);
    float star = step(0.9965, hash(g)) * smoothstep(0.12, 0.4, d.y);
    nite += vec3(star) * 0.8;
    gl_FragColor = vec4(mix(day, nite, night), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const Sky = () => {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          dayTop: { value: PALETTE.skyTop },
          dayLow: { value: PALETTE.skyLow },
          nightTop: { value: PALETTE.nightTop },
          nightLow: { value: PALETTE.nightLow },
          night: { value: 0 },
          sunDir: { value: new Vector3(-0.45, 0.55, -0.7).normalize() },
        },
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );
  const ref = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    material.uniforms.night.value = look.night;
    ref.current?.position.copy(camera.position);
  });
  return (
    <mesh
      ref={ref}
      material={material}
      renderOrder={-990}
      frustumCulled={false}
    >
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
};

// ---------------------------------------------------------------- court

const Court = () => {
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
    const uniforms = {
      uCourt: { value: new Color() },
      uApron: { value: new Color() },
      uGlow: { value: 0 },
    };
    m.onBeforeCompile = (compiled) => {
      const shader = compiled;
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCourt;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvCourt = (modelMatrix * vec4(position, 1.0)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          /* glsl */ `#include <common>
          varying vec3 vCourt;
          uniform vec3 uCourt;
          uniform vec3 uApron;
          uniform float uGlow;
          float segX(vec2 p, float z0, float a) {
            return length(vec2(max(abs(p.x) - a, 0.0), abs(p.y - z0)));
          }
          float segZ(vec2 p, float x0, float z1, float z2) {
            float dz = max(max(z1 - p.y, p.y - z2), 0.0);
            return length(vec2(abs(p.x - x0), dz));
          }
          float courtLines(vec2 p, float px) {
            vec2 q = vec2(p.x, abs(p.y));
            vec2 s = vec2(abs(p.x), abs(p.y));
            float m = 0.0;
            float d;
            // Baselines (wider), sidelines, service lines, centre line, marks.
            d = segX(q, ${COURT.halfLength.toFixed(3)}, ${COURT.halfDoubles.toFixed(3)});
            m = max(m, 1.0 - smoothstep(0.05 - px, 0.05 + px, d));
            d = segZ(s, ${COURT.halfDoubles.toFixed(3)}, 0.0, ${COURT.halfLength.toFixed(3)});
            m = max(m, 1.0 - smoothstep(0.025 - px, 0.025 + px, d));
            d = segZ(s, ${COURT.halfSingles.toFixed(3)}, 0.0, ${COURT.halfLength.toFixed(3)});
            m = max(m, 1.0 - smoothstep(0.025 - px, 0.025 + px, d));
            d = segX(q, ${COURT.service.toFixed(3)}, ${COURT.halfSingles.toFixed(3)});
            m = max(m, 1.0 - smoothstep(0.025 - px, 0.025 + px, d));
            d = segZ(vec2(p.x, abs(p.y)), 0.0, 0.0, ${COURT.service.toFixed(3)});
            m = max(m, 1.0 - smoothstep(0.025 - px, 0.025 + px, d));
            d = segZ(vec2(p.x, abs(p.y)), 0.0, ${(COURT.halfLength - 0.15).toFixed(3)}, ${COURT.halfLength.toFixed(3)});
            m = max(m, 1.0 - smoothstep(0.025 - px, 0.025 + px, d));
            return m;
          }
          float courtHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
        )
        .replace(
          "#include <color_fragment>",
          /* glsl */ `#include <color_fragment>
          vec2 cp = vCourt.xz;
          float px = max(fwidth(cp.x), fwidth(cp.y)) * 0.75;
          float inside = step(abs(cp.x), ${COURT.halfDoubles + 0.9}) * step(abs(cp.y), ${COURT.halfLength + 1.6});
          vec3 base = mix(uApron, uCourt, inside);
          // A faint grain so the surface is not flat paint.
          base *= 0.96 + 0.06 * courtHash(floor(cp * 18.0));
          float line = courtLines(cp, px);
          diffuseColor.rgb = mix(base, vec3(0.92), line);`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          /* glsl */ `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.75, 0.85, 1.0) * line * uGlow;`,
        );
    };
    return { m, uniforms };
  }, []);

  useFrame(() => {
    const k = look.night;
    material.uniforms.uCourt.value
      .copy(PALETTE.court)
      .lerp(PALETTE.courtNight, k);
    material.uniforms.uApron.value
      .copy(PALETTE.apron)
      .lerp(PALETTE.apronNight, k);
    material.uniforms.uGlow.value = k * 0.35;
  });

  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow material={material.m}>
      <planeGeometry
        args={[COURT.apronX * 2 + 0.4, COURT.apronZ * 2 + 0.4, 1, 1]}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------- net

const netFrag = /* glsl */ `
  varying vec2 vUv;
  uniform vec2 cells;
  void main() {
    vec2 c = vUv * cells;
    vec2 g = abs(fract(c) - 0.5);
    vec2 w = fwidth(c);
    float mesh = max(
      smoothstep(0.5 - w.x * 1.2, 0.5, g.x),
      smoothstep(0.5 - w.y * 1.2, 0.5, g.y)
    );
    gl_FragColor = vec4(0.08, 0.09, 0.1, mesh * 0.85 + 0.1);
  }
`;
const netVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** A strip across the court whose top follows the net's sag. */
const netGeometry = (from: number, to: number, segments = 24) => {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const half = COURT.postX + 0.2;
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const x = -half + u * half * 2;
    const h = netHeight(x);
    pos.push(x, h * from, 0, x, h * to, 0);
    uv.push(u, from, u, to);
    if (i < segments) {
      const k = i * 2;
      index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
};

const Net = () => {
  const parts = useMemo(() => {
    const mesh = netGeometry(0.04, 0.94);
    const tape = netGeometry(0.94, 1.0);
    const material = new ShaderMaterial({
      uniforms: { cells: { value: [(COURT.postX * 2) / 0.05, 1 / 0.05] } },
      vertexShader: netVert,
      fragmentShader: netFrag,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });
    return { mesh, tape, material };
  }, []);
  return (
    <group>
      <mesh geometry={parts.mesh} material={parts.material} renderOrder={2} />
      <mesh geometry={parts.tape} castShadow>
        <meshStandardMaterial
          color="#f4f6f8"
          side={DoubleSide}
          roughness={0.6}
        />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * (COURT.postX + 0.2), COURT.netPost / 2, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.045, 0.045, COURT.netPost + 0.04, 10]} />
          <meshStandardMaterial
            color="#2a2d33"
            roughness={0.5}
            metalness={0.3}
          />
        </mesh>
      ))}
    </group>
  );
};

// ---------------------------------------------------------------- stands

type Row = {
  x: number;
  y: number;
  z: number;
  ry: number;
  len: number;
  seats: Color;
};

/** Every row of every stand: where it is, which way it faces, how long. */
const standRows = () => {
  const rows: Row[] = [];
  const { side, end, firstY } = STANDS;
  for (let i = 0; i < side.rows; i += 1) {
    const d = side.from + i * side.depth;
    const y = firstY + i * side.rise;
    const seats = i % 2 ? PALETTE.seatsB : PALETTE.seatsA;
    rows.push({ x: d, y, z: 0, ry: -Math.PI / 2, len: side.span * 2, seats });
    rows.push({ x: -d, y, z: 0, ry: Math.PI / 2, len: side.span * 2, seats });
  }
  for (let i = 0; i < end.rows; i += 1) {
    const d = end.from + i * end.depth;
    const y = firstY + i * end.rise;
    const seats = i % 2 ? PALETTE.seatsB : PALETTE.seatsA;
    rows.push({ x: 0, y, z: d, ry: Math.PI, len: end.span * 2, seats });
    rows.push({ x: 0, y, z: -d, ry: 0, len: end.span * 2, seats });
  }
  return rows;
};

const crowdBodyGeometry = () => {
  const body = new CylinderGeometry(0.17, 0.22, 0.62, 6, 1);
  body.translate(0, 0.31, 0);
  const head = new IcosahedronGeometry(0.12, 0);
  head.translate(0, 0.76, 0);
  // Heads keep the skin colour: mark them in a vertex attribute.
  const mark = (g: BufferGeometry, v: number) => {
    const n = g.getAttribute("position").count;
    g.setAttribute(
      "aHead",
      new Float32BufferAttribute(new Array(n).fill(v), 1),
    );
    return g;
  };
  return mergeGeometries([
    mark(body.toNonIndexed(), 0),
    mark(head.toNonIndexed(), 1),
  ]);
};

const Crowd = ({ rows }: { rows: Row[] }) => {
  const { mesh, uniforms } = useMemo(() => {
    const rnd = seeded(11);
    const spots: { x: number; y: number; z: number; ry: number }[] = [];
    rows.forEach((r) => {
      const n = Math.floor(r.len / 0.62);
      const fwd = new Vector3(0, 0, 1).applyAxisAngle(
        new Vector3(0, 1, 0),
        r.ry,
      );
      const along = new Vector3(1, 0, 0).applyAxisAngle(
        new Vector3(0, 1, 0),
        r.ry,
      );
      for (let i = 0; i < n; i += 1) {
        // A few empty seats.
        if (rnd() >= 0.14) {
          const t = (i + 0.5) / n - 0.5 + (rnd() - 0.5) * 0.004;
          spots.push({
            x: r.x + along.x * t * r.len - fwd.x * 0.05,
            y: r.y + 0.05,
            z: r.z + along.z * t * r.len - fwd.z * 0.05,
            ry: r.ry + (rnd() - 0.5) * 0.4,
          });
        }
      }
    });
    const u = { uTime: { value: 0 }, uCheer: { value: 0 } };
    const material = new MeshLambertMaterial({ color: "#ffffff" });
    material.onBeforeCompile = (compiled) => {
      const shader = compiled;
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uTime;
          uniform float uCheer;
          attribute float aHead;
          varying float vHead;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vHead = aHead;
          float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          float idle = sin(uTime * (0.6 + ph * 0.5) + ph * 6.283) * 0.012;
          float jump = max(0.0, sin(uTime * (7.0 + ph * 3.0) + ph * 6.283)) * 0.22 * uCheer * step(0.25, ph);
          transformed.y += idle + jump;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vHead;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.42, 0.3), vHead);`,
        );
    };
    const im = new InstancedMesh(crowdBodyGeometry(), material, spots.length);
    const o = new Object3D();
    const c = new Color();
    spots.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z);
      o.rotation.set(0, s.ry, 0);
      o.scale.setScalar(0.92 + rnd() * 0.16);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      im.setColorAt(
        i,
        c.set(PALETTE.crowd[Math.floor(rnd() * PALETTE.crowd.length)]),
      );
    });
    im.frustumCulled = false;
    return { mesh: im, uniforms: u };
  }, [rows]);

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
  });
  return <primitive object={mesh} />;
};

const Stands = () => {
  const rows = useMemo(standRows, []);
  const steps = useMemo(() => {
    const mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshLambertMaterial({ color: "#ffffff" }),
      rows.length * 2,
    );
    const m = new Matrix4();
    const o = new Object3D();
    const stand = new Color();
    rows.forEach((r, i) => {
      // The concrete step under each row, down to the ground.
      o.position.set(r.x, r.y / 2, r.z);
      o.rotation.set(0, r.ry, 0);
      o.scale.set(r.len, r.y, STANDS.side.depth);
      o.updateMatrix();
      mesh.setMatrixAt(i * 2, o.matrix);
      mesh.setColorAt(i * 2, stand.copy(PALETTE.stand));
      // The seat band along its front.
      const fwd = new Vector3(0, 0, 1).applyAxisAngle(
        new Vector3(0, 1, 0),
        r.ry,
      );
      o.position.set(r.x + fwd.x * 0.3, r.y + 0.12, r.z + fwd.z * 0.3);
      o.scale.set(r.len, 0.24, 0.3);
      o.updateMatrix();
      m.copy(o.matrix);
      mesh.setMatrixAt(i * 2 + 1, m);
      mesh.setColorAt(i * 2 + 1, r.seats);
    });
    mesh.receiveShadow = false;
    return mesh;
  }, [rows]);

  const walls = useMemo(() => {
    const g: [number, number, number, number, number][] = [
      [COURT.apronX + 0.15, 0, 0.3, COURT.apronZ * 2 + 0.6, 0],
      [-(COURT.apronX + 0.15), 0, 0.3, COURT.apronZ * 2 + 0.6, 0],
      [0, COURT.apronZ + 0.15, COURT.apronX * 2 + 0.6, 0.3, 0],
      [0, -(COURT.apronZ + 0.15), COURT.apronX * 2 + 0.6, 0.3, 0],
    ];
    return g;
  }, []);

  useEffect(
    () => () => {
      steps.geometry.dispose();
      (steps.material as MeshLambertMaterial).dispose();
    },
    [steps],
  );

  return (
    <group>
      <primitive object={steps} />
      {walls.map(([x, z, w, d], i) => (
        // eslint-disable-next-line react/no-array-index-key
        <mesh key={i} position={[x, STANDS.wallH / 2, z]}>
          <boxGeometry args={[w, STANDS.wallH, d]} />
          <meshLambertMaterial color={PALETTE.wall} />
        </mesh>
      ))}
      {/* The ground under the stands, beyond the wall. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
        <planeGeometry args={[80, 90]} />
        <meshLambertMaterial color="#59616b" />
      </mesh>
      <Crowd rows={rows} />
    </group>
  );
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
    const masts = MASTS.map(([x, z]) => {
      const head = new Vector3(x, MAST_H, z);
      const aim = new Vector3(-Math.sign(x) * 2, 0, -Math.sign(z) * 7);
      const dir = aim.clone().sub(head).normalize();
      return { x, z, head, dir, yaw: Math.atan2(-x, -z) };
    });
    return { cone, coneMat, lampMat, masts };
  }, []);

  useFrame(() => {
    parts.coneMat.uniforms.strength.value = look.night * 0.07;
    parts.lampMat.emissiveIntensity = 0.2 + look.night * 3.5;
  });

  return (
    <group>
      {parts.masts.map((m) => (
        <group key={`${m.x},${m.z}`}>
          <mesh position={[m.x, MAST_H / 2, m.z]}>
            <cylinderGeometry args={[0.18, 0.3, MAST_H, 8]} />
            <meshLambertMaterial color="#8b939c" />
          </mesh>
          <mesh
            position={m.head}
            rotation={[0.45, m.yaw, 0]}
            material={parts.lampMat}
          >
            <boxGeometry args={[3.4, 1.8, 0.35]} />
          </mesh>
          <mesh
            position={m.head}
            quaternion={new Object3D().quaternion.setFromUnitVectors(
              new Vector3(0, -1, 0),
              m.dir,
            )}
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

// ---------------------------------------------------------------- lights

const DAY_SUN = new Vector3(-12, 22, -14);
const NIGHT_KEY = new Vector3(4, 30, 6);

const Lights = () => {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const sun = useRef<DirectionalLight>(null);
  const fill = useRef<HemisphereLight>(null);
  const tmp = useMemo(() => new Vector3(), []);
  const colours = useMemo(
    () => ({
      sunDay: new Color("#fff1dc"),
      sunNight: new Color("#e8f0ff"),
      skyDay: new Color("#cfe5ff"),
      skyNight: new Color("#3a4a78"),
      groundDay: new Color("#6d8a5a"),
      groundNight: new Color("#141820"),
    }),
    [],
  );

  // Soft shadows on (before the first frame compiles the materials), and
  // the shell's two default lights turned off: the court brings its own.
  useLayoutEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = PCFSoftShadowMap;
    const own = new Set<Object3D>(
      [sun.current, fill.current].filter(Boolean) as Object3D[],
    );
    const dimmed: { light: AmbientLight | DirectionalLight; was: number }[] =
      [];
    scene.children.forEach((c) => {
      if (
        !own.has(c) &&
        (c instanceof AmbientLight || c instanceof DirectionalLight)
      )
        dimmed.push({ light: c, was: c.intensity });
    });
    const set = (on: boolean) => {
      for (let i = 0; i < dimmed.length; i += 1)
        dimmed[i].light.intensity = on ? dimmed[i].was : 0;
    };
    set(false);
    return () => set(true);
  }, [gl, scene]);

  useFrame(() => {
    const k = look.night;
    const s = sun.current;
    const f = fill.current;
    if (!s || !f) return;
    s.position.copy(tmp.copy(DAY_SUN).lerp(NIGHT_KEY, k));
    s.color.copy(colours.sunDay).lerp(colours.sunNight, k);
    s.intensity = 2.7 - k * 0.7;
    f.color.copy(colours.skyDay).lerp(colours.skyNight, k);
    f.groundColor.copy(colours.groundDay).lerp(colours.groundNight, k);
    f.intensity = 1.25 - k * 0.85;
  });

  return (
    <>
      <hemisphereLight ref={fill} args={["#cfe5ff", "#6d8a5a", 1.2]} />
      <directionalLight
        ref={sun}
        position={DAY_SUN}
        intensity={2.6}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-radius={4}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
    </>
  );
};

// ---------------------------------------------------------------- day/night

/** Eases look.night towards the chosen court (strict ease-out). */
const DayNight = () => {
  useFrame((_, dt) => {
    const target = tennis.night ? 1 : 0;
    look.night +=
      (target - look.night) * (1 - Math.exp(-Math.min(dt, 0.1) * 3.2));
    if (Math.abs(target - look.night) < 0.001) look.night = target;
  });
  return null;
};

export const Stadium = () => (
  <>
    <DayNight />
    <Lights />
    <Sky />
    <Court />
    <Net />
    <Stands />
    <Floodlights />
  </>
);
