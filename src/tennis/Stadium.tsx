// The stadium: sky, light and the day / night blend, around the court
// (Court.tsx) and the stands (Stands.tsx).
//
// Day: a bright sky with soft drifting clouds and a warm sun with soft
// shadows. Night: a dark sky with a few stars and a glow over the stadium,
// the floodlights on (cool white, from high above), darker stands and court
// lines that glow a little. The two blend smoothly (look.night).
//
// Light: one sky / ground fill and one shadow-casting key light (the sun by
// day, the floodlights' combined light by night), plus a soft studio
// environment for gentle reflections. The 3D scene gets a neutral tone
// curve so bright highlights roll off instead of clipping. The players and
// the net cast real shadows; the players and the ball also have soft
// contact shadows. On slower devices (quality.ts) the cast shadows get
// smaller or go, and the crowd thins out.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AmbientLight,
  BackSide,
  Color,
  DirectionalLight,
  HemisphereLight,
  NeutralToneMapping,
  Object3D,
  PCFSoftShadowMap,
  PMREMGenerator,
  ShaderMaterial,
  Vector3,
  type Mesh,
  type Texture,
} from "three";
// eslint-disable-next-line import/extensions
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { Court } from "./Court";
import { look, PALETTE } from "./look";
import { detailNow, SHADOW_SIZE, useDetailLevel } from "./quality";
import { Stands } from "./Stands";
import { tennis } from "./state";

// ---------------------------------------------------------------- sky

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFrag = /* glsl */ `
  uniform vec3 dayTop;
  uniform vec3 dayLow;
  uniform vec3 nightTop;
  uniform vec3 nightLow;
  uniform float night;
  uniform float time;
  uniform vec3 sunDir;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), u.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 day = mix(dayLow, dayTop, pow(h, 0.55));
    float sun = max(dot(d, sunDir), 0.0);
    day += vec3(1.0, 0.92, 0.75) * (pow(sun, 600.0) * 4.0 + pow(sun, 12.0) * 0.25);
    // Soft clouds, drifting slowly, thinning towards the horizon.
    vec2 cp = d.xz / (d.y + 0.18) * 1.4 + vec2(time * 0.004, time * 0.002);
    float cloud = smoothstep(0.5, 0.78, fbm(cp)) * smoothstep(0.02, 0.25, d.y);
    vec3 cloudCol = mix(vec3(0.82, 0.86, 0.92), vec3(1.0), fbm(cp * 2.0 + 3.0));
    day = mix(day, cloudCol, cloud * 0.85);

    vec3 nite = mix(nightLow, nightTop, pow(h, 0.45));
    // A few stars, steady.
    vec3 g = floor(d * 160.0);
    float star = step(0.9965, hash(g)) * smoothstep(0.12, 0.4, d.y);
    nite += vec3(star) * 0.8;
    // The stadium's own glow, low over the stands.
    nite += vec3(0.16, 0.18, 0.26) * exp(-max(d.y, 0.0) * 7.0);
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
          time: { value: 0 },
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
  useEffect(() => () => material.dispose(), [material]);
  const ref = useRef<Mesh>(null);
  useFrame(({ camera, clock }) => {
    material.uniforms.night.value = look.night;
    material.uniforms.time.value = clock.elapsedTime;
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

// ---------------------------------------------------------------- lights

const DAY_SUN = new Vector3(-12, 22, -14);
const NIGHT_KEY = new Vector3(4, 30, 6);

const Lights = () => {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const sun = useRef<DirectionalLight>(null);
  const fill = useRef<HemisphereLight>(null);
  const tmp = useMemo(() => new Vector3(), []);
  useDetailLevel();
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

  // A soft studio environment for reflections (made once, in code).
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env: Texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const before = scene.environment;
    scene.environment = env;
    pmrem.dispose();
    return () => {
      scene.environment = before;
      env.dispose();
    };
  }, [gl, scene]);

  // The shell's two default lights are turned off: the court brings its own.
  useLayoutEffect(() => {
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
  }, [scene]);

  useFrame(() => {
    // The canvas is set up flat (no shadows, no tone curve) and can be
    // reconfigured on a resize, so these are kept on every frame.
    if (!gl.shadowMap.enabled || gl.shadowMap.type !== PCFSoftShadowMap) {
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = PCFSoftShadowMap;
      gl.shadowMap.needsUpdate = true;
    }
    if (gl.toneMapping !== NeutralToneMapping) {
      gl.toneMapping = NeutralToneMapping;
      gl.toneMappingExposure = 1.05;
    }
    const k = look.night;
    const s = sun.current;
    const f = fill.current;
    if (!s || !f) return;
    // Shadows by device: smaller on medium, none on low.
    const size = SHADOW_SIZE[detailNow()];
    s.castShadow = size > 0;
    if (size > 0 && s.shadow.mapSize.x !== size) {
      s.shadow.mapSize.set(size, size);
      s.shadow.map?.dispose();
      s.shadow.map = null;
    }
    s.position.copy(tmp.copy(DAY_SUN).lerp(NIGHT_KEY, k));
    s.color.copy(colours.sunDay).lerp(colours.sunNight, k);
    s.intensity = 2.5 - k * 0.6;
    f.color.copy(colours.skyDay).lerp(colours.skyNight, k);
    f.groundColor.copy(colours.groundDay).lerp(colours.groundNight, k);
    f.intensity = 1.0 - k * 0.7;
    scene.environmentIntensity = 0.45 - k * 0.3;
  });

  return (
    <>
      <hemisphereLight ref={fill} args={["#cfe5ff", "#6d8a5a", 1.0]} />
      <directionalLight
        ref={sun}
        position={DAY_SUN}
        intensity={2.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
        shadow-normalBias={0.025}
        shadow-radius={5}
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
    <Stands />
  </>
);
