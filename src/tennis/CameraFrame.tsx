// Your camera, small, in the top-left corner: a rounded panel with the live
// mirrored picture (cover-fitted, nothing stretched) and a Night glass edge.
// A faint ring sits on each tracked palm so you can see what is being read:
// Arles on the hand that plays, white on the other, and it flashes open
// when a swing is read.
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { ShaderMaterial, SRGBColorSpace } from "three";
import { useXRCameraTexture } from "@vincentt-xr/sdk/low-level";

import { hands } from "./HandInput";
import { frameRect } from "./layout";

const vert = /* glsl */ `
  uniform vec4 rect;   // x, y (top-left, px), width, height
  uniform vec2 screen; // px
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec2 px = rect.xy + vec2(uv.x, 1.0 - uv.y) * rect.zw;
    gl_Position = vec4(px.x / screen.x * 2.0 - 1.0, 1.0 - px.y / screen.y * 2.0, 0.0, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform sampler2D cam;
  uniform float hasCam;
  uniform float camLinear;
  uniform vec4 rect;
  uniform float screenAspect;
  uniform vec4 palms;      // left u,v  right u,v (screen, v down)
  uniform vec2 shown;      // 0..1 each
  uniform vec2 flash;      // 0..1 each (1 = just swung)
  uniform float playing;   // 0 = left plays, 1 = right plays
  varying vec2 vUv;

  vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  // Panel uv → camera picture uv (cover fit), and back.
  vec2 toCam(vec2 p, float pa) {
    if (pa > screenAspect) return vec2(p.x, 0.5 + (p.y - 0.5) * screenAspect / pa);
    return vec2(0.5 + (p.x - 0.5) * pa / screenAspect, p.y);
  }
  vec2 toPanel(vec2 c, float pa) {
    if (pa > screenAspect) return vec2(c.x, 0.5 + (c.y - 0.5) * pa / screenAspect);
    return vec2(0.5 + (c.x - 0.5) * screenAspect / pa, c.y);
  }

  float ring(vec2 px, vec2 at, float r, float w) {
    return 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.2, abs(length(px - at) - r));
  }

  void main() {
    vec2 size = rect.zw;
    float pa = size.x / size.y;
    vec2 px = vUv * size;
    // Rounded corners.
    float rad = 14.0;
    vec2 q = abs(px - size * 0.5) - (size * 0.5 - rad);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
    float inside = 1.0 - smoothstep(-0.75, 0.75, d);
    if (inside <= 0.0) discard;

    vec3 c = vec3(0.137, 0.145, 0.157);
    if (hasCam > 0.5) {
      vec3 v = texture2D(cam, toCam(vUv, pa)).rgb;
      if (camLinear > 0.5) v = toSrgb(v);
      c = v;
    }

    // Palm rings.
    vec3 arles = vec3(0.957, 0.851, 0.408);
    for (int i = 0; i < 2; i++) {
      float s = i == 0 ? shown.x : shown.y;
      if (s < 0.02) continue;
      vec2 uvScreen = i == 0 ? palms.xy : palms.zw;
      vec2 at = toPanel(vec2(uvScreen.x, 1.0 - uvScreen.y), pa) * size;
      float f = i == 0 ? flash.x : flash.y;
      float isActive = i == 0 ? 1.0 - playing : playing;
      vec3 col = mix(vec3(1.0), arles, isActive);
      float r = 7.0 + f * 9.0;
      float a = ring(px, at, r, 2.0) * s * (0.75 + 0.25 * f);
      a += (1.0 - smoothstep(0.0, 3.0, length(px - at))) * s * 0.9;
      c = mix(c, col, clamp(a, 0.0, 1.0) * 0.85);
    }
    gl_FragColor = vec4(c, inside);
  }
`;

export const CameraFrame = () => {
  const texture = useXRCameraTexture();
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          cam: { value: null },
          hasCam: { value: 0 },
          camLinear: { value: 0 },
          rect: { value: [16, 16, 120, 160] },
          screen: { value: [1, 1] },
          screenAspect: { value: 1 },
          palms: { value: [0.5, 0.5, 0.5, 0.5] },
          shown: { value: [0, 0] },
          flash: { value: [0, 0] },
          playing: { value: 1 },
        },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useFrame(({ size }) => {
    const u = material.uniforms;
    const r = frameRect(size.width, size.height);
    u.rect.value = [r.left, r.top, r.width, r.height];
    u.screen.value = [size.width, size.height];
    u.screenAspect.value = size.width / Math.max(1, size.height);
    u.cam.value = texture ?? null;
    u.hasCam.value = texture ? 1 : 0;
    u.camLinear.value = texture?.colorSpace === SRGBColorSpace ? 1 : 0;
    u.palms.value = [hands.left.u, hands.left.v, hands.right.u, hands.right.v];
    u.shown.value = [hands.left.shown, hands.right.shown];
    const now = performance.now();
    const f = (t: number) => Math.max(0, 1 - (now - t) / 350);
    u.flash.value = [f(hands.left.swungAt), f(hands.right.swungAt)];
    u.playing.value = hands.active === "right" ? 1 : 0;
  });

  return (
    <mesh material={material} renderOrder={1500} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
};
