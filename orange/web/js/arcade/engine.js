// Orange game kit: one tiny engine every Arcade game runs on.
// Light by design: 60 fps cap, the loop stops completely while the window is hidden or sunk,
// device-pixel-ratio capped at 1.5, and nothing runs until a game is opened.
import { h, icon, sfx, state } from '../core.js';
import { api } from '../api.js';

export const PALETTE = ['#ff8a1f', '#ffd166', '#6fd13f', '#4fd1ff', '#b18cff', '#ff7eb3', '#ff5a3c', '#2fb8ff'];
export const rand = (a, b) => (b === undefined ? Math.floor(Math.random() * a) : a + Math.random() * (b - a));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------------------------------------------------------------- scores (encrypted in the box)
let store = null, saveT;
export async function loadScores() {
  if (store) return store;
  try { store = await api.get('kv', { key: 'arcade' }); } catch { store = {}; }
  store.best ||= {}; store.plays ||= {}; store.recent ||= [];
  return store;
}
function saveScores() { clearTimeout(saveT); saveT = setTimeout(() => api.post('kv', { key: 'arcade', value: store }).catch(() => {}), 600); }
export function recordPlay(id) {
  if (!store) return;
  store.plays[id] = (store.plays[id] || 0) + 1;
  store.recent = [id, ...store.recent.filter(x => x !== id)].slice(0, 8);
  saveScores();
}
export function best(id) { return store?.best?.[id] || 0; }
function setBest(id, v, lowerIsBetter) {
  const b = store.best[id];
  if (!b || (lowerIsBetter ? v < b : v > b)) { store.best[id] = v; saveScores(); return true; }
  return false;
}

// ---------------------------------------------------------------- performance overlay
let sysCache = null, sysT = 0;
async function sysStats() {
  if (Date.now() - sysT < 2500) return sysCache;
  sysT = Date.now();
  try { sysCache = await api.get('sys'); } catch { /* ignore */ }
  return sysCache;
}
const mb = n => n == null ? '–' : (n / 1048576).toFixed(0) + ' MB';

// ---------------------------------------------------------------- run one game inside an element
// entry: catalog entry; mod: the engine module; root: element; win: the Orange window (for pause on sink)
export function runGame(root, entry, mod, win, onExit) {
  const game = mod[entry.engine.split(':')[1]];
  const scoreEl = h('b', { class: 'gm-score' }, '0');
  const bestEl = h('span', { class: 'gm-best' }, best(entry.id) ? `best ${best(entry.id)}` : '');
  const extraEl = h('span', { class: 'gm-extra' });
  const perf = h('div', { class: 'gm-perf', hidden: !state.settings.gameHud });
  const stage = h('div', { class: 'gm-stage' });
  const overlay = h('div', { class: 'gm-over' });
  const btn = (i, t, fn) => h('button', { class: 'tbtn', title: t, 'aria-label': t, html: icon(i), onclick: fn });
  const pauseBtn = btn('pause', 'Pause (P)', () => (paused ? resume() : pause(true)));
  const bar = h('header', { class: 'tb gm-bar', 'data-drag': '' },
    btn('left', 'Back to Arcade', () => exit()),
    h('span', { class: 'gm-ico', style: { '--c': entry.color } }, entry.icon), h('b', { class: 'gm-title' }, entry.title),
    h('div', { class: 'grow' }), extraEl, h('span', { class: 'gm-lbl' }, 'score'), scoreEl, bestEl,
    pauseBtn, btn('rotate', 'Restart (R)', () => restart()),
    btn('motion', 'Performance overlay', () => { state.settings.gameHud = !state.settings.gameHud; perf.hidden = !state.settings.gameHud; }));
  root.replaceChildren(h('div', { class: 'gm' }, bar, h('div', { class: 'gm-wrap' }, stage, overlay), perf));   // HUD sits below the game, never on top of the canvas

  let canvas, c, dpr, raf = 0, last = 0, paused = true, over = false, frames = 0, fpsT = 0, fps = 0, alive = true, G;
  const kind = game.kind || 'canvas';
  const params = entry.params || {};

  const show = (title, sub, label, fn, extra) => {
    overlay.replaceChildren(h('div', { class: 'gm-card' },
      h('div', { class: 'gm-big', style: { '--c': entry.color } }, entry.icon), h('h3', {}, title), sub ? h('p', {}, sub) : null, extra || null,
      h('button', { class: 'btn primary gm-go', onclick: fn }, label)));
    overlay.hidden = false;
    setTimeout(() => overlay.querySelector('.gm-go')?.focus(), 30);
  };

  function makeApi() {
    const api2 = {
      params, score: 0, lives: params.lives ?? 3, t: 0, keys: new Set(), pointer: { x: 0, y: 0, down: false },
      setScore(v) { api2.score = v; scoreEl.textContent = String(v); },
      add(v = 1) { api2.setScore(api2.score + v); },
      status(t) { extraEl.textContent = t || ''; },
      sound(n) { sfx(n); },
      win(msg) { finish(true, msg); },
      lose(msg) { finish(false, msg); },
      color: i => PALETTE[i % PALETTE.length],
      w: game.w || 360, h: game.h || 640,
    };
    return api2;
  }

  function finish(won, msg) {
    if (over) return;
    over = true; paused = true; cancelAnimationFrame(raf);
    const low = !!game.lowerIsBetter;
    const isBest = (G.score > 0 || low) && setBest(entry.id, G.score, low);
    bestEl.textContent = `best ${best(entry.id)}`;
    sfx(won ? 'ok' : 'error');
    show(won ? 'You did it!' : 'Game over', `${msg || ''}${msg ? ' · ' : ''}Score ${G.score}${isBest ? ' · new best! 🏆' : ''}`, 'Play again', restart);
  }

  function resize() {
    if (kind !== 'canvas' || !canvas) return;
    const r = stage.getBoundingClientRect();
    const s = Math.min(r.width / G.w, r.height / G.h);
    canvas.style.width = Math.floor(G.w * s) + 'px';
    canvas.style.height = Math.floor(G.h * s) + 'px';
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (G.w / r.width), y: (e.clientY - r.top) * (G.h / r.height) };
  }

  function start() {
    if (G) game.stop?.(G);                          // restart: clear the last round's timers and sounds first
    over = false;
    G = makeApi();
    G.setScore(0); G.status('');
    stage.replaceChildren();
    if (kind === 'canvas') {
      dpr = Math.min(1.5, devicePixelRatio || 1);
      canvas = h('canvas', { class: 'gm-canvas', width: Math.round(G.w * dpr), height: Math.round(G.h * dpr), tabindex: '0' });
      c = canvas.getContext('2d', { alpha: false });
      stage.append(canvas);
      canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); const p = toLocal(e); Object.assign(G.pointer, p, { down: true }); game.tap?.(G, p.x, p.y); });
      canvas.addEventListener('pointermove', e => { const p = toLocal(e); Object.assign(G.pointer, p); game.move?.(G, p.x, p.y); });
      canvas.addEventListener('pointerup', () => { G.pointer.down = false; game.release?.(G); });
      game.start(G);
      resize();
      draw();
    } else {
      game.start(G, stage);
    }
  }

  function draw() {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    game.draw(G, c);
  }

  function loop(t) {
    if (!alive || paused) return;
    raf = requestAnimationFrame(loop);
    if (t - last < 15) return;                       // never faster than ~60 fps
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    G.t += dt;
    game.update(G, dt);
    if (over) return;
    draw();
    frames++;
    if (t - fpsT > 1000) { fps = Math.round(frames * 1000 / (t - fpsT)); frames = 0; fpsT = t; if (!perf.hidden) updatePerf(); }
  }

  async function updatePerf() {
    const m = performance.memory;
    const s = await sysStats();
    perf.replaceChildren(
      h('span', {}, h('b', {}, kind === 'canvas' ? fps : '–'), ' fps'),
      h('span', {}, h('b', {}, m ? mb(m.usedJSHeapSize) : '–'), ' game RAM'),
      h('span', {}, h('b', {}, s?.cpu == null ? '–' : Math.round(s.cpu) + '%'), ' CPU'),
      h('span', {}, h('b', {}, s?.ram ? Math.round(s.ram.percent) + '%' : '–'), ' system RAM'),
      h('span', {}, h('b', {}, s?.disk ? (s.disk.free / 1073741824).toFixed(1) + ' GB' : '–'), ' disk free'));
  }
  let perfTimer = setInterval(() => { if (!perf.hidden && (kind !== 'canvas' || paused)) updatePerf(); }, 3000);

  function resume() {
    if (over) return;
    overlay.hidden = true;
    pauseBtn.innerHTML = icon('pause');
    if (kind === 'canvas') { paused = false; last = performance.now(); fpsT = last; frames = 0; raf = requestAnimationFrame(loop); canvas.focus(); }
    else paused = false;
  }
  function pause(showCard) {
    if (over || paused) return;
    paused = true; cancelAnimationFrame(raf);
    pauseBtn.innerHTML = icon('play');
    if (showCard) show('Paused', 'Take a break. Your game waits here.', 'Continue', resume);
  }
  function restart() { start(); resume(); }
  function exit() { destroy(); onExit(); }

  const onKey = e => {
    if (!root.isConnected || !win.el.classList.contains('active')) return;
    if (e.target.closest?.('input,textarea')) return;
    const k = e.key;
    if (e.type === 'keydown') {
      if (k.toLowerCase() === 'p' && !game.usesLetters) { e.preventDefault(); return paused ? resume() : pause(true); }
      if (k.toLowerCase() === 'r' && !game.usesLetters && e.altKey === false && over) { e.preventDefault(); return restart(); }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k) && kind === 'canvas') e.preventDefault();
      if (paused && !over && (k === ' ' || k === 'Enter') && !overlay.hidden) { e.preventDefault(); return resume(); }
      G.keys.add(k);
      if (!paused) game.key?.(G, k);
    } else G.keys.delete(k);
  };
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  const onVis = () => { if (document.hidden) pause(true); };
  document.addEventListener('visibilitychange', onVis);
  const watch = setInterval(() => { if (win.state === 'min' && !paused) pause(true); }, 400);

  function destroy() {
    alive = false; paused = true;
    cancelAnimationFrame(raf); clearInterval(watch); clearInterval(perfTimer); ro.disconnect();
    removeEventListener('keydown', onKey); removeEventListener('keyup', onKey);
    document.removeEventListener('visibilitychange', onVis);
    game.stop?.(G);
    root.replaceChildren();
  }

  recordPlay(entry.id);
  start();
  show(entry.title, entry.how || game.how || 'Tap or use the arrow keys.', 'Play', resume);
  if (state.settings.gameHud) updatePerf();
  return { destroy, pause: () => pause(true) };
}
