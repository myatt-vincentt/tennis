// The sound, all made in code with Web Audio (no sound files):
//
//   racket pop   a short bright knock: higher and brighter the harder the hit
//   bounce       a soft thud on the court, quieter far away
//   net          a dull thump in the tape
//   crowd        a quiet murmur all the time, a rising "ooh" on long rallies,
//                and applause for a new best
//
// Everything goes through a compressor and then a limiter, so nothing ever
// gets loud or distorts. Browsers only allow sound after a tap: `unlock()`
// is called from the first tap.

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

const LEVEL = {
  pop: 0.55,
  bounce: 0.32,
  net: 0.4,
  murmur: 0.05,
  ooh: 0.13,
  applause: 0.3,
  master: 0.85,
};

class Sound {
  ctx: AudioContext | null = null;

  private input: GainNode | null = null;

  private meterNode: AnalyserNode | null = null;

  private meterData: Float32Array<ArrayBuffer> | null = null;

  private noise: AudioBuffer | null = null;

  private murmur: GainNode | null = null;

  private listeners = new Set<() => void>();

  /** Loudest output peak seen since the last `resetPeak()` (0..1). */
  peak = 0;

  get running() {
    return this.ctx?.state === "running";
  }

  onChange(l: () => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  /** Starts the audio. Call from a tap or click. */
  unlock() {
    try {
      const nav = navigator as AudioSessionNavigator;
      if (nav.audioSession && nav.audioSession.type !== "playback")
        nav.audioSession.type = "playback";
    } catch {
      // Not supported here.
    }
    if (this.running) return;
    if (!this.ctx) this.build();
    const { ctx } = this;
    if (!ctx || ctx.state === "running") return;
    ctx.resume().catch(() => {});
    // A silent blip inside the tap makes older iPhones start the audio.
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start();
  }

  private build() {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: "interactive" });
    this.ctx = ctx;
    ctx.onstatechange = () => this.listeners.forEach((l) => l());

    // sounds → compressor → limiter → speakers
    const input = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    const out = ctx.createGain();
    out.gain.value = LEVEL.master;
    input.connect(comp);
    comp.connect(limiter);
    limiter.connect(out);
    out.connect(ctx.destination);
    const meter = ctx.createAnalyser();
    meter.fftSize = 1024;
    out.connect(meter);
    this.input = input;
    this.meterNode = meter;

    // Two seconds of white noise, shared by every noisy sound.
    const len = ctx.sampleRate * 2;
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
    this.noise = noise;
    this.startMurmur();
  }

  /** The crowd's steady murmur: soft, low, slowly breathing noise. */
  private startMurmur() {
    const { ctx, input, noise } = this;
    if (!ctx || !input || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 480;
    band.Q.value = 0.7;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.value = LEVEL.murmur;
    // A slow swell, so it is a crowd and not a hiss.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const depth = ctx.createGain();
    depth.gain.value = LEVEL.murmur * 0.35;
    lfo.connect(depth);
    depth.connect(g.gain);
    src.connect(band);
    band.connect(low);
    low.connect(g);
    g.connect(input);
    src.start();
    lfo.start();
    this.murmur = g;
  }

  /** The murmur gets a little busier as a rally grows (0..1). */
  setTension(k: number) {
    const { ctx, murmur } = this;
    if (!ctx || !murmur) return;
    murmur.gain.setTargetAtTime(
      LEVEL.murmur * (1 + Math.min(1, Math.max(0, k)) * 0.8),
      ctx.currentTime,
      0.6,
    );
  }

  private noiseBurst(
    t: number,
    seconds: number,
    peak: number,
    filter: { type: BiquadFilterType; hz: number; q: number },
    offset = Math.random() * 1.5,
  ) {
    const { ctx, input, noise } = this;
    if (!ctx || !input || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.hz;
    f.Q.value = filter.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(
      Math.max(1e-4, peak * 0.001),
      t + seconds,
    );
    g.gain.linearRampToValueAtTime(0, t + seconds + 0.01);
    src.connect(f);
    f.connect(g);
    g.connect(input);
    src.start(t, offset, seconds + 0.05);
    src.onended = () => g.disconnect();
  }

  private tone(
    t: number,
    hz: number,
    toHz: number,
    seconds: number,
    peak: number,
    type: OscillatorType = "sine",
  ) {
    const { ctx, input } = this;
    if (!ctx || !input) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(toHz, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(
      Math.max(1e-4, peak * 0.001),
      t + seconds,
    );
    g.gain.linearRampToValueAtTime(0, t + seconds + 0.01);
    o.connect(g);
    g.connect(input);
    o.start(t);
    o.stop(t + seconds + 0.03);
    o.onended = () => g.disconnect();
  }

  private now() {
    return this.running && this.ctx ? this.ctx.currentTime : -1;
  }

  /** The racket meeting the ball; `power` 0..1, `near` 0..1 (1 = your racket). */
  pop(power: number, near = 1) {
    const t = this.now();
    if (t < 0) return;
    const p = Math.min(1, Math.max(0, power));
    const level = LEVEL.pop * (0.55 + 0.45 * p) * (0.35 + 0.65 * near);
    // The strings: a bright knock, brighter for a hard hit.
    this.noiseBurst(t, 0.045, level, {
      type: "bandpass",
      hz: 1500 + 2200 * p,
      q: 1.4,
    });
    // The frame: a short wooden tock, higher for a hard hit.
    this.tone(t, 620 + 380 * p, 420 + 200 * p, 0.07, level * 0.55, "triangle");
    // The ball's body: a low push.
    this.tone(t, 170, 90, 0.06, level * 0.5);
  }

  /** The ball on the court; `speed` m/s, `near` 0..1. */
  bounce(speed: number, near: number) {
    const t = this.now();
    if (t < 0) return;
    const k = Math.min(1, speed / 25);
    const level = LEVEL.bounce * (0.4 + 0.6 * k) * (0.3 + 0.7 * near);
    this.tone(t, 210, 95, 0.07, level);
    this.noiseBurst(t, 0.025, level * 0.6, { type: "bandpass", hz: 900, q: 1 });
  }

  /** The ball in the net. */
  net() {
    const t = this.now();
    if (t < 0) return;
    this.tone(t, 120, 60, 0.18, LEVEL.net);
    this.noiseBurst(t, 0.12, LEVEL.net * 0.5, {
      type: "lowpass",
      hz: 700,
      q: 0.7,
    });
  }

  /** The crowd going "ooh" on a long rally (`k` 0..1 how big). */
  ooh(k = 0.6) {
    const { ctx, input } = this;
    const t = this.now();
    if (!ctx || !input || t < 0) return;
    const level = LEVEL.ooh * (0.6 + 0.4 * k);
    const seconds = 1.5;
    // A dozen voices, each its own pitch, through an "oo" vowel.
    const vowel = ctx.createBiquadFilter();
    vowel.type = "bandpass";
    vowel.frequency.value = 420;
    vowel.Q.value = 2.2;
    const second = ctx.createBiquadFilter();
    second.type = "lowpass";
    second.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.35);
    g.gain.setTargetAtTime(0, t + 0.6, 0.3);
    vowel.connect(second);
    second.connect(g);
    g.connect(input);
    for (let i = 0; i < 12; i += 1) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      const hz = 150 + Math.random() * 190;
      o.frequency.setValueAtTime(hz * 0.92, t);
      o.frequency.linearRampToValueAtTime(hz * 1.08, t + 0.4);
      o.frequency.linearRampToValueAtTime(hz * 0.9, t + seconds);
      const vg = ctx.createGain();
      vg.gain.value = 1 / 12;
      o.connect(vg);
      vg.connect(vowel);
      o.start(t + Math.random() * 0.08);
      o.stop(t + seconds + 0.2);
    }
    window.setTimeout(() => g.disconnect(), (seconds + 0.5) * 1000);
  }

  /** Applause for a new best: lots of claps, building quickly then thinning out. */
  applause(seconds = 2.8) {
    const t0 = this.now();
    if (t0 < 0) return;
    const claps = Math.round(seconds * 55);
    for (let i = 0; i < claps; i += 1) {
      // More claps early on, fewer as it dies down.
      const u = Math.random() ** 1.6;
      const t = t0 + u * seconds;
      const fade = 1 - u * 0.75;
      this.noiseBurst(
        t,
        0.03 + Math.random() * 0.02,
        LEVEL.applause * fade * (0.5 + Math.random() * 0.5),
        {
          type: "bandpass",
          hz: 900 + Math.random() * 1800,
          q: 1.2,
        },
      );
    }
  }

  /** Loudness now (peak and RMS of the last ~20 ms of output). */
  meter() {
    const m = this.meterNode;
    if (!m) return { peak: 0, rms: 0 };
    if (!this.meterData || this.meterData.length !== m.fftSize)
      this.meterData = new Float32Array(m.fftSize);
    const d = this.meterData;
    m.getFloatTimeDomainData(d);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < d.length; i += 1) {
      peak = Math.max(peak, Math.abs(d[i]));
      sum += d[i] * d[i];
    }
    this.peak = Math.max(this.peak, peak);
    return { peak, rms: Math.sqrt(sum / d.length) };
  }
}

/** The one sound engine. */
export const sound = new Sound();
