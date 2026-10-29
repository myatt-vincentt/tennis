# dev-media

Optional dev-only preview media. Nothing here ships: only
`src/DevMediaSwitcher.tsx` reads this folder, and it is stripped from
production builds.

You don't need anything here. Without a webcam, `pnpm dev` starts on the SDK's
built-in "Thumb Up" video and lists every SDK sample video and image. Click,
tap or press space to swing without a hand; the dev keys are listed in
`src/tennis/DevDebug.tsx`.

To preview with your own clip, add it at `dev-media/tennis.mp4` (H.264 MP4); it
is listed first and used as the start. Clips here are git-ignored. Restart
`pnpm dev` after adding or removing one.
