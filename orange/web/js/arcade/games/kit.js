// Shared drawing helpers for the canvas games. Small, allocation-free, cached where it matters.
import { clamp } from '../engine.js';

const skies = new WeakMap();   // gradients are built once per canvas, not every frame
export const sky = (c, w, h, a, b) => {
  let m = skies.get(c); if (!m) skies.set(c, (m = new Map()));
  const k = a + b + h; let g = m.get(k);
  if (!g) { g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, a); g.addColorStop(1, b); m.set(k, g); }
  c.fillStyle = g; c.fillRect(0, 0, w, h);
};
export const rr = (c, x, y, w, h, r, fill) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); };
export const dot = (c, x, y, r, fill) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); };
export const txt = (c, s, x, y, size = 20, color = '#fff', align = 'center') => { c.font = `800 ${size}px Sora, sans-serif`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(s, x, y); };
export const emoji = (c, e, x, y, size) => { c.fillStyle = '#000'; c.font = `${size}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, x, y); };
export const steer = (G, speed, dt, obj, min, max) => {   // keys or pointer move an object left/right
  if (G.keys.has('ArrowLeft') || G.keys.has('a')) obj.x -= speed * dt;
  if (G.keys.has('ArrowRight') || G.keys.has('d')) obj.x += speed * dt;
  if (G.pointer.down) obj.x += clamp(G.pointer.x - (obj.x + (obj.w || 0) / 2), -speed * dt * 1.4, speed * dt * 1.4);
  obj.x = clamp(obj.x, min, max);
};

// A polygon from a list of points, filled.
export const poly = (c, pts, fill) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = fill; c.fill(); };
// A line.
export const line = (c, x1, y1, x2, y2, w, color) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineWidth = w; c.strokeStyle = color; c.lineCap = 'round'; c.stroke(); };
// Short-lived particles (sparks, splashes). Arrays are reused; no allocation per frame once warmed up.
export function burst(list, x, y, color, n = 14, speed = 160) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8); list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0.6 + Math.random() * 0.4, color }); }
  if (list.length > 300) list.splice(0, list.length - 300);
}
export function stepSparks(list, dt, gravity = 300) {
  let j = 0;
  for (const p of list) { p.t -= dt; if (p.t <= 0) continue; p.vy += gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; list[j++] = p; }
  list.length = j;
}
export function drawSparks(c, list) {
  for (const p of list) { c.globalAlpha = Math.min(1, p.t * 2); c.fillStyle = p.color; c.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); }
  c.globalAlpha = 1;
}

// Tiny synth for notes (shared AudioContext, created on first use, respects the Sound switch).
import { state } from '../../core.js';
let actx = null;
export function tone(freq, dur = 0.25, type = 'triangle', vol = 0.12) {
  if (state.settings.sound === false) return;
  try {
    actx ||= new AudioContext();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* no audio */ }
}
export const audio = () => (actx ||= new AudioContext());
export const NOTES = [262, 294, 330, 349, 392, 440, 494, 523, 587, 659, 698, 784];
export const TAU = Math.PI * 2;
export const wrap = (v, m) => ((v % m) + m) % m;
export const hearts = (c, n, x, y) => { for (let i = 0; i < n; i++) emoji(c, '❤️', x + i * 22, y, 16); };
export const starfield = (n, w, h) => Array.from({ length: n }, () => [Math.random() * w, Math.random() * h, 0.6 + Math.random() * 1.4]);
export const drawStars = (c, list) => { c.fillStyle = '#fff'; for (const [x, y, r] of list) { c.globalAlpha = r / 2.2; c.fillRect(x, y, r, r); } c.globalAlpha = 1; };
// Draw something expensive once into an off-screen canvas and reuse it every frame.
export function cached(w, h, paint) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; paint(cv.getContext('2d')); return cv; }
