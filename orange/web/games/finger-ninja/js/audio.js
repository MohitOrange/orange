// Tiny synthesized sound effects — no audio files needed.
let ctx = null;

export function unlockAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
}

function noise(duration, { freq = 2000, q = 1, gain = 0.3, type = "bandpass" } = {}) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}

function tone(freq, duration, { type = "sine", gain = 0.2, slide = 0 } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + duration);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + duration);
}

export const sfx = {
  slice() { noise(0.18, { freq: 3200 + Math.random() * 1500, q: 2, gain: 0.35 }); tone(520 + Math.random() * 200, 0.08, { type: "triangle", gain: 0.08 }); },
  swoosh() { noise(0.12, { freq: 1200, q: 0.7, gain: 0.08 }); },
  combo(n) { [0, 1, 2].forEach((i) => setTimeout(() => tone(660 * Math.pow(1.26, i + n * 0.1), 0.12, { type: "square", gain: 0.06 }), i * 70)); },
  miss() { tone(220, 0.35, { type: "sawtooth", gain: 0.08, slide: -120 }); },
  boom() { noise(1.2, { freq: 180, q: 0.5, gain: 0.9, type: "lowpass" }); tone(90, 0.8, { type: "sine", gain: 0.5, slide: -60 }); },
  start() { [0, 1, 2].forEach((i) => setTimeout(() => tone(440 * Math.pow(1.5, i), 0.15, { type: "triangle", gain: 0.12 }), i * 110)); },
  tick() { tone(880, 0.04, { type: "sine", gain: 0.04 }); },
};
