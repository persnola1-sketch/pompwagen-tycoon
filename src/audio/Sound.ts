/**
 * Procedural WebAudio sound effects — no audio files needed, tiny download,
 * and it sidesteps iOS asset-loading quirks. Unlocked on first touch.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  constructor() {
    const unlock = (): void => {
      this.ensure();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('touchstart', unlock, { once: false });
    window.addEventListener('mousedown', unlock, { once: false });
  }

  private ensure(): void {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number, delay = 0): void {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  click(): void {
    this.tone(660, 0.06, 'square', 0.12);
  }
  accept(): void {
    this.tone(520, 0.08, 'sine', 0.2);
    this.tone(780, 0.12, 'sine', 0.2, undefined, 0.07);
  }
  decline(): void {
    this.tone(330, 0.1, 'square', 0.12, 220);
  }
  error(): void {
    this.tone(180, 0.18, 'sawtooth', 0.15, 120);
  }
  coin(): void {
    this.tone(880, 0.05, 'square', 0.08);
    this.tone(1320, 0.09, 'square', 0.08, undefined, 0.04);
  }
  chaChing(): void {
    this.tone(988, 0.08, 'square', 0.14);
    this.tone(1319, 0.22, 'square', 0.14, undefined, 0.08);
    this.noise(0.08, 0.1, 6000, 0.02);
  }
  palletUp(): void {
    this.noise(0.09, 0.22, 900);
    this.tone(140, 0.09, 'sine', 0.2, 190);
  }
  palletDown(): void {
    this.noise(0.12, 0.3, 500);
    this.tone(90, 0.14, 'sine', 0.28, 60);
  }
  truckHorn(): void {
    this.tone(196, 0.35, 'sawtooth', 0.14);
    this.tone(147, 0.35, 'sawtooth', 0.12);
  }
  airBrake(): void {
    this.noise(0.5, 0.2, 2600);
  }
  backupBeep(): void {
    this.tone(1100, 0.16, 'square', 0.07);
  }
  build(): void {
    this.noise(0.25, 0.25, 700);
    this.tone(392, 0.1, 'sine', 0.15, undefined, 0.1);
    this.tone(523, 0.14, 'sine', 0.15, undefined, 0.2);
    this.tone(659, 0.25, 'sine', 0.16, undefined, 0.3);
  }
  private musicGain: GainNode | null = null;
  private musicTimer = 0;
  private musicStep = 0;
  musicEnabled = true;

  /**
   * A slow, warm four-chord pad that loops under the game. It is scheduled a
   * bar at a time from the main loop so it costs nothing when muted.
   */
  updateMusic(dt: number): void {
    if (!this.musicEnabled || !this.enabled) {
      if (this.musicGain) this.musicGain.gain.setTargetAtTime(0, this.ctx?.currentTime ?? 0, 0.4);
      return;
    }
    this.ensure();
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    if (!this.musicGain) {
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
    }
    this.musicGain.gain.setTargetAtTime(0.16, this.ctx.currentTime, 1.5);
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const bar = 4.8;
    this.musicTimer = bar;
    // I – vi – IV – V in C, one soft pad chord per bar plus a bass note
    const chords = [
      [261.63, 329.63, 392.0],
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
    ];
    const chord = chords[this.musicStep % chords.length];
    this.musicStep++;
    const t0 = this.ctx.currentTime;
    for (const f of chord) this.pad(f, t0, bar, 0.16);
    this.pad(chord[0] / 2, t0, bar * 0.5, 0.2, 'triangle');
    // a light two-note motif every other bar
    if (this.musicStep % 2 === 0) {
      this.pad(chord[2] * 2, t0 + bar * 0.5, 0.9, 0.09, 'sine');
      this.pad(chord[1] * 2, t0 + bar * 0.75, 0.9, 0.07, 'sine');
    }
  }

  private pad(freq: number, when: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(filter).connect(g).connect(this.musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;

  /** looping conveyor motor hum; level 0 stops it */
  setHum(level: number): void {
    this.ensure();
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    if (!this.humOsc) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 62;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      osc.connect(filter).connect(g).connect(this.master);
      osc.start();
      this.humOsc = osc;
      this.humGain = g;
    }
    const target = this.enabled ? level * 0.05 : 0;
    this.humGain!.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  }

  /** short voice blip for the guide's typewriter text */
  blip(): void {
    this.tone(520 + Math.random() * 260, 0.045, 'triangle', 0.07, 400);
  }
  hammer(): void {
    this.noise(0.06, 0.25, 1800);
    this.tone(320, 0.06, 'square', 0.08, 180);
  }
  weld(): void {
    this.noise(0.18, 0.12, 4500);
    this.tone(2400, 0.12, 'sawtooth', 0.03, 1800);
  }
  thud(): void {
    this.noise(0.2, 0.3, 300);
    this.tone(70, 0.22, 'sine', 0.3, 40);
  }
  opening(): void {
    this.noise(0.6, 0.25, 900);
    this.tone(392, 0.15, 'square', 0.12);
    this.tone(523, 0.15, 'square', 0.12, undefined, 0.14);
    this.tone(659, 0.15, 'square', 0.12, undefined, 0.28);
    this.tone(784, 0.2, 'square', 0.13, undefined, 0.42);
    this.tone(1047, 0.5, 'square', 0.15, undefined, 0.58);
    this.tone(1319, 0.6, 'sine', 0.12, undefined, 0.6);
  }
  fanfare(): void {
    this.tone(523, 0.12, 'square', 0.12);
    this.tone(659, 0.12, 'square', 0.12, undefined, 0.11);
    this.tone(784, 0.12, 'square', 0.12, undefined, 0.22);
    this.tone(1047, 0.3, 'square', 0.14, undefined, 0.33);
  }
}
