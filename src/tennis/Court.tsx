// The court and everything on it:
//   - the blue hard court on its green surround, with a fine grain that
//     catches the light, a little scuffing behind the baselines, and crisp
//     antialiased lines (they glow faintly at night)
//   - the net: mesh, white tape and centre strap, posts with caps
//   - the umpire's chair at one side of the net, the players' benches
//     (with towels and a cooler) at the other
//   - plain boards around the court in front of the low wall, no names
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MeshStandardMaterial,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
} from "three";

import { look, PALETTE } from "./look";
import { COURT, netHeight } from "./sim/court";

// ---------------------------------------------------------------- surface

const Surface = () => {
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
    const uniforms = {
      uCourt: { value: new Color() },
      uApron: { value: new Color() },
      uGlow: { value: 0 },
    };
    const f = (n: number) => n.toFixed(3);
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
          float lineAA(float d, float w, float px) {
            return 1.0 - smoothstep(w - px, w + px, d);
          }
          float courtLines(vec2 p, float px) {
            vec2 q = vec2(p.x, abs(p.y));
            vec2 s = vec2(abs(p.x), abs(p.y));
            float m = lineAA(segX(q, ${f(COURT.halfLength)}, ${f(COURT.halfDoubles)}), 0.05, px);
            m = max(m, lineAA(segZ(s, ${f(COURT.halfDoubles)}, 0.0, ${f(COURT.halfLength)}), 0.025, px));
            m = max(m, lineAA(segZ(s, ${f(COURT.halfSingles)}, 0.0, ${f(COURT.halfLength)}), 0.025, px));
            m = max(m, lineAA(segX(q, ${f(COURT.service)}, ${f(COURT.halfSingles)}), 0.025, px));
            m = max(m, lineAA(segZ(q, 0.0, 0.0, ${f(COURT.service)}), 0.025, px));
            m = max(m, lineAA(segZ(q, 0.0, ${f(COURT.halfLength - 0.15)}, ${f(COURT.halfLength)}), 0.025, px));
            return m;
          }
          float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float cNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), u.x),
                       mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x), u.y);
          }`,
        )
        .replace(
          "#include <color_fragment>",
          /* glsl */ `#include <color_fragment>
          vec2 cp = vCourt.xz;
          float px = max(fwidth(cp.x), fwidth(cp.y)) * 0.75;
          float inside = step(abs(cp.x), ${f(COURT.halfDoubles + 0.9)}) * step(abs(cp.y), ${f(COURT.halfLength + 1.6)});
          vec3 base = mix(uApron, uCourt, inside);
          // Grain at two sizes, faded out with distance so it never shimmers.
          float far = clamp(px * 40.0, 0.0, 1.0);
          float grain = mix(cNoise(cp * 9.0) * 0.6 + cNoise(cp * 41.0) * 0.4, 0.5, far);
          base *= 0.95 + 0.1 * grain;
          // Scuffs where the players stand, behind the baselines.
          float scuff = smoothstep(2.4, 0.4, abs(cp.x))
            * smoothstep(2.2, 0.3, abs(abs(cp.y) - ${f(COURT.halfLength + 0.9)}));
          base = mix(base, base * 1.18 + vec3(0.02), scuff * (0.35 + 0.3 * cNoise(cp * 3.0)));
          float line = courtLines(cp, px);
          diffuseColor.rgb = mix(base, vec3(0.9), line);`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          /* glsl */ `#include <normal_fragment_maps>
          {
            // The surface's fine texture tilts the light a little.
            float e = 0.02;
            float h0 = cNoise(cp * 41.0);
            vec3 tilt = vec3(cNoise(cp * 41.0 + vec2(e * 41.0, 0.0)) - h0, 0.0, cNoise(cp * 41.0 + vec2(0.0, e * 41.0)) - h0);
            normal = normalize(normal + (viewMatrix * vec4(tilt * 0.6 * (1.0 - far), 0.0)).xyz);
          }`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          /* glsl */ `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.75, 0.85, 1.0) * line * uGlow;`,
        );
    };
    m.customProgramCacheKey = () => "court-surface";
    return { m, uniforms };
  }, []);

  useEffect(() => () => material.m.dispose(), [material]);

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

const netVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const netFrag = /* glsl */ `
  varying vec2 vUv;
  uniform vec2 cells;
  uniform float light;
  void main() {
    vec2 c = vUv * cells;
    vec2 g = abs(fract(c) - 0.5);
    vec2 w = fwidth(c);
    float mesh = max(
      smoothstep(0.5 - w.x * 1.2, 0.5, g.x),
      smoothstep(0.5 - w.y * 1.2, 0.5, g.y)
    );
    // A darker band along the bottom, where the mesh doubles up.
    float band = smoothstep(0.12, 0.0, vUv.y);
    gl_FragColor = vec4(vec3(0.06, 0.07, 0.08) * light, mesh * 0.85 + 0.1 + band * 0.3);
  }
`;

/** A strip across the court whose top follows the net's sag. */
const netGeometry = (from: number, to: number, segments = 32) => {
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
    const material = new ShaderMaterial({
      uniforms: {
        cells: { value: [(COURT.postX * 2.0) / 0.045, 1 / 0.045] },
        light: { value: 1 },
      },
      vertexShader: netVert,
      fragmentShader: netFrag,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });
    return {
      mesh: netGeometry(0.03, 0.93),
      tape: netGeometry(0.93, 1.0),
      material,
      white: new MeshStandardMaterial({
        color: "#f4f6f8",
        side: DoubleSide,
        roughness: 0.6,
      }),
      post: new MeshStandardMaterial({
        color: "#1f4a33",
        roughness: 0.4,
        metalness: 0.4,
      }),
    };
  }, []);
  useEffect(
    () => () => {
      parts.mesh.dispose();
      parts.tape.dispose();
      parts.material.dispose();
      parts.white.dispose();
      parts.post.dispose();
    },
    [parts],
  );
  return (
    <group>
      <mesh geometry={parts.mesh} material={parts.material} renderOrder={2} />
      <mesh geometry={parts.tape} material={parts.white} castShadow />
      {/* The centre strap holding the net down. */}
      <mesh position={[0, COURT.netMiddle / 2, 0.004]} material={parts.white}>
        <planeGeometry args={[0.05, COURT.netMiddle]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (COURT.postX + 0.2), 0, 0]}>
          <mesh
            position={[0, COURT.netPost / 2, 0]}
            material={parts.post}
            castShadow
          >
            <cylinderGeometry args={[0.04, 0.045, COURT.netPost, 16]} />
          </mesh>
          <mesh position={[0, COURT.netPost + 0.02, 0]} material={parts.post}>
            <sphereGeometry
              args={[0.048, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]}
            />
          </mesh>
          {/* The winder on the post. */}
          <mesh
            position={[s * 0.06, 0.85, 0]}
            rotation-z={Math.PI / 2}
            material={parts.post}
          >
            <cylinderGeometry args={[0.018, 0.018, 0.08, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// ---------------------------------------------------------------- chair and benches

const Furniture = () => {
  const m = useMemo(
    () => ({
      frame: new MeshStandardMaterial({
        color: "#1f4a33",
        roughness: 0.45,
        metalness: 0.3,
      }),
      seat: new MeshStandardMaterial({ color: "#f2f3f5", roughness: 0.6 }),
      towel: new MeshStandardMaterial({ color: "#e86f5a", roughness: 0.9 }),
      towel2: new MeshStandardMaterial({ color: "#f4d968", roughness: 0.9 }),
      cooler: new MeshStandardMaterial({ color: "#2f62a6", roughness: 0.5 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);
  const chairX = -(COURT.halfDoubles + 1.1);
  const benchX = COURT.halfDoubles + 1.3;
  return (
    <group>
      {/* Umpire's chair: four legs, a footrest, the seat up high. */}
      <group position={[chairX, 0, 0]}>
        {[-1, 1].flatMap((a) =>
          [-1, 1].map((b) => (
            <mesh
              key={`${a}${b}`}
              position={[a * 0.35, 1.0, b * 0.35]}
              material={m.frame}
              castShadow
            >
              <cylinderGeometry args={[0.03, 0.035, 2.0, 8]} />
            </mesh>
          )),
        )}
        {[0.5, 1.0].map((y) => (
          <mesh key={y} position={[0.35, y, 0]} material={m.frame}>
            <boxGeometry args={[0.04, 0.04, 0.72]} />
          </mesh>
        ))}
        <mesh position={[0, 2.02, 0]} material={m.frame} castShadow>
          <boxGeometry args={[0.85, 0.06, 0.85]} />
        </mesh>
        <mesh position={[-0.05, 2.3, 0]} material={m.seat} castShadow>
          <boxGeometry args={[0.5, 0.08, 0.55]} />
        </mesh>
        <mesh position={[-0.3, 2.62, 0]} material={m.seat} castShadow>
          <boxGeometry args={[0.07, 0.6, 0.55]} />
        </mesh>
        <mesh position={[0.25, 2.2, 0]} material={m.frame}>
          <boxGeometry args={[0.04, 0.3, 0.8]} />
        </mesh>
      </group>
      {/* Two benches, a towel on each, a cooler between them. */}
      {[-1, 1].map((s) => (
        <group key={s} position={[benchX, 0, s * 1.7]}>
          <mesh position={[0, 0.45, 0]} material={m.seat} castShadow>
            <boxGeometry args={[0.45, 0.06, 1.6]} />
          </mesh>
          <mesh position={[0.2, 0.75, 0]} material={m.seat} castShadow>
            <boxGeometry args={[0.05, 0.55, 1.6]} />
          </mesh>
          {[-0.7, 0.7].map((z) => (
            <mesh key={z} position={[0, 0.22, z]} material={m.frame}>
              <boxGeometry args={[0.4, 0.44, 0.05]} />
            </mesh>
          ))}
          <mesh
            position={[-0.02, 0.5, 0.3 * s]}
            material={s > 0 ? m.towel : m.towel2}
          >
            <boxGeometry args={[0.38, 0.04, 0.5]} />
          </mesh>
        </group>
      ))}
      <mesh position={[benchX, 0.25, 0]} material={m.cooler} castShadow>
        <boxGeometry args={[0.4, 0.5, 0.45]} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------- boards

/** Plain board panels: dark green with a light top stripe and seams. */
const boardTexture = () => {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#1d5a3b";
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = "#2a7350";
    g.fillRect(0, 8, 256, 2);
    g.fillStyle = "#e9eef2";
    g.fillRect(0, 0, 256, 5);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, 0, 2, 64);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.anisotropy = 4;
  return t;
};

const BOARD_H = 1.1;

const Boards = () => {
  const parts = useMemo(() => {
    const map = boardTexture();
    const mk = (length: number) => {
      const t = map.clone();
      t.repeat.set(length / 3, 1);
      t.needsUpdate = true;
      return new MeshStandardMaterial({ map: t, roughness: 0.7 });
    };
    return {
      long: mk(COURT.apronZ * 2 + 0.6),
      short: mk(COURT.apronX * 2 + 0.6),
      map,
    };
  }, []);
  useEffect(
    () => () => {
      parts.long.map?.dispose();
      parts.short.map?.dispose();
      parts.long.dispose();
      parts.short.dispose();
      parts.map.dispose();
    },
    [parts],
  );
  const walls: [number, number, number, number, boolean][] = [
    [COURT.apronX + 0.15, 0, 0.3, COURT.apronZ * 2 + 0.6, true],
    [-(COURT.apronX + 0.15), 0, 0.3, COURT.apronZ * 2 + 0.6, true],
    [0, COURT.apronZ + 0.15, COURT.apronX * 2 + 0.6, 0.3, false],
    [0, -(COURT.apronZ + 0.15), COURT.apronX * 2 + 0.6, 0.3, false],
  ];
  return (
    <group>
      {walls.map(([x, z, w, d, long]) => (
        <mesh
          key={`${x},${z}`}
          position={[x, BOARD_H / 2, z]}
          material={long ? parts.long : parts.short}
          receiveShadow
        >
          <boxGeometry args={[w, BOARD_H, d]} />
        </mesh>
      ))}
    </group>
  );
};

export const Court = () => (
  <>
    <Surface />
    <Net />
    <Furniture />
    <Boards />
  </>
);
