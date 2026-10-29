// The players' body parts and racket, built in code from smooth turned
// shapes (lathes) with soft normals: a shirt with a shaped chest and
// shoulders, shorts, tapered arms and legs with calves, socks and trainers,
// a head with jaw, nose, ears, eyes and hair, and a strung racket.
//
// Shirt and shorts get a fabric look in the shader: a few soft folds (they
// bend the light, not the shape) and a fine weave.
import {
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CanvasTexture,
  EllipseCurve,
  LatheGeometry,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  CylinderGeometry,
  type Material,
} from "three";
// eslint-disable-next-line import/extensions
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
// eslint-disable-next-line import/extensions
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A turned shape from (radius, y) pairs, top to bottom, smoothed with a
 * spline so it has no hard rings. `depth` squashes it front to back.
 */
export const lathe = (
  profile: [number, number][],
  depth = 1,
  segments = 28,
  steps = 18,
) => {
  const curve = new CatmullRomCurve3(
    profile.map(([r, y]) => new Vector3(r, y, 0)),
    false,
    "centripetal",
  );
  const pts = curve
    .getPoints(steps)
    .map((p) => new Vector2(Math.max(0.0005, p.x), p.y))
    // Lathe wants bottom to top.
    .sort((a, b) => a.y - b.y);
  const g = new LatheGeometry(pts, segments);
  g.scale(1, 1, depth);
  g.computeVertexNormals();
  return g;
};

/** A squashed sphere (ellipsoid). */
export const blob = (rx: number, ry: number, rz: number, w = 18, h = 14) => {
  const g = new SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
};

/** The parts, in the player's own frame (facing +z, y up). */
export const bodyGeometry = () => ({
  // Shirt: waist to neck, broad at the chest and shoulders.
  shirt: lathe(
    [
      [0.055, 0.585],
      [0.115, 0.55],
      [0.185, 0.49],
      [0.198, 0.42],
      [0.18, 0.3],
      [0.163, 0.17],
      [0.158, 0.05],
      [0.165, -0.02],
    ],
    0.66,
    24,
    22,
  ),
  collar: new TorusGeometry(0.06, 0.012, 8, 20),
  neck: lathe(
    [
      [0.044, 0.66],
      [0.046, 0.6],
      [0.052, 0.54],
    ],
    0.95,
    26,
    6,
  ),
  // Shorts: waist to hips.
  shorts: lathe(
    [
      [0.158, 0.06],
      [0.168, -0.02],
      [0.18, -0.1],
      [0.17, -0.18],
    ],
    0.72,
    24,
    10,
  ),
  // Each leg of the shorts, around the top of the thigh.
  shortsLeg: lathe(
    [
      [0.088, 0.0],
      [0.092, -0.12],
      [0.094, -0.22],
    ],
    0.95,
    26,
    8,
  ),
  thigh: lathe(
    [
      [0.074, 0.0],
      [0.072, -0.12],
      [0.062, -0.3],
      [0.05, -0.44],
    ],
    0.95,
    26,
    12,
  ),
  calf: lathe(
    [
      [0.048, 0.0],
      [0.058, -0.1],
      [0.052, -0.2],
      [0.04, -0.3],
      [0.036, -0.38],
    ],
    1,
    26,
    12,
  ),
  sock: lathe(
    [
      [0.04, -0.28],
      [0.039, -0.34],
      [0.04, -0.4],
    ],
    1,
    26,
    4,
  ),
  shoe: (() => {
    const upper = blob(0.05, 0.042, 0.12, 16, 10);
    upper.translate(0, 0.012, 0.035);
    return upper;
  })(),
  sole: new RoundedBoxGeometry(0.098, 0.03, 0.27, 2, 0.012),
  // Arms: a short sleeve over the top of a tapered upper arm.
  sleeve: lathe(
    [
      [0.058, 0.03],
      [0.064, -0.04],
      [0.062, -0.13],
    ],
    1,
    26,
    6,
  ),
  upperArm: lathe(
    [
      [0.052, 0.0],
      [0.05, -0.12],
      [0.042, -0.29],
    ],
    1,
    26,
    10,
  ),
  forearm: lathe(
    [
      [0.043, 0.02],
      [0.045, -0.06],
      [0.036, -0.18],
      [0.03, -0.25],
    ],
    1,
    26,
    10,
  ),
  hand: (() => {
    const palm = blob(0.036, 0.048, 0.03, 12, 10);
    palm.translate(0, -0.03, 0.005);
    return palm;
  })(),
  wristband: lathe(
    [
      [0.034, -0.2],
      [0.036, -0.215],
      [0.034, -0.24],
    ],
    1,
    26,
    4,
  ),
});

/** The head: skull, jaw, nose, ears, eyes; hair is separate (its own colour). */
export const headGeometry = () => {
  const skull = blob(0.096, 0.115, 0.105, 24, 18);
  const jaw = blob(0.078, 0.07, 0.085, 18, 12);
  jaw.translate(0, -0.055, 0.018);
  const nose = blob(0.017, 0.026, 0.022, 10, 8);
  nose.translate(0, -0.012, 0.103);
  const ears = [-1, 1].map((s) => {
    const e = blob(0.014, 0.03, 0.022, 10, 8);
    e.translate(s * 0.094, -0.005, -0.004);
    return e;
  });
  // Merged as they are: each part keeps its own smooth normals.
  const skin = mergeGeometries(
    [skull, jaw, nose, ...ears].map((g) => g.toNonIndexed()),
  );
  const eyes = mergeGeometries(
    [-1, 1].map((s) => {
      const e = blob(0.011, 0.009, 0.006, 10, 8);
      e.translate(s * 0.034, 0.014, 0.098);
      return e.toNonIndexed();
    }),
  );
  const brows = mergeGeometries(
    [-1, 1].map((s) => {
      const b = blob(0.02, 0.005, 0.008, 10, 6);
      b.rotateZ(s * -0.12);
      b.translate(s * 0.035, 0.036, 0.098);
      return b.toNonIndexed();
    }),
  );
  return { skin, eyes, brows };
};

/** Hair: a cap over the top and back of the head; long adds a ponytail. */
export const hairGeometry = (long: boolean) => {
  const cap = new SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56);
  cap.scale(0.104, 0.124, 0.114);
  cap.rotateX(-0.32);
  cap.translate(0, 0.012, -0.008);
  const parts: BufferGeometry[] = [cap.toNonIndexed()];
  if (long) {
    const tail = lathe(
      [
        [0.026, 0.0],
        [0.034, -0.06],
        [0.03, -0.16],
        [0.012, -0.26],
      ],
      0.9,
      12,
      10,
    );
    tail.rotateX(0.35);
    tail.translate(0, 0.02, -0.115);
    const tie = new TorusGeometry(0.026, 0.008, 6, 14);
    tie.rotateX(Math.PI / 2 + 0.35);
    tie.translate(0, 0.012, -0.112);
    parts.push(tail.toNonIndexed(), tie.toNonIndexed());
  }
  return mergeGeometries(parts);
};

/** The racket: grip, throat, an oval head frame and the string bed. */
export const racketGeometry = () => {
  const grip = new CylinderGeometry(0.0165, 0.0175, 0.2, 8, 1);
  grip.translate(0, -0.1, 0);
  const butt = new CylinderGeometry(0.019, 0.019, 0.012, 8, 1);
  butt.translate(0, -0.205, 0);
  // Head: an oval of tube, centred 0.4 m up the racket.
  const oval = new EllipseCurve(0, 0, 0.125, 0.158, 0, Math.PI * 2, false, 0);
  const pts = oval.getPoints(48).map((p) => new Vector3(p.x, p.y, 0));
  const ring = new TubeGeometry(
    new CatmullRomCurve3(pts, true),
    64,
    0.0085,
    6,
    true,
  );
  ring.translate(0, 0.39, 0);
  // Throat: two arms from the handle to the bottom of the oval.
  const arms = [-1, 1].map((s) => {
    const curve = new CatmullRomCurve3([
      new Vector3(0, 0.01, 0),
      new Vector3(s * 0.03, 0.13, 0),
      new Vector3(s * 0.085, 0.27, 0),
    ]);
    return new TubeGeometry(curve, 12, 0.008, 6, false);
  });
  const bridge = new CylinderGeometry(0.006, 0.006, 0.13, 6);
  bridge.rotateZ(Math.PI / 2);
  bridge.translate(0, 0.25, 0);
  const frame = mergeGeometries(
    [ring, ...arms, bridge, butt].map((g) => g.toNonIndexed()),
  );
  const strings = new CircleGeometry(1, 40);
  strings.scale(0.122, 0.155, 1);
  strings.translate(0, 0.39, 0);
  return { grip, frame, strings };
};

let stringTexture: CanvasTexture | null = null;
/** A string-bed pattern: a light grid with see-through gaps. */
export const stringsMap = () => {
  if (stringTexture) return stringTexture;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = "rgba(255,255,255,1)";
    for (let i = 0; i < 64; i += 8) {
      g.fillRect(i, 0, 2, 64);
      g.fillRect(0, i, 64, 2);
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.repeat.set(4, 5);
  stringTexture = t;
  return t;
};

/**
 * A cloth material: soft folds and a fine weave bend the light (the shape
 * stays smooth). `folds` sets how strong the folds are.
 */
export const fabric = (color: string, folds = 1) => {
  const m = new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.82,
  });
  m.onBeforeCompile = (compiled) => {
    const shader = compiled;
    shader.uniforms.uFolds = { value: folds };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvObj = position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vObj;\nuniform float uFolds;",
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
        {
          vec3 o = vObj;
          // Long soft folds running down and around, plus a fine weave.
          float f1 = sin(o.y * 38.0 + sin(atan(o.x, o.z) * 3.0) * 1.6);
          float f2 = sin(atan(o.x, o.z) * 9.0 + o.y * 12.0);
          float weave = sin(o.x * 900.0) * sin(o.y * 900.0);
          vec3 bend = vec3(f2 * 0.08, f1 * 0.12, f1 * f2 * 0.05) * uFolds + weave * 0.03;
          normal = normalize(normal + bend);
        }`,
      );
  };
  m.customProgramCacheKey = () => `fabric-${folds}`;
  return m;
};

/** Skin: smooth and soft, a touch of sheen. */
export const skin = (color: string) =>
  new MeshStandardMaterial({ color: new Color(color), roughness: 0.55 });

export const disposeAll = (items: Record<string, BufferGeometry | Material>) =>
  Object.values(items).forEach((x) => x.dispose());
