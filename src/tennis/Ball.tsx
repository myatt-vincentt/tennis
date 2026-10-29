// The ball and everything that makes it easy to read:
//   - the ball itself, drawn a little bigger than real (bigger still in the
//     side view, where it is far away), spinning
//   - a soft round shadow on the court right under it, smaller and darker
//     as it comes down, so you can always tell its height
//   - a short fading trail when it flies fast
//   - a ring on the court where it bounces: white when in, coral when out
//   - when it comes to you, a thin ring around it that closes in and lands
//     on the ball at the perfect moment to hit (Arles when it's time)
//   - a ring flash where you hit it, coloured by your timing
//   - a sparkle burst where the rally ended
// The computer tosses the ball up before it serves.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Points,
  RingGeometry,
  ShaderMaterial,
  Vector3,
  type Group,
} from "three";

import { easeOut } from "./look";
import type { Timing } from "./sim/shots";
import { onGameEvents, tennis } from "./state";

const ARLES = new Color("#f4d968");
const CORAL = new Color("#ff7a66");
const WHITE = new Color("#ffffff");
const SOFT = new Color("#a9d4ff");

/** Drawn ball radius (m) and how much bigger per view. */
const BALL_R = 0.06;
const VIEW_SCALE = { behind: 1.35, first: 1.0, side: 2.1 };

export const TIMING_COLOUR: Record<Timing, Color> = {
  perfect: ARLES,
  good: WHITE,
  early: SOFT,
  late: SOFT,
};

const TRAIL = 14;
const SPARKS = 56;

const pointsVert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float scale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const pointsFrag = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.2, 1.0, d)) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

const makePoints = (n: number) => {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("aSize", new BufferAttribute(new Float32Array(n), 1));
  g.setAttribute("aAlpha", new BufferAttribute(new Float32Array(n), 1));
  g.setAttribute(
    "aColor",
    new BufferAttribute(new Float32Array(n * 3).fill(1), 3),
  );
  const m = new ShaderMaterial({
    uniforms: { scale: { value: 600 } },
    vertexShader: pointsVert,
    fragmentShader: pointsFrag,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const p = new Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 20;
  return p;
};

const shadowFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float opacity;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.0, 1.0, d)) * opacity;
    gl_FragColor = vec4(0.0, 0.02, 0.05, a);
  }
`;
const uvVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

type Marker = { mesh: Mesh; born: number; life: number };
type Flash = { mesh: Mesh; born: number };

export const Ball = () => {
  const ball = useRef<Mesh>(null);
  const shadow = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const markersRoot = useRef<Group>(null);
  const scale = useRef(VIEW_SCALE.behind);
  const history = useRef<Vector3[]>([]);
  const sparkle = useRef({ born: -10, at: new Vector3(), v: [] as Vector3[] });

  const fx = useMemo(() => {
    const shadowMat = new ShaderMaterial({
      uniforms: { opacity: { value: 0.5 } },
      vertexShader: uvVert,
      fragmentShader: shadowFrag,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const markerGeo = new RingGeometry(0.16, 0.24, 28);
    markerGeo.rotateX(-Math.PI / 2);
    const markers: Marker[] = Array.from({ length: 6 }, () => {
      const mesh = new Mesh(
        markerGeo,
        new MeshBasicMaterial({
          color: WHITE,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          toneMapped: false,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 3;
      return { mesh, born: -10, life: 1.4 };
    });
    const flashGeo = new RingGeometry(0.8, 1, 40);
    const flashes: Flash[] = Array.from({ length: 3 }, () => {
      const mesh = new Mesh(
        flashGeo,
        new MeshBasicMaterial({
          color: WHITE,
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
          side: DoubleSide,
          toneMapped: false,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 30;
      return { mesh, born: -10 };
    });
    const ringMat = new MeshBasicMaterial({
      color: WHITE,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    return {
      shadowMat,
      markers,
      flashes,
      ringGeo: new RingGeometry(0.92, 1, 40),
      ringMat,
      trail: makePoints(TRAIL),
      sparks: makePoints(SPARKS),
    };
  }, []);

  useEffect(
    () =>
      onGameEvents((e) => {
        const now = e.t;
        if (e.kind === "bounce") {
          const m = fx.markers.reduce((a, b) => (a.born < b.born ? a : b));
          m.born = now;
          m.life = e.in ? 1.3 : 3.2;
          m.mesh.position.set(e.x, 0.006, e.z);
          (m.mesh.material as MeshBasicMaterial).color.copy(
            e.in ? WHITE : CORAL,
          );
          m.mesh.visible = true;
        } else if (e.kind === "hit" && e.who === "you" && e.timing) {
          const f = fx.flashes.reduce((a, b) => (a.born < b.born ? a : b));
          f.born = now;
          f.mesh.position.set(e.at.x, e.at.y, e.at.z);
          (f.mesh.material as MeshBasicMaterial).color.copy(
            TIMING_COLOUR[e.timing],
          );
          f.mesh.visible = true;
        } else if (e.kind === "over") {
          const s = sparkle.current;
          s.born = now;
          s.at.set(e.at.x, Math.max(0.1, e.at.y), e.at.z);
          s.v = Array.from({ length: SPARKS }, () => {
            const a = Math.random() * Math.PI * 2;
            const up = 0.6 + Math.random() * 2.6;
            const out = 0.5 + Math.random() * 2.2;
            return new Vector3(Math.cos(a) * out, up, Math.sin(a) * out);
          });
          const col = fx.sparks.geometry.getAttribute(
            "aColor",
          ) as BufferAttribute;
          for (let i = 0; i < SPARKS; i += 1) {
            const c = i % 3 === 0 ? WHITE : ARLES;
            col.setXYZ(i, c.r, c.g, c.b);
          }
          col.needsUpdate = true;
        }
      }),
    [fx],
  );

  useEffect(
    () => () => {
      fx.shadowMat.dispose();
      fx.ringGeo.dispose();
      fx.ringMat.dispose();
      fx.trail.geometry.dispose();
      (fx.trail.material as ShaderMaterial).dispose();
      fx.sparks.geometry.dispose();
      (fx.sparks.material as ShaderMaterial).dispose();
    },
    [fx],
  );

  useFrame(({ camera, size }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const { game } = tennis;
    const t = game.time;
    const b = ball.current;
    if (!b) return;

    // Where to draw it: the flight, or the toss before the serve.
    const p = new Vector3(game.ball.p.x, game.ball.p.y, game.ball.p.z);
    if (game.phase === "serve" || game.phase === "start") {
      const u = game.phase === "serve" ? 1 - game.serveIn() / 1.1 : 0;
      p.set(game.cpu.x + 0.25, 1.0 + 1.55 * easeOut(u), game.cpu.z + 0.15);
    }
    const want = VIEW_SCALE[tennis.view];
    scale.current += (want - scale.current) * (1 - Math.exp(-dt * 4));
    const r = BALL_R * scale.current;
    b.position.copy(p);
    b.scale.setScalar(r);
    b.rotation.x += game.ball.spin * dt * 0.2;
    b.visible = game.phase !== "over" || t - sparkle.current.born < 0.25;

    // Soft shadow under it.
    const sh = shadow.current;
    if (sh) {
      const h = Math.max(0, p.y);
      sh.position.set(p.x, 0.005, p.z);
      sh.scale.setScalar(r * 3.2 + h * 0.08);
      fx.shadowMat.uniforms.opacity.value =
        (0.55 / (1 + h * 0.5)) * (b.visible ? 1 : 0);
    }

    // Trail at speed.
    const hist = history.current;
    hist.unshift(p.clone());
    if (hist.length > TRAIL) hist.length = TRAIL;
    const speed = Math.hypot(game.ball.v.x, game.ball.v.y, game.ball.v.z);
    const trailK =
      game.phase === "rally" ? Math.min(1, Math.max(0, (speed - 10) / 10)) : 0;
    const pos = fx.trail.geometry.getAttribute("position") as BufferAttribute;
    const sz = fx.trail.geometry.getAttribute("aSize") as BufferAttribute;
    const al = fx.trail.geometry.getAttribute("aAlpha") as BufferAttribute;
    for (let i = 0; i < TRAIL; i += 1) {
      const q = hist[Math.min(i, hist.length - 1)];
      pos.setXYZ(i, q.x, q.y, q.z);
      const k = 1 - i / TRAIL;
      sz.setX(i, r * 2.2 * k);
      al.setX(i, i === 0 ? 0 : 0.3 * k * trailK);
    }
    pos.needsUpdate = true;
    sz.needsUpdate = true;
    al.needsUpdate = true;
    const pxScale =
      size.height /
      (2 *
        Math.tan(((camera as { fov?: number }).fov ?? 45) * (Math.PI / 360)));
    (fx.trail.material as ShaderMaterial).uniforms.scale.value = pxScale;
    (fx.sparks.material as ShaderMaterial).uniforms.scale.value = pxScale;

    // Bounce rings fade out.
    for (let i = 0; i < fx.markers.length; i += 1) {
      const m = fx.markers[i];
      const age = (t - m.born) / m.life;
      const mat = m.mesh.material as MeshBasicMaterial;
      mat.opacity = 0.9 * (1 - easeOut(age));
      m.mesh.scale.setScalar(1 + easeOut(Math.min(1, age * 3)) * 0.4);
      if (age >= 1) m.mesh.visible = false;
    }

    // Hit flashes: a ring opening at the contact point.
    for (let i = 0; i < fx.flashes.length; i += 1) {
      const f = fx.flashes[i];
      const age = (t - f.born) / 0.4;
      f.mesh.quaternion.copy(camera.quaternion);
      f.mesh.scale.setScalar(0.12 + easeOut(age) * 0.4);
      (f.mesh.material as MeshBasicMaterial).opacity =
        0.95 * (1 - easeOut(age));
      if (age >= 1) f.mesh.visible = false;
    }

    // The closing timing ring around a ball coming to you.
    const rg = ring.current;
    if (rg) {
      const inc = game.incoming;
      const left = inc && inc.who === "you" ? inc.t - t : -1;
      const show = left > -0.08 && left < 0.75;
      rg.visible = show;
      if (show) {
        const k = Math.max(0, left) / 0.75;
        rg.position.copy(p);
        rg.quaternion.copy(camera.quaternion);
        rg.scale.setScalar(r * (1.5 + 5 * k));
        fx.ringMat.opacity = 0.85 * easeOut((1 - k) * 2.5);
        fx.ringMat.color.copy(Math.abs(left) < 0.075 ? ARLES : WHITE);
      }
    }

    // Sparkle burst where the rally ended.
    const s = sparkle.current;
    const age = t - s.born;
    const sp = fx.sparks.geometry.getAttribute("position") as BufferAttribute;
    const ss = fx.sparks.geometry.getAttribute("aSize") as BufferAttribute;
    const sa = fx.sparks.geometry.getAttribute("aAlpha") as BufferAttribute;
    const live = age >= 0 && age < 1.6 && s.v.length === SPARKS;
    fx.sparks.visible = live;
    if (live) {
      for (let i = 0; i < SPARKS; i += 1) {
        const v = s.v[i];
        sp.setXYZ(
          i,
          s.at.x + v.x * age,
          Math.max(0.02, s.at.y + v.y * age - 2.2 * age * age),
          s.at.z + v.z * age,
        );
        ss.setX(i, 0.09 * (1 - age / 1.6) + 0.02);
        sa.setX(
          i,
          (1 - easeOut(age / 1.6)) * (0.6 + 0.4 * Math.sin(age * 30 + i)),
        );
      }
      sp.needsUpdate = true;
      ss.needsUpdate = true;
      sa.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh ref={ball} castShadow={false}>
        <sphereGeometry args={[1, 18, 12]} />
        <meshStandardMaterial
          color="#d9f04a"
          emissive="#a6c21a"
          emissiveIntensity={0.35}
          roughness={0.6}
        />
      </mesh>
      <mesh
        ref={shadow}
        rotation-x={-Math.PI / 2}
        material={fx.shadowMat}
        renderOrder={2}
      >
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh
        ref={ring}
        geometry={fx.ringGeo}
        material={fx.ringMat}
        renderOrder={31}
      />
      <group ref={markersRoot}>
        {fx.markers.map((m) => (
          <primitive key={m.mesh.uuid} object={m.mesh} />
        ))}
        {fx.flashes.map((f) => (
          <primitive key={f.mesh.uuid} object={f.mesh} />
        ))}
      </group>
      <primitive object={fx.trail} />
      <primitive object={fx.sparks} />
    </>
  );
};
