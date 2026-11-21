// Wick & Whisper — every sound is synthesized with WebAudio, no audio files.
// Footsteps, guard boots, the alarm sting, relic chimes and a low manor drone.

let ctx = null;
let master = null;
let droneNodes = null;
let muted = false;

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

export function unlockAudio() {
  const ac = ensureContext();
  if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
  startDrone();
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.5;
}

/** A short filtered noise burst: the thud of a step. */
function thud(when, volume, lowpass, pan) {
  if (!ctx || muted) return;
  const dur = 0.09;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  source.connect(filter).connect(gain).connect(panner).connect(master);
  source.start(when);
  source.stop(when + dur);
}

/** A sine tone with an envelope, for chimes and stings. */
function tone(when, freq, dur, volume, type = 'sine', slideTo = null) {
  if (!ctx || muted) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(gain).connect(master);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

export function playPlayerStep(sneaking) {
  if (!ctx || muted) return;
  thud(ctx.currentTime, sneaking ? 0.05 : 0.11, sneaking ? 300 : 520, 0);
}

export function playGuardStep(pan, distance) {
  if (!ctx || muted) return;
  const volume = Math.max(0, 0.16 * (1 - distance / 420));
  if (volume <= 0.01) return;
  thud(ctx.currentTime, volume, 380, pan);
}

export function playPickup() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone(t, 880, 0.22, 0.16);
  tone(t + 0.07, 1318, 0.3, 0.14);
}

export function playAlert() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone(t, 220, 0.16, 0.2, 'sawtooth', 330);
  tone(t + 0.14, 330, 0.22, 0.2, 'sawtooth', 440);
  tone(t + 0.14, 110, 0.3, 0.12, 'triangle');
}

export function playSuspicious() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone(t, 520, 0.18, 0.1, 'triangle', 660);
}

export function playCalm() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone(t, 660, 0.2, 0.08, 'triangle', 520);
  tone(t + 0.12, 520, 0.28, 0.07, 'triangle');
}

export function playCaught() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone(t, 392, 0.2, 0.2, 'sawtooth', 196);
  tone(t + 0.18, 294, 0.34, 0.2, 'sawtooth', 98);
}

export function playLevelClear() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1046].forEach((freq, i) => tone(t + i * 0.09, freq, 0.32, 0.14));
}

export function playWin() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1046, 784, 1046, 1318].forEach((freq, i) => tone(t + i * 0.11, freq, 0.36, 0.14));
}

export function playDoorCreak() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone(t, 140, 0.5, 0.07, 'sawtooth', 90);
  tone(t + 0.1, 210, 0.4, 0.05, 'triangle', 160);
}

/** A low, quiet manor drone that starts on the first interaction. */
function startDrone() {
  if (!ctx || droneNodes || muted) return;
  const oscA = ctx.createOscillator();
  oscA.type = 'sine';
  oscA.frequency.value = 55;
  const oscB = ctx.createOscillator();
  oscB.type = 'sine';
  oscB.frequency.value = 55.7;
  const gain = ctx.createGain();
  gain.gain.value = 0.035;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.015;
  lfo.connect(lfoGain).connect(gain.gain);
  oscA.connect(gain);
  oscB.connect(gain);
  gain.connect(master);
  oscA.start();
  oscB.start();
  lfo.start();
  droneNodes = { oscA, oscB, lfo, gain };
}
