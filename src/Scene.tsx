// Scene.tsx — Tennis: a full-screen 3D tennis game where your real hand is
// the racket. An endless rally; see tennis/TennisScene.tsx.
import { lazy, Suspense } from "react";

import { TennisScene } from "./tennis/TennisScene";

// Dev-only helpers for previewing without a camera. Lazy and behind a
// constant esbuild folds to false in production. Two rules:
// `process.env.NODE_ENV`, not `import.meta.env.DEV` (vincentt-xr/v2-template#112);
// and write the check INSIDE the ternary — hoisted into a `const`, esbuild
// keeps the dead branch.
const DevMediaSwitcher =
  process.env.NODE_ENV !== "production"
    ? lazy(() => import("./DevMediaSwitcher"))
    : null;
const DevDebug =
  process.env.NODE_ENV !== "production"
    ? lazy(() => import("./tennis/DevDebug"))
    : null;

export const Scene = () => (
  <>
    <TennisScene />
    {DevMediaSwitcher && DevDebug ? (
      <Suspense fallback={null}>
        <DevMediaSwitcher />
        <DevDebug />
      </Suspense>
    ) : null}
  </>
);
