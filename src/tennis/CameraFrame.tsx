// Your camera, small, in the top-right corner: the live picture (exactly
// what the rest of the app gets from the session: mirrored on a webcam,
// cover-fitted, never stretched) clipped to a rounded panel with a Night
// glass edge and a soft shadow. Picture, edge and shadow are one quad drawn
// from one rect (layout.ts), so they can never drift apart at any size.
// It is hidden while there is no camera picture.
//
// A faint ring sits on each tracked palm so you can see what is being read:
// Arles on the hand that plays, white on the other, and it flashes open when
// a swing is read.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ShaderMaterial, SRGBColorSpace, type Mesh } from "three";
import { useXRCameraTexture } from "@vincentt-xr/sdk/low-level";

import { hands } from "./HandInput";
import { FRAME_RADIUS, frameRect } from "./layout";

/** Room around the panel for its shadow (CSS px). */
const MARGIN = 28;

const vert = /* glsl */ `
  uniform vec4 rect;   // panel: left, top, width, height (CSS px)
  uniform vec2 screen; // CSS px
  uniform float margin;
  varying vec2 vPx;    // CSS px from the panel's top-left
  void main() {
    vec2 size = rect.zw + 2.0 * margin;
    vec2 local = vec2(uv.x, 1.0 - uv.y) * size - margin;
    vPx = local;
    vec2 px = rect.xy + local;
    gl_Position = vec4(px.x / screen.x * 2.0 - 1.0, 1.0 - px.y / screen.y * 2.0, 0.0, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform sampler2D cam;
  uniform float camLinear;
  uniform vec4 rect;
  uniform float radius;
  uniform float screenAspect;
  uniform vec4 palms;      // left u,v  right u,v (screen, v down)
  uniform vec2 shown;      // 0..1 each
  uniform vec2 flash;      // 0..1 each (1 = just swung)
  uniform float playing;   // 0 = left plays, 1 = right plays
  varying vec2 vPx;

  vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float roundedBox(vec2 p, vec2 halfSize, float r) {
    vec2 q = abs(p) - (halfSize - r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  // Panel uv (0..1, y up) → camera picture uv (cover fit), and back.
  // A crop from the top and bottom sits a little high: faces and raised
  // hands are in the upper part of a selfie.
  float cropMid(float k) { return min(0.5 + 0.12, 1.0 - 0.5 * k); }
  vec2 toCam(vec2 p, float pa) {
    if (pa > screenAspect) {
      float k = screenAspect / pa;
      return vec2(p.x, cropMid(k) + (p.y - 0.5) * k);
    }
    return vec2(0.5 + (p.x - 0.5) * pa / screenAspect, p.y);
  }
  vec2 toPanel(vec2 c, float pa) {
    if (pa > screenAspect) {
      float k = screenAspect / pa;
      return vec2(c.x, 0.5 + (c.y - cropMid(k)) / k);
    }
    return vec2(0.5 + (c.x - 0.5) * screenAspect / pa, c.y);
  }
  float ring(vec2 px, vec2 at, float r, float w) {
    return 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.2, abs(length(px - at) - r));
  }

  void main() {
    vec2 size = rect.zw;
    vec2 hs = size * 0.5;
    float d = roundedBox(vPx - hs, hs, radius);

    // The soft drop shadow outside the panel (0 8px 24px, 22 %).
    if (d > 0.0) {
      float ds = roundedBox(vPx - hs - vec2(0.0, 8.0), hs, radius);
      float a = 0.22 * (1.0 - smoothstep(-6.0, 22.0, ds));
      a *= smoothstep(0.0, 1.0, d);
      if (a < 0.004) discard;
      gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      return;
    }

    float pa = size.x / size.y;
    vec2 uv = vec2(vPx.x / size.x, 1.0 - vPx.y / size.y);
    vec3 c = texture2D(cam, toCam(uv, pa)).rgb;
    if (camLinear > 0.5) c = toSrgb(c);

    // Palm rings.
    vec3 arles = vec3(0.957, 0.851, 0.408);
    for (int i = 0; i < 2; i++) {
      float s = i == 0 ? shown.x : shown.y;
      if (s < 0.02) continue;
      vec2 uvScreen = i == 0 ? palms.xy : palms.zw;
      vec2 p = toPanel(vec2(uvScreen.x, 1.0 - uvScreen.y), pa);
      vec2 at = vec2(p.x, 1.0 - p.y) * size;
      float f = i == 0 ? flash.x : flash.y;
      float isPlaying = i == 0 ? 1.0 - playing : playing;
      vec3 col = mix(vec3(1.0), arles, isPlaying);
      float r = 7.0 + f * 9.0;
      float a = ring(vPx, at, r, 2.0) * s * (0.75 + 0.25 * f);
      a += (1.0 - smoothstep(0.0, 3.0, length(vPx - at))) * s * 0.9;
      c = mix(c, col, clamp(a, 0.0, 1.0) * 0.85);
    }

    // Night glass edge: a 1px light line, and a soft highlight along the top.
    float edge = 1.0 - smoothstep(0.0, 1.0, abs(d + 0.5));
    c = mix(c, vec3(0.92, 0.965, 0.99), edge * 0.35);
    float top = (1.0 - smoothstep(0.0, 2.0, vPx.y)) * (1.0 - smoothstep(-3.0, 0.0, d + 2.0));
    c = mix(c, vec3(1.0), top * 0.22);
    // Antialiased outer edge.
    float inside = 1.0 - smoothstep(-0.5, 0.5, d);
    gl_FragColor = vec4(c, inside);
  }
`;

export const CameraFrame = () => {
  const texture = useXRCameraTexture();
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          cam: { value: null },
          camLinear: { value: 0 },
          rect: { value: [16, 16, 120, 160] },
          radius: { value: FRAME_RADIUS },
          margin: { value: MARGIN },
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
    const m = mesh.current;
    if (m) m.visible = !!texture;
    if (!texture) return;
    const u = material.uniforms;
    const r = frameRect(size.width, size.height);
    u.rect.value = [r.left, r.top, r.width, r.height];
    u.screen.value = [size.width, size.height];
    u.screenAspect.value = size.width / Math.max(1, size.height);
    u.cam.value = texture;
    u.camLinear.value = texture.colorSpace === SRGBColorSpace ? 1 : 0;
    u.palms.value = [hands.left.u, hands.left.v, hands.right.u, hands.right.v];
    u.shown.value = [hands.left.shown, hands.right.shown];
    const now = performance.now();
    const f = (t: number) => Math.max(0, 1 - (now - t) / 350);
    u.flash.value = [f(hands.left.swungAt), f(hands.right.swungAt)];
    u.playing.value = hands.active === "right" ? 1 : 0;
  });

  return (
    <mesh
      ref={mesh}
      material={material}
      renderOrder={1500}
      frustumCulled={false}
      visible={false}
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
};
