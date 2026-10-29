# Plan

Tennis: a full-screen 3D tennis game where your real hand is the racket. An endless rally
against the computer.

## How it plays

- **Endless rally.** No match score. The computer serves a friendly ball into your half; every
  return of yours that lands in adds one to the rally. A missed ball, a shot out or into the net
  ends the rally: a short pause with a sparkle where the ball died, a card with the rally count
  (or "New best"), then a new serve. There is no game over. The best rally is saved on the device.
- **Pace.** The computer always returns. Its shots start slow and central and get quicker, deeper
  and wider as the rally grows (about 1.6 s across the court at first, about 1 s after 24
  returns).
- **Auto-positioning.** Your player runs to where the ball can be hit (the top of its bounce, or
  just behind the baseline) and sets up on the side your hand is on, so you only time and swing.

## Swinging

- **Hand.** The SDK hand tracker (30 readings a second). Speed is measured in palm lengths per
  second, so near and far hands swing the same. A swing starts above 15 and ends below 8 (the
  hysteresis), needs to travel smoothly at least 1.6 palm lengths (a single jumpy reading does
  not count), and is followed by a short rest. A drifting hand or a gentle wave (about 10) never
  starts one. Moving towards the camera counts too, weighted down.
- **Forehand or backhand** follows where the swing starts and which way it goes, for the hand
  that swings (the right hand's forehand starts on its own side and sweeps across).
- **Power** comes from the swing's peak speed; **aim** from its sideways angle.
- **Timing window** around the ball's arrival: Perfect within 75 ms, Good within 160 ms, Early
  up to 340 ms before, Late up to 250 ms after; outside it the swing misses. Tracking delay is
  taken off each swing. Early pulls the ball the way you swing, late pushes it the other way; a
  mistimed swing aimed wide goes out, a slapped early one goes long, a weak late one finds the
  net. Perfect always lands in.
- **Without a hand:** tap or click (swipe to aim and add power), or Space / Enter.

## What you see

- **Court.** A blue hard court on a green surround with a fine grain, scuffs behind the
  baselines and crisp antialiased lines; the net with tape, centre strap and posts; an umpire's
  chair, benches; plain boards around, no names anywhere.
- **Stadium.** Stepped stands on all four sides with seats, aisles, rails and a back wall, roofs
  over three sides, about 1,500 instanced people of varied size, skin, hair and shirt colour
  who breathe, follow the ball with their heads and jump with arms up on a big moment. Four
  floodlight masts.
- **Day / night,** blended smoothly: day has a bright sky with soft clouds and a sun with soft
  shadows; night has stars, a glow over the stadium, floodlights with light cones and haze,
  darker stands and softly glowing court lines.
- **Players.** Built in code from smooth turned shapes: shirt with folds, shorts, tapered limbs,
  trainers, a head with face and hair, a strung racket. Running legs and arms at their speed, a
  ready crouch, and forehand, two-handed backhand and serve swings timed to the hit.
- **Ball.** Arcade but believable flight (gravity, bounce that loses height and pace, the net,
  the low wall), a soft shadow under it, a short trail at speed, a ring where it bounces (white
  in, coral out), the closing timing ring as it comes to you and a coloured flash where you hit.
- **Views.** Behind the player (default), first person (your racket follows your hand) and a
  high side view (on a narrow screen it pans with the ball). The camera chip cycles them with a
  smooth glide.
- **HUD** on Night glass: the rally count big at the top, your best under it, your camera in the
  top-right corner (one rounded panel with a ring on each tracked palm), the view and day /
  night chips under it, the timing word, the rally card, and "Tap to play" before the first
  serve. A small see-through ghost hand swings a forehand until your first hit.
- **Sound,** made in code through a compressor and limiter: racket pop (brighter for a harder
  hit), bounces, the net, a crowd murmur that builds through a rally, an "ooh" on long rallies
  and applause for a new best.

## Performance

- One shadow-casting light (players and net), soft contact shadows for the players and the
  ball, an instanced crowd, a neutral tone curve and a small studio environment for reflections.
- The SDK's adaptive quality tier sets the detail: on medium the crowd is three quarters and the
  shadow map smaller, on low half the crowd and no cast shadows.
