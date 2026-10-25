// Procedural score. Nothing is pre-recorded: a low drone, a pipe-organ pad
// built from an additive waveform, a reverb tail synthesised at start-up, and
// a dry tick that marks every Earth day that passes.

const CHORDS = {
  idle: [55, 82.41, 110],
  swell: [110, 164.81, 220, 261.63, 329.63],
  disk: [87.31, 130.81, 174.61, 220, 261.63],
  photon: [98, 146.83, 196, 233.08, 293.66],
  silence: [110, 164.81, 220, 261.63, 329.63],
  resolve: [65.41, 130.81, 196, 261.63, 329.63],
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mode = 'idle';
  }

  get running() {
    return !!this.ctx;
  }

  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());

    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.out.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(5.5, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.out);

    // Everything except the tick goes through the score bus, so silence is total.
    this.score = ctx.createGain();
    this.score.gain.value = 1;
    this.score.connect(this.out);
    this.score.connect(this.reverb);

    this._buildDrone();
    this._buildRumble();
    this._buildOrgan();

    this.setMode(this.mode, true);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _buildDrone() {
    const ctx = this.ctx;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 160;
    this.droneFilter.Q.value = 0.7;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneFilter.connect(this.droneGain).connect(this.score);

    [27.5, 55, 55.35, 82.6].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.12;
      o.connect(g).connect(this.droneFilter);
      o.start();
    });

    // Slow breathing on the filter.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 40;
    lfo.connect(lfoGain).connect(this.droneFilter.frequency);
    lfo.start();
  }

  _buildRumble() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown noise
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 120;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    src.connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.score);
    src.start();
  }

  _buildOrgan() {
    const ctx = this.ctx;
    // Pipe-organ-ish registration: fundamental plus octaves and a quint.
    const harmonics = [0, 1, 0.55, 0.3, 0.32, 0.0, 0.16, 0.0, 0.12];
    const real = new Float32Array(harmonics.length);
    const imag = new Float32Array(harmonics);
    const wave = ctx.createPeriodicWave(real, imag);

    this.organFilter = ctx.createBiquadFilter();
    this.organFilter.type = 'lowpass';
    this.organFilter.frequency.value = 1400;
    this.organGain = ctx.createGain();
    this.organGain.gain.value = 0;
    this.organFilter.connect(this.organGain).connect(this.score);

    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 4.6;
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.value = 0.6;
    vibrato.connect(vibratoDepth);
    vibrato.start();

    this.voices = Array.from({ length: 5 }, (_, i) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.value = CHORDS.idle[i % 3];
      vibratoDepth.connect(o.detune);
      const g = ctx.createGain();
      g.gain.value = 0.07;
      o.connect(g).connect(this.organFilter);
      o.start();
      return { o, g };
    });
  }

  setMode(mode, immediate = false) {
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const ramp = immediate ? 0.05 : 1;
    const chord = CHORDS[mode] || CHORDS.idle;

    this.voices.forEach(({ o, g }, i) => {
      const f = chord[i % chord.length] * (i >= chord.length ? 2 : 1);
      o.frequency.setTargetAtTime(f, t, 1.2 * ramp);
      g.gain.setTargetAtTime(i >= chord.length ? 0.0 : 0.07, t, 1.5 * ramp);
    });

    const organLevel = { idle: 0.0, swell: 0.55, disk: 0.5, photon: 0.42, silence: 0, resolve: 0.5 }[mode] ?? 0;
    const droneLevel = { idle: 0.35, silence: 0 }[mode] ?? 0.5;

    if (mode === 'silence') {
      // A cut, not a fade.
      this.score.gain.cancelScheduledValues(t);
      this.score.gain.setTargetAtTime(0, t + (immediate ? 0 : 9), 0.12);
    } else {
      this.score.gain.cancelScheduledValues(t);
      this.score.gain.setTargetAtTime(1, t, 0.8 * ramp);
    }
    this.organGain.gain.setTargetAtTime(organLevel, t, (mode === 'swell' ? 3.5 : 2) * ramp);
    this.droneGain.gain.setTargetAtTime(droneLevel, t, 2 * ramp);
  }

  /** proximity 0..1 (far..horizon), motion 0..1 (in flight). */
  update(proximity, motion) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneFilter.frequency.setTargetAtTime(140 + proximity * 520 + motion * 200, t, 0.3);
    this.rumbleGain.gain.setTargetAtTime(0.05 + motion * 0.55 + proximity * 0.2, t, 0.25);
    this.rumbleFilter.frequency.setTargetAtTime(90 + motion * 160, t, 0.3);
  }

  tick() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1850, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.1);
  }

  blip(freq = 880) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.out);
    o.connect(g).connect(this.reverb);
    o.start(t);
    o.stop(t + 0.2);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) this.out.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.15);
  }
}
