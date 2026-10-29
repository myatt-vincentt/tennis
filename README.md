# Tennis

A 3D tennis game where your real hand is the racket. The court fills the whole screen: an endless
rally against the computer in a stadium full of people, by day or under floodlights. Your player
runs to the ball on their own, so all you do is time the swing: swing your hand when the ball
reaches you. The side of your body you swing on plays a forehand or a backhand, a faster swing
hits harder, and the swing's sideways angle aims left or right. Early and late swings pull the
ball, and a wild one can go out or into the net. Every return that lands in adds one to the
rally; the computer gets quicker and wider as it grows. Your best rally is kept on the device.

- Thumbnail: `public/images/tennis-thumbnail.jpg` (the share image).
- **Play by hand:** swing either hand in front of the camera. Your camera sits small in the top
  right corner with a ring on each tracked palm. A thin ring closes in on the ball as it comes to
  you; it lands on the ball (and turns yellow) at the perfect moment. Perfect, Good, Early or
  Late pops up after each hit.
- **Play without a hand:** tap or click anywhere to swing; a quick swipe right after the tap aims
  the shot and a fast one hits harder. Space or Enter swings too.
- **Views:** the camera chip cycles behind the player (the default), first person (your racket
  follows your hand) and the side view. **Day / night:** the sun / moon chip.
- Sound is made in code (racket pop, bounces, the crowd's murmur, an "ooh" on long rallies and
  applause for a new best); the first tap turns it on and starts the first serve.
- The game is plain code in `src/tennis/sim/` (ball flight, shots, the swing reader, the rally),
  tested in `game.test.ts` and `swing.test.ts`. Players, court and stadium are built in code
  (`character.ts`, `Court.tsx`, `Stands.tsx`); the detail drops on slower devices (`quality.ts`).
- `src/App.tsx` uses a full-window container instead of the 9:16 frame; re-apply after a template
  upgrade.
- Dev preview without a camera: the media switcher starts on the SDK's sample video. Keys: 1 / 2
  / 3 views, n day / night, p autoplay with perfect timing, m / x / o / w make the next ball a
  miss / net / long / wide; `window.__tennis` for the rest (`src/tennis/DevDebug.tsx`). How it
  works: `PLAN.md`.

---

# v2-template

The Vincentt starter app: a real React + R3F + Vincentt XR SDK (`@vincentt-xr/sdk`)
WebXR app, bundled by esbuild.

## Shape

```
src/
  main.tsx            mount — never edited
  App.tsx             protected shell: XRProvider + AspectRatioContainer +
                      XRScene + media-source binding, camera, lighting,
                      VideoBackground, PreviewAnchors — never edited
  Scene.tsx           the agent's surface: add SDK components and R3F
                      primitives here
  PreviewAnchors.tsx  editor-preview integration — never edited
```

See `AGENTS.md` and `GROUNDING.md` for the API reference and how to author scenes.

## Develop

```
pnpm install
pnpm dev          # esbuild dev server on localhost:5173 (output in .dev/)
pnpm preview      # on-device preview over a secure tunnel (needs `vincentt login`)
pnpm typecheck
pnpm build        # production bundle to dist/
```

## Release

`vincentt init` scaffolds from the **`latest` tag**, not from `main`. Merging to `main` does
not ship a template to creators — cutting a release does.

```
git tag 1.1.0 <sha>      # bare semver, no `v` prefix
git push origin 1.1.0    # the Release workflow verifies the tag, then moves `latest`
```

The Release workflow (`.github/workflows/release.yml`) installs from the frozen lockfile,
builds, and typechecks **the tagged tree** before force-updating `latest` to it. A tag that
fails leaves `latest` where it was, so a broken release cannot reach a new creator.

The job runs in the `release` environment, which accepts bare-semver tags only. To re-run it by
hand, dispatch it from the tag itself ("Use workflow from: 1.1.0"); a dispatch from `main` is
refused.

**Never move `latest` by hand.** It is force-updated by that workflow and nowhere else; moving
it manually decouples the pointer from the version it claims to be.

Creators can pin a specific version — `vincentt init --template 1.0.0` — which is the escape
hatch when a release turns out to be bad. That is why the version tags are immutable and only
`latest` moves.

### `MIGRATION.md` and the platform release row

Root `MIGRATION.md` carries one entry per released tag, newest first, authored in the same
PR as the change: `required: true|false`, a one-line summary, and optional notes bullets.
`required: false` means no consumer action is needed, never that the entry was skipped. The
Release workflow refuses to move `latest` for a tag with no valid entry, then — once `latest`
has moved — posts that entry as this release's row to the platform (`POST
/platform/releases`, component `template`), via `scripts/release-row.mjs`. Both steps read
`MIGRATION.md` from `main`, not from the tagged tree: the note is reviewed via PR into `main`
and is append-only per version, so `main`'s copy is the reviewed source for any tag, including
one cut before this file existed. That row is what `vincentt outdated` reads back to tell a
creator's agent what changed and what to do about it.
