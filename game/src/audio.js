// SkyForge — audio: WebAudio synth. Engine hum tied to throttle, gun rattle, missile whoosh,
// explosion noise burst, lock tone, alarms, chimes, thunder.
export class Audio {
  constructor() { this.ok = false; this.muted = false; }
  init() {
    if (this.ok) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      // engine: two detuned saws through a lowpass, pitch follows throttle
      this.engGain = this.ctx.createGain(); this.engGain.gain.value = 0;
      this.engFilter = this.ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 420;
      this.oscA = this.ctx.createOscillator(); this.oscA.type = 'sawtooth'; this.oscA.frequency.value = 62;
      this.oscB = this.ctx.createOscillator(); this.oscB.type = 'sawtooth'; this.oscB.frequency.value = 63.7;
      this.oscA.connect(this.engFilter); this.oscB.connect(this.engFilter);
      this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
      this.oscA.start(); this.oscB.start();
      this.ok = true;
    } catch { this.ok = false; }
  }
  engine(throttle, speed, turb = 0) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0.05 + throttle * 0.14, t, 0.12);
    // dynamic engine pitch: throttle-driven base with turbulence flutter
    const flutter = turb * Math.sin(t * 21) * 8;
    this.oscA.frequency.setTargetAtTime(52 + throttle * 90 + speed * 0.3 + flutter, t, 0.15);
    this.oscB.frequency.setTargetAtTime(53.4 + throttle * 92 + speed * 0.31 + flutter * 1.3, t, 0.15);
    this.engFilter.frequency.setTargetAtTime(300 + throttle * 900, t, 0.2);
  }
  blip(freq = 660, dur = 0.09, type = 'square', vol = 0.25) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  ring() { this.blip(880, 0.10); setTimeout(() => this.blip(1320, 0.12), 80); }
  warn() { this.blip(220, 0.2, 'sawtooth', 0.3); }
  chime() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.22), i * 110)); }
  // gunfire: sharp bandpassed noise rattle
  gun() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400;
    const g = this.ctx.createGain(); g.gain.value = 0.16;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  // missile launch whoosh: noise sweeping down
  whoosh() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.6, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.4);
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.55);
    const g = this.ctx.createGain(); g.gain.value = 0.3;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  // lock tone: rising two-tone beep
  lock() { this.blip(1000, 0.07, 'square', 0.2); setTimeout(() => this.blip(1500, 0.09, 'square', 0.2), 70); }
  // explosion: low noise burst + sub thump
  boom() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.8, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.8);
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = this.ctx.createGain(); g.gain.value = 0.55;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    const og = this.ctx.createGain(); og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.6);
  }
  thunder() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.8, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.min(1, i / (this.ctx.sampleRate * 0.1)) * Math.pow(1 - i / d.length, 1.2);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = this.ctx.createGain(); g.gain.value = 0.4;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  crash() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.7, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const g = this.ctx.createGain(); g.gain.value = 0.5;
    s.connect(g); g.connect(this.master); s.start(t);
    this.engGain.gain.setTargetAtTime(0, t, 0.05);
  }
}
