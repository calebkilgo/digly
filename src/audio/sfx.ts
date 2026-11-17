// Every sound is synthesized with Web Audio: no audio files to license and
// nothing to load. Kept deliberately simple: soft blips and bell-ish chimes.
// The context is created on the first user gesture (autoplay rules).

type Tier = "copper" | "gold" | "diamond" | "ruby" | "platinum";

// C major pentatonic, so any run of chimes sounds pleasant together
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

export type MusicMode = "menu" | "dig" | "off";

// Four-bar loop in A minor: Am, F, C, G
const CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
// level 2: D minor, driving. level 3: E phrygian-ish, tense.
const CHORDS_2 = [
  [146.83, 174.61, 220],
  [116.54, 146.83, 174.61],
  [174.61, 220, 261.63],
  [130.81, 164.81, 196],
];
const CHORDS_3 = [
  [164.81, 196, 246.94],
  [174.61, 220, 261.63],
  [164.81, 196, 246.94],
  [146.83, 185, 220],
];

class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noiseBuf?: AudioBuffer;
  private digFlip = false;
  muted = false;
  private musicGain?: GainNode;
  private musicTimer?: ReturnType<typeof setInterval>;
  private musicMode: MusicMode = "off";
  private musicWanted: MusicMode = "off";
  private musicTempo = 92;
  private musicStep = 0;
  private musicLevel = 1;
  private musicNext = 0;
  musicEnabled = true;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicGain.connect(this.master);
    if (this.musicWanted !== "off") this.music(this.musicWanted);
  }

  // ---- music -----------------------------------------------------------------

  setMusicEnabled(on: boolean) {
    this.musicEnabled = on;
    if (!on) this.stopMusic();
    else if (this.musicWanted !== "off") this.music(this.musicWanted);
  }

  // menu: slow and soft. dig: faster with a lead; level and urgency push the tempo.
  music(mode: MusicMode, level = 1, urgent = false) {
    this.musicWanted = mode;
    this.musicLevel = level;
    this.musicTempo = mode === "menu" ? 92 : [112, 128, 148][level - 1] + (urgent ? 18 : 0);
    if (mode === "off" || !this.musicEnabled) return this.stopMusic();
    if (!this.ready) return;
    this.musicMode = mode;
    if (this.musicTimer) return;
    this.musicStep = 0;
    this.musicNext = this.ctx!.currentTime + 0.05;
    this.musicTimer = setInterval(() => this.pump(), 25);
  }

  private stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = undefined;
    this.musicMode = "off";
  }

  private pump() {
    if (!this.ctx) return;
    const ahead = this.ctx.currentTime + 0.12;
    while (this.musicNext < ahead) {
      this.playStep(this.musicStep, this.musicNext);
      this.musicStep++;
      this.musicNext += 60 / this.musicTempo / 2; // eighth notes
    }
  }

  private mtone(t: number, type: OscillatorType, f: number, dur: number, peak: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.musicGain!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hit(t: number, type: BiquadFilterType, freq: number, dur: number, peak: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf!;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.musicGain!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.musicGain!);
    o.start(t);
    o.stop(t + 0.2);
  }

  private playStep(step: number, t: number) {
    const bar = Math.floor(step / 8) % 4;
    const i = step % 8;
    const half = 60 / this.musicTempo / 4;
    if (this.musicMode === "menu") {
      const chord = CHORDS[bar];
      if (i === 0 || i === 4) this.mtone(t, "triangle", chord[0] / 2, 0.5, 0.09);
      this.mtone(t, "sine", chord[ARP[i]] * 2, 0.3, 0.025);
      return;
    }
    if (this.musicLevel === 1) {
      // bouncy: bass on the beat, soft square arpeggio, light hats
      const chord = CHORDS[bar];
      const root = chord[0] / 2;
      if (i % 2 === 0) this.mtone(t, "triangle", i % 4 === 0 ? root : root * 2, 0.18, 0.1);
      this.mtone(t, "square", chord[ARP[i]] * 2, 0.09, 0.012);
      if (i % 2 === 1) this.hit(t, "highpass", 7000, 0.04, 0.025);
    } else if (this.musicLevel === 2) {
      // driving: pumping eighth-note bass, snare on 2 and 4, busier lead
      const chord = CHORDS_2[bar];
      const root = chord[0] / 2;
      this.mtone(t, "triangle", i % 2 ? root * 2 : root, 0.12, 0.11);
      this.mtone(t, "square", chord[ARP[(i + bar) % 8]] * 2, 0.08, 0.014);
      if (i === 2 || i === 6) this.hit(t, "bandpass", 1800, 0.09, 0.07);
      this.hit(t, "highpass", 8000, 0.03, 0.02);
    } else {
      // tense: four-on-the-floor kick, sixteenth-note arpeggio and bass
      const chord = CHORDS_3[bar];
      const root = chord[0] / 2;
      if (i % 2 === 0) this.kick(t);
      if (i === 2 || i === 6) this.hit(t, "bandpass", 2200, 0.1, 0.08);
      for (const off of [0, half]) {
        this.mtone(t + off, "sawtooth", root, 0.07, 0.035);
        this.mtone(t + off, "square", chord[ARP[(i * 2 + (off ? 1 : 0)) % 8]] * 4, 0.05, 0.012);
        this.hit(t + off, "highpass", 9000, 0.02, 0.018);
      }
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  private get ready() {
    return !!(this.ctx && this.master && this.noiseBuf);
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, to?: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf!;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.004, peak, dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.005) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  // A bell: sine fundamental plus a quiet octave partial.
  private bell(t: number, f: number, dur: number, peak: number) {
    this.tone(t, "sine", f, f, dur, peak);
    this.tone(t, "sine", f * 2, f * 2, dur * 0.6, peak * 0.25);
  }

  button() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, "square", 880, 880, 0.03, 0.05);
  }

  // 3, 2, 1 beeps and a higher "go"
  count(n: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    if (n > 0) this.tone(t, "square", 660, 660, 0.09, 0.06);
    else {
      this.tone(t, "square", 1320, 1320, 0.2, 0.07);
      this.bell(t, 1046.5, 0.35, 0.08);
    }
  }

  // Each pickaxe strike: a tiny two-pitch "tink", like a toy hammer.
  dig(power = 1) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.digFlip = !this.digFlip;
    const f = this.digFlip ? 1568 : 1397;
    this.tone(t, "triangle", f, f * 0.92, 0.05, power > 1 ? 0.07 : 0.035);
    this.noise(t, 0.015, "highpass", 5000, 1, 0.025);
  }

  // Correct answer: a chime that climbs the scale as the combo grows.
  valid(combo: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const i = Math.min(PENTA.length - 3, combo);
    this.bell(t, PENTA[i], 0.22, 0.12);
    this.bell(t + 0.07, PENTA[i + 2], 0.3, 0.1);
  }

  invalid() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, "triangle", 196, 150, 0.14, 0.12);
  }

  duplicate() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, "triangle", 660, 660, 0.04, 0.05);
    this.tone(t + 0.06, "triangle", 660, 660, 0.04, 0.05);
  }

  // Every five finds: a short rising arpeggio.
  milestone(level: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const base = Math.min(3, level - 1);
    [0, 2, 4, 5].forEach((d, i) => this.bell(t + i * 0.07, PENTA[base + d], 0.3, 0.09));
  }

  tick(urgent: boolean) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, "sine", urgent ? 1200 : 900, urgent ? 1200 : 900, 0.05, 0.06);
  }

  // Time's up: the engine-winding-down sound from the first version.
  timeUp() {
    if (!this.ready) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const motor = c.createOscillator();
    motor.type = "sawtooth";
    motor.frequency.setValueAtTime(100, t);
    motor.frequency.exponentialRampToValueAtTime(25, t + 0.7);
    const mf = c.createBiquadFilter();
    mf.type = "lowpass";
    mf.frequency.value = 300;
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    motor.connect(mf).connect(g).connect(this.master!);
    motor.start(t);
    motor.stop(t + 0.8);
    this.noise(t, 0.7, "bandpass", 1500, 1.2, 0.08, 400);
  }

  thud() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, "sine", 90, 45, 0.18, 0.5);
    this.noise(t, 0.12, "lowpass", 500, 1, 0.3);
  }

  crackle() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 5; i++) this.noise(t + i * 0.06 + Math.random() * 0.03, 0.025, "highpass", 2500 + Math.random() * 2000, 2, 0.18);
  }

  crack() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.22, "bandpass", 3200, 0.8, 0.6, 700);
    this.tone(t, "sine", 160, 50, 0.2, 0.45);
  }

  gem(tier: Tier | null) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    if (!tier) {
      this.noise(t, 0.2, "lowpass", 400, 1, 0.3);
      return;
    }
    const roots: Record<Tier, number> = { copper: 523, gold: 659, diamond: 880, ruby: 987.8, platinum: 1046.5 };
    const r = roots[tier];
    const chord =
      tier === "platinum"
        ? [1, 1.25, 1.5, 2, 2.5, 3, 4]
        : tier === "ruby"
          ? [1, 1.2, 1.5, 2, 2.4, 3]
          : tier === "diamond"
            ? [1, 1.25, 1.5, 2, 2.5]
            : tier === "gold"
              ? [1, 1.25, 1.5, 2]
              : [1, 1.5, 2];
    chord.forEach((m, i) => this.tone(t + i * 0.045, "sine", r * m, r * m, 0.7 + i * 0.1, 0.12, 0.004));
    this.tone(t, "triangle", r * 4, r * 4, 0.25, 0.05);
  }

  countTick() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, "triangle", 1400 + Math.random() * 200, 1500, 0.025, 0.05);
  }

  final(score: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const base = score >= 500 ? 392 : score >= 250 ? 349 : 294;
    [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(t + i * 0.07, "triangle", base * m, base * m, 0.5, 0.11));
  }

  // The comparison stamp and a new personal best get their own fanfares.
  stamp() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone(t, "sine", 120, 60, 0.12, 0.35);
    this.bell(t + 0.05, 1318.5, 0.4, 0.08);
  }

  fanfare() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const n = [523.25, 659.25, 783.99, 1046.5];
    n.forEach((f, i) => this.tone(t + i * 0.09, "square", f, f, 0.1, 0.05));
    [1046.5, 1318.5, 1568].forEach((f) => this.bell(t + 0.4, f, 0.8, 0.07));
  }
}

export const sfx = new Sfx();
