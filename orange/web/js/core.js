// Shared building blocks: state, settings, DOM helpers, icons, motion, sound, dialogs.
import { api } from './api.js';

// ---------------------------------------------------------------- events + state
export const bus = new EventTarget();
export const on = (type, fn) => bus.addEventListener(type, e => fn(e.detail));
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

export const state = { name: '', version: '', settings: {}, info: {} };

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const DEFAULTS = {
  theme: 'night', accent: 'orange', wallpaper: 'juice', wallpaperPath: '', motion: reduced ? 'calm' : 'full',
  sound: true, autolock: 10, immersive: true, tourDone: false, view: 'grid', windows: {}, session: [],
  hotCorners: false, pinned: ['files', 'code', 'terminal', 'lens', 'settings'],
};

export async function loadSettings() {
  let s = {};
  try { s = await api.get('settings'); } catch { /* first run */ }
  state.settings = { ...DEFAULTS, ...s };
  applyLook();
}

let saveTimer;
export function setSetting(patch) {
  Object.assign(state.settings, patch);
  applyLook();
  emit('settings', patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.post('settings', state.settings).catch(() => {}), 350);
}

export function applyLook() {
  const s = state.settings, b = document.body;
  const auto = matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night';
  b.dataset.theme = s.theme === 'auto' ? auto : s.theme;
  b.dataset.accent = s.accent;
  b.dataset.motion = s.motion;
  b.dataset.wall = s.wallpaper;
  const custom = document.getElementById('wall-custom');
  if (custom) custom.style.backgroundImage = s.wallpaper === 'custom' && s.wallpaperPath
    ? `url("${api.fileUrl(s.wallpaperPath)}")` : '';
}

// ---------------------------------------------------------------- DOM helpers
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sv == null) continue;
        if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
      }
    }
    else if (k === 'html') el.innerHTML = v;            // only ever used with our own icon markup
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const wait = ms => new Promise(r => setTimeout(r, ms));

export const basename = p => p.split('/').filter(Boolean).pop() || '/';
export const dirname = p => { const s = p.split('/').filter(Boolean); s.pop(); return '/' + s.join('/'); };
export const join = (a, b) => (a.replace(/\/+$/, '') + '/' + b.replace(/^\/+/, '')).replace(/^\/+/, '/');
export const extOf = n => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; };

// ---------------------------------------------------------------- icons (one consistent 1.8px stroke set)
const doc = '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>';
const folder = '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>';
const P = {
  folder,
  file: doc,
  text: doc + '<path d="M9 13h6M9 17h4"/>',
  pdf: doc + '<path d="M8.5 17v-4h1.3a1.3 1.3 0 0 1 0 2.6H8.5M13 13v4h.8a2 2 0 0 0 0-4z"/>',
  doc: doc + '<path d="M8 12.5 9.2 17l1.3-3.5 1.3 3.5L13 12.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  video: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3z"/>',
  audio: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  other: doc,
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  upload: '<path d="M12 15V4m0 0L8 8m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  lock: '<rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 7.7-1.5"/>',
  power: '<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3M12.5 15H17"/>',
  lens: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v5M20.5 12h-5M12 20.5v-5M3.5 12h5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M17 7 7 17M7 7l10 10"/>',
  sink: '<path d="m7.5 8.5 4.5 4.5 4.5-4.5"/><path d="M5 18h14"/>',
  fill: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  unfill: '<path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20"/>',
  home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>',
  documents: doc + '<path d="M9 13h6M9 17h4"/>',
  projects: folder + '<path d="m10.5 11-2 2 2 2m3-4 2 2-2 2"/>',
  pictures: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  downloads: '<path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 5m0-5-5 5"/>',
  motion: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  wallpaper: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m3 16 5-5 4 4 3-3 6 6"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.6 3.2 7.9 7.5 9 4.3-1.1 7.5-4.4 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
  overview: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
  peek: '<path d="M4 20h16"/><path d="M6 16V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10"/><path d="m9.5 10 2.5 2.5L14.5 10"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  zoomin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>',
  zoomout: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  note: '<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h6M9 8h3"/>',
  newfolder: folder + '<path d="M12 10.5v6M9 13.5h6"/>',
  moveto: folder + '<path d="M9.5 13.5h5m-2-2 2 2-2 2"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
  select: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="m9 12 2 2 4-4"/>',
  wrap: '<path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-4m0 0 2-2m-2 2 2 2M4 18h5"/>',
  preview: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  segments: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
};
export function icon(name, size = 18, cls = '') {
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.file}</svg>`;
}
export function ico(name, size, cls) {
  const t = document.createElement('template');
  t.innerHTML = icon(name, size, cls);
  return t.content.firstChild;
}

// The Orange mark: a slice with eight segments.
export function logo(size = 40, cls = '') {
  const rad = d => (d * Math.PI) / 180, R = 8.6, ri = 1.5, c = 12;
  const pt = (r, a) => `${(c + r * Math.cos(rad(a))).toFixed(2)} ${(c + r * Math.sin(rad(a))).toFixed(2)}`;
  let segs = '';
  for (let i = 0; i < 8; i++) {
    const a0 = i * 45 - 90 + 4, a1 = (i + 1) * 45 - 90 - 4, mid = (a0 + a1) / 2;
    segs += `<path class="seg" style="--i:${i}" d="M${pt(ri, mid)} L${pt(R, a0)} A${R} ${R} 0 0 1 ${pt(R, a1)} Z"/>`;
  }
  return `<svg class="logo ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle class="rind" cx="12" cy="12" r="10.7"/><circle class="pith" cx="12" cy="12" r="9.4"/>${segs}</svg>`;
}

// ---------------------------------------------------------------- formatting
export function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < 3);
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}
const hm = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export function fmtWhen(t) {
  if (!t) return '';
  const d = new Date(t * 1000), now = new Date(), s = (now - d) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (d.toDateString() === now.toDateString()) return `Today ${hm(d)}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${hm(d)}`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
export const timeParts = (d = new Date()) => {
  const parts = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).formatToParts(d);
  const main = parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim();
  const period = parts.find(p => p.type === 'dayPeriod')?.value || '';
  return { main, period };
};
export const timeStr = () => { const t = timeParts(); return t.period ? `${t.main} ${t.period}` : t.main; };
export function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : hr < 22 ? 'Good evening' : 'Good night';
}

// ---------------------------------------------------------------- file kinds
const EXT = {
  image: 'png jpg jpeg gif webp bmp svg ico avif',
  video: 'mp4 webm mov m4v mkv ogv',
  audio: 'mp3 wav ogg m4a flac aac opus',
  pdf: 'pdf',
  code: 'js mjs cjs ts tsx jsx py c h cpp hpp cc cs java rs go rb php kt swift lua sh bash zsh bat cmd ps1 html htm css scss sass less json xml yml yaml toml ini cfg conf sql gd gdshader shader glsl hlsl vue svelte dart r pl asm makefile dockerfile',
  text: 'txt md markdown csv tsv log rtf env gitignore gitattributes editorconfig license readme',
  archive: 'zip rar 7z tar gz tgz bz2 xz iso dmg',
  doc: 'doc docx odt xls xlsx ods ppt pptx odp',
};
const EXT_MAP = {};
for (const [k, v] of Object.entries(EXT)) for (const e of v.split(' ')) EXT_MAP[e] = k;
export function kindOf(name, dir) {
  if (dir) return 'folder';
  const e = extOf(name) || name.toLowerCase();
  return EXT_MAP[e] || 'other';
}
export const KIND = {
  folder: { icon: 'folder', label: 'Folder', color: '#ffb347' },
  image: { icon: 'image', label: 'Image', color: '#ff7eb3' },
  video: { icon: 'video', label: 'Video', color: '#b18cff' },
  audio: { icon: 'audio', label: 'Audio', color: '#4fd1ff' },
  pdf: { icon: 'pdf', label: 'PDF', color: '#ff6b5a' },
  code: { icon: 'code', label: 'Code', color: '#9be15d' },
  text: { icon: 'text', label: 'Text', color: '#ffd166' },
  archive: { icon: 'archive', label: 'Archive', color: '#d4a373' },
  doc: { icon: 'doc', label: 'Document', color: '#6ea8ff' },
  other: { icon: 'file', label: 'File', color: '#c9b8a8' },
};
export const isTextKind = k => k === 'code' || k === 'text';

// ---------------------------------------------------------------- motion
export const EASE = {
  spring: 'cubic-bezier(.18,1.3,.4,1)',
  soft: 'cubic-bezier(.25,1.12,.4,1)',
  out: 'cubic-bezier(.2,.8,.2,1)',
  in: 'cubic-bezier(.55,0,.8,.3)',
};
export function anim(el, frames, opts) {
  const m = state.settings.motion || 'full';
  if (!el || !el.animate || m === 'off') return Promise.resolve();
  const o = typeof opts === 'number' ? { duration: opts } : { ...opts };
  if (m === 'calm') { o.duration = Math.round((o.duration || 240) * 0.55); if (o.easing === EASE.spring) o.easing = EASE.out; }
  const a = el.animate(frames, { easing: EASE.out, ...o });
  return a.finished.catch(() => {});
}

// ---------------------------------------------------------------- sound (synthesised, no files)
let ac;
const TONES = {
  open: [440, 880, 0.11, 'sine', 0.05], close: [620, 330, 0.09, 'sine', 0.04], sink: [760, 240, 0.16, 'sine', 0.045],
  pop: [900, 1300, 0.05, 'triangle', 0.035], tick: [1500, 1500, 0.015, 'square', 0.012], error: [240, 150, 0.2, 'triangle', 0.06],
  ok: [660, 990, 0.12, 'sine', 0.05], lock: [520, 260, 0.22, 'triangle', 0.05], unlock: [330, 880, 0.24, 'sine', 0.05],
  drop: [300, 600, 0.14, 'sine', 0.05],
};
export function sfx(kind) {
  if (!state.settings.sound) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;   // browsers block sound before the first click
  try {
    ac ||= new AudioContext();
    const [f0, f1, dur, type, vol] = TONES[kind] || TONES.pop;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.1);
  } catch { /* audio unavailable */ }
}

// ---------------------------------------------------------------- notifications (shown by the Pip)
export const notify = o => emit('notify', typeof o === 'string' ? { title: o } : o);
export const fail = e => { sfx('error'); notify({ title: 'That didn’t work', body: e?.message || String(e), icon: 'info', tone: 'bad' }); };

// ---------------------------------------------------------------- dialogs ("sheets" that drop from the Pip)
export function ask({ title, body, value, placeholder = '', ok = 'OK', cancel = 'Cancel', danger = false, type = 'text', selectName = false, extra }) {
  const layer = document.getElementById('layer');
  return new Promise(resolve => {
    const hasInput = value !== undefined;
    const input = hasInput ? h('input', { class: 'field', type, placeholder, spellcheck: 'false', autocomplete: 'off' }) : null;
    if (input) input.value = value;
    const scrim = h('div', { class: 'scrim' });
    const okBtn = h('button', { class: `btn ${danger ? 'danger' : 'primary'}` }, ok);
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-head' }, h('span', { class: 'sheet-mark', html: logo(22) }), h('b', {}, title)),
      body ? h('p', { class: 'sheet-body' }, body) : null,
      extra || null,
      input,
      h('div', { class: 'sheet-actions' }, h('button', { class: 'btn ghost', onclick: () => done(null) }, cancel), okBtn));
    let closed = false;
    function done(v) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', key, true);
      anim(sheet, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-16px) scale(.97)', opacity: 0 }], { duration: 150, easing: EASE.in });
      anim(scrim, [{ opacity: 1 }, { opacity: 0 }], 160).then(() => { scrim.remove(); sheet.remove(); });
      setTimeout(() => { scrim.remove(); sheet.remove(); }, 400);
      resolve(v);
    }
    const submit = () => { if (input && !input.value.trim() && type !== 'password') { input.focus(); return; } done(input ? input.value : true); };
    okBtn.onclick = submit;
    scrim.onclick = () => done(null);
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); submit(); }
    }
    document.addEventListener('keydown', key, true);
    layer.append(scrim, sheet);
    anim(scrim, [{ opacity: 0 }, { opacity: 1 }], 200);
    anim(sheet, [{ transform: 'translateY(-36px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EASE.spring });
    sfx('pop');
    requestAnimationFrame(() => {
      if (!input) return okBtn.focus();
      input.focus();
      const dot = input.value.lastIndexOf('.');
      if (selectName && dot > 0) input.setSelectionRange(0, dot); else input.select();
    });
  });
}
