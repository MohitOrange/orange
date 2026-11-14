// Window manager. Orange windows keep their controls on a "Base" bar at the BOTTOM edge:
// title on the left, app status in the middle, Sink / Fill / Close on the right.
import { h, icon, anim, EASE, sfx, emit, state, setSetting, clamp, notify } from './core.js';

export const RAIL = 92;   // space kept free for the app rail on the left
const GAP = 10, BASE = 46, MIN_W = 380, MIN_H = 260;

export const wins = new Map();
let zTop = 20, seq = 0;
export let active = null;

const layer = () => document.getElementById('windows');
export const workArea = () => ({ x: RAIL, y: GAP, w: innerWidth - RAIL - GAP, h: innerHeight - GAP * 2 });
const railIcon = app => document.querySelector(`#rail [data-app="${app}"]`);

function ctl(kind, label, fn) {
  return h('button', {
    class: `ctl ${kind}`, title: label, 'aria-label': label,
    html: icon(kind === 'close' ? 'x' : kind, 16),
    onpointerdown: e => e.stopPropagation(),
    onclick: e => { e.stopPropagation(); fn(); },
  });
}

export class Win {
  constructor(app, opts = {}) {
    this.id = 'w' + ++seq;
    this.app = app;
    this.args = opts.args || {};
    this.state = 'normal';
    this.title = opts.title || app.name;

    const el = (this.el = h('div', { class: 'win', role: 'dialog', 'aria-label': this.title, tabindex: '-1', dataset: { app: app.id } }));
    el.style.setProperty('--app', app.color);
    this.body = h('div', { class: 'win-body' });
    this.statusEl = h('div', { class: 'base-status' });
    this.titleEl = h('span', { class: 't' }, this.title);
    this.dirtyEl = h('i', { class: 'dirty', title: 'Saving…' });
    this.fillBtn = ctl('fill', 'Fill the screen (Alt+Enter)', () => this.toggleFill());
    this.base = h('footer', { class: 'win-base' },
      h('div', { class: 'base-title' }, h('span', { class: 'app-dot', html: icon(app.icon, 13) }), this.titleEl, this.dirtyEl),
      this.statusEl,
      h('div', { class: 'base-ctl' },
        h('div', { class: 'ctl-pair' }, ctl('sink', 'Sink into the rail (Alt+M)', () => this.minimize()), this.fillBtn),
        ctl('close', 'Close (Alt+Q)', () => this.close())));
    el.append(this.body, this.base, ...['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => h('div', { class: `rz rz-${d}`, dataset: { dir: d } })));

    el.addEventListener('pointerdown', () => this.focus(), true);
    this.base.addEventListener('pointerdown', e => e.button === 0 && this.startDrag(e));
    this.base.addEventListener('dblclick', e => { if (!e.target.closest('button')) this.toggleFill(); });
    el.addEventListener('pointerdown', e => {
      const rz = e.target.closest('.rz');
      if (rz && e.button === 0) return this.startResize(e, rz.dataset.dir);
      // drag from any empty toolbar marked data-drag (people instinctively grab the top), or Alt+drag anywhere
      const grip = e.target.closest('[data-drag]');
      if (e.button === 0 && (e.altKey || (grip && !e.target.closest('button,input,textarea,select,a,[contenteditable],.no-drag'))))
        this.startDrag(e);
    });
    this.r = this.initialRect(opts);
  }

  initialRect(opts) {
    const wa = workArea();
    const mem = state.settings.windows?.[this.app.id];
    const [dw, dh] = this.app.size || [880, 580];
    let w = clamp(opts.w || mem?.w || dw, MIN_W, wa.w), hh = clamp(opts.h || mem?.h || dh, MIN_H, wa.h);
    const same = [...wins.values()].filter(x => x.app.id === this.app.id).length;
    if (opts.x != null && opts.y != null) return { x: Math.round(opts.x), y: Math.round(opts.y), w: Math.round(w), h: Math.round(hh) };
    let x = mem?.x ?? wa.x + (wa.w - w) / 2, y = mem?.y ?? wa.y + (wa.h - hh) / 2 - 8;
    x += same * 34; y += same * 30;
    if (x + w > wa.x + wa.w) x = wa.x + 20 + (same % 5) * 24;
    if (y + hh > wa.y + wa.h) y = wa.y + 20 + (same % 5) * 22;
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) };
  }

  apply() {
    const s = this.el.style, r = this.r;
    s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px';
  }

  clamp() {
    const r = this.r;
    r.w = Math.min(r.w, innerWidth); r.h = Math.min(r.h, innerHeight);
    r.x = clamp(r.x, -r.w + 140, innerWidth - 140);
    r.y = clamp(r.y, 36 - r.h + BASE, innerHeight - r.h);   // the Base bar always stays reachable
  }

  async show(origin) {
    wins.set(this.id, this);
    layer().append(this.el);
    this.apply();
    this.focus();
    sfx('open');
    emit('wm', { type: 'open', win: this });
    const o = origin?.getBoundingClientRect?.();
    if (o && o.width) {
      const dx = o.left + o.width / 2 - (this.r.x + this.r.w / 2), dy = o.top + o.height / 2 - (this.r.y + this.r.h / 2);
      const s = Math.max(0.05, o.width / this.r.w);
      await anim(this.el, [
        { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 0 },
        { opacity: 1, offset: 0.3 },
        { transform: 'none', opacity: 1 },
      ], { duration: 520, easing: EASE.spring });
    } else {
      await anim(this.el, [{ transform: 'translateY(24px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EASE.spring });
    }
  }

  focus() {
    if (this.state === 'min') return;
    this.el.style.zIndex = ++zTop;
    if (active === this) return;
    active?.el.classList.remove('active');
    active = this;
    this.el.classList.add('active');
    emit('wm', { type: 'focus', win: this });
  }

  setTitle(t) { this.title = t; this.titleEl.textContent = t; this.el.setAttribute('aria-label', t); emit('wm', { type: 'title', win: this }); }
  setStatus(s) { this.statusEl.replaceChildren(...(Array.isArray(s) ? s : [s]).filter(x => x != null)); }
  setDirty(on) { this.el.classList.toggle('is-dirty', !!on); }

  remember() {
    if (this.state !== 'normal') return;
    setSetting({ windows: { ...state.settings.windows, [this.app.id]: { ...this.r } } });
  }

  morph(rect) {
    this.el.classList.add('morph');
    this.r = { ...rect };
    this.apply();
    clearTimeout(this._mt);
    this._mt = setTimeout(() => { this.el.classList.remove('morph'); this.onResize?.(); }, 360);
  }

  toggleFill() {
    if (this.state === 'max' || this.state === 'snap') {
      this.state = 'normal';
      this.el.classList.remove('max');
      this.morph(this.prev || this.initialRect({}));
    } else {
      this.prev = { ...this.r };
      this.state = 'max';
      this.el.classList.add('max');
      this.morph(workArea());
    }
    this.fillBtn.innerHTML = icon(this.state === 'max' ? 'unfill' : 'fill', 16);
    sfx('pop');
    emit('wm', { type: 'fill', win: this });
  }

  snap(zone) {
    const wa = workArea(), hw = (wa.w - GAP) / 2, hh = (wa.h - GAP) / 2;
    const Z = {
      left: { x: wa.x, y: wa.y, w: hw, h: wa.h }, right: { x: wa.x + hw + GAP, y: wa.y, w: hw, h: wa.h },
      tl: { x: wa.x, y: wa.y, w: hw, h: hh }, tr: { x: wa.x + hw + GAP, y: wa.y, w: hw, h: hh },
      bl: { x: wa.x, y: wa.y + hh + GAP, w: hw, h: hh }, br: { x: wa.x + hw + GAP, y: wa.y + hh + GAP, w: hw, h: hh },
    };
    if (zone === 'fill') { if (this.state !== 'max') this.toggleFill(); return; }
    if (this.state === 'normal') this.prev = { ...this.r };
    this.state = 'snap';
    this.el.classList.remove('max');
    this.morph(Z[zone]);
    sfx('pop');
    emit('wm', { type: 'fill', win: this });
  }

  startDrag(e) {
    e.preventDefault();
    if (this.state === 'max' || this.state === 'snap') {
      // pull a filled window off the edge: it shrinks back under the pointer
      const ratio = (e.clientX - this.r.x) / this.r.w;
      const prev = this.prev || this.initialRect({});
      this.state = 'normal';
      this.el.classList.remove('max');
      this.fillBtn.innerHTML = icon('fill', 16);
      this.r = { ...prev, x: e.clientX - ratio * prev.w, y: e.clientY - prev.h + BASE / 2 };
      this.clamp(); this.apply();
      emit('wm', { type: 'fill', win: this });
    }
    const sx = e.clientX - this.r.x, sy = e.clientY - this.r.y;
    let moved = false, zone = null;
    const ghost = document.getElementById('snap-ghost');
    const move = ev => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
      if (!moved) { moved = true; this.el.classList.add('dragging'); }
      this.r.x = ev.clientX - sx; this.r.y = ev.clientY - sy;
      this.clamp(); this.apply();
      zone = snapZone(ev.clientX, ev.clientY);
      showGhost(ghost, zone);
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      this.el.classList.remove('dragging');
      showGhost(ghost, null);
      if (zone) this.snap(zone); else if (moved) this.remember();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  startResize(e, dir) {
    e.preventDefault(); e.stopPropagation();
    if (this.state !== 'normal') { this.state = 'normal'; this.el.classList.remove('max'); this.fillBtn.innerHTML = icon('fill', 16); }
    const s = { ...this.r }, x0 = e.clientX, y0 = e.clientY;
    this.el.classList.add('dragging');
    const move = ev => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0, r = { ...s };
      if (dir.includes('e')) r.w = Math.max(MIN_W, s.w + dx);
      if (dir.includes('s')) r.h = Math.max(MIN_H, s.h + dy);
      if (dir.includes('w')) { r.w = Math.max(MIN_W, s.w - dx); r.x = s.x + s.w - r.w; }
      if (dir.includes('n')) { r.h = Math.max(MIN_H, s.h - dy); r.y = s.y + s.h - r.h; }
      this.r = r; this.apply(); this.onResize?.();
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); this.el.classList.remove('dragging'); this.remember(); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  async minimize() {
    if (this.state === 'min') return;
    sfx('sink');
    this.prevState = this.state;
    this.state = 'min';
    const t = railIcon(this.app.id)?.getBoundingClientRect();
    if (t) {
      const dx = t.left + t.width / 2 - (this.r.x + this.r.w / 2), dy = t.top + t.height / 2 - (this.r.y + this.r.h / 2);
      await anim(this.el, [
        { transform: 'none', opacity: 1, filter: 'blur(0px)' },
        { transform: `translate(${dx * 0.55}px,${dy * 0.35}px) scale(.55)`, opacity: 0.85, offset: 0.55 },
        { transform: `translate(${dx}px,${dy}px) scale(.04)`, opacity: 0, filter: 'blur(2px)' },
      ], { duration: 460, easing: 'cubic-bezier(.5,0,.7,.4)' });
    }
    this.el.classList.add('hidden');
    if (active === this) { this.el.classList.remove('active'); active = null; focusTop(); }
    emit('wm', { type: 'min', win: this });
  }

  async restore() {
    if (this.state !== 'min') return this.focus();
    this.state = this.prevState || 'normal';
    this.el.classList.remove('hidden');
    this.focus();
    sfx('open');
    emit('wm', { type: 'restore', win: this });
    const t = railIcon(this.app.id)?.getBoundingClientRect();
    if (t) {
      const dx = t.left + t.width / 2 - (this.r.x + this.r.w / 2), dy = t.top + t.height / 2 - (this.r.y + this.r.h / 2);
      await anim(this.el, [{ transform: `translate(${dx}px,${dy}px) scale(.04)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 480, easing: EASE.spring });
    }
  }

  async close(force) {
    if (!force && this.beforeClose && (await this.beforeClose()) === false) return;
    sfx('close');
    this.remember();
    wins.delete(this.id);
    if (active === this) active = null;
    emit('wm', { type: 'close', win: this });
    await anim(this.el, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(18px) scale(.93)', opacity: 0 }], { duration: 210, easing: EASE.in });
    this.el.remove();
    this.destroy?.();
    focusTop();
  }

  serialize() {
    return { app: this.app.id, args: this.getArgs ? this.getArgs() : this.args, r: this.state === 'max' ? this.prev || this.r : this.r, max: this.state === 'max', min: this.state === 'min' };
  }
}

export function clearActive() {
  if (!active) return;
  active.el.classList.remove('active');
  active = null;
  emit('wm', { type: 'focus', win: null });
}

export function focusTop() {
  const vis = [...wins.values()].filter(w => w.state !== 'min').sort((a, b) => b.el.style.zIndex - a.el.style.zIndex);
  if (vis[0]) vis[0].focus();
  else { active = null; emit('wm', { type: 'focus', win: null }); }
}

function snapZone(x, y) {
  const W = innerWidth, H = innerHeight, E = 6, C = 90;
  if (x <= E) return y < C ? 'tl' : y > H - C ? 'bl' : 'left';
  if (x >= W - E) return y < C ? 'tr' : y > H - C ? 'br' : 'right';
  if (y <= E) return 'fill';
  return null;
}

function showGhost(g, zone) {
  if (!zone) { if (!g.hidden) { g.classList.remove('on'); g.hidden = true; } return; }
  const wa = workArea(), hw = (wa.w - GAP) / 2, hh = (wa.h - GAP) / 2;
  const Z = {
    fill: [wa.x, wa.y, wa.w, wa.h], left: [wa.x, wa.y, hw, wa.h], right: [wa.x + hw + GAP, wa.y, hw, wa.h],
    tl: [wa.x, wa.y, hw, hh], tr: [wa.x + hw + GAP, wa.y, hw, hh], bl: [wa.x, wa.y + hh + GAP, hw, hh], br: [wa.x + hw + GAP, wa.y + hh + GAP, hw, hh],
  }[zone];
  if (g.dataset.zone === zone && !g.hidden) return;
  g.dataset.zone = zone;
  Object.assign(g.style, { left: Z[0] + 'px', top: Z[1] + 'px', width: Z[2] + 'px', height: Z[3] + 'px' });
  if (g.hidden) { g.hidden = false; requestAnimationFrame(() => g.classList.add('on')); }
}

// ---------------------------------------------------------------- Overview: every window, spread out
let ov = false;
export function toggleOverview(force) {
  const want = force ?? !ov;
  const list = [...wins.values()];
  if (want && !list.length) { notify({ title: 'Nothing open yet', body: 'Open an app from the rail on the left.', icon: 'overview' }); return; }
  ov = want;
  document.body.classList.toggle('overview', ov);
  if (!ov) {
    document.body.classList.add('ov-leaving');
    clearTimeout(toggleOverview.t);
    toggleOverview.t = setTimeout(() => document.body.classList.remove('ov-leaving'), 480);
    for (const w of list) {
      w.el.style.transform = '';
      w.el.removeAttribute('data-ov');
      if (w.state === 'min') setTimeout(() => w.state === 'min' && w.el.classList.add('hidden'), 380);
    }
    return;
  }
  sfx('pop');
  const n = list.length, cols = Math.ceil(Math.sqrt(n * (innerWidth / innerHeight) / 1.4)), rows = Math.ceil(n / cols);
  const ax = RAIL + 30, ay = 70, aw = innerWidth - ax - 30, ah = innerHeight - ay - 60;
  const cw = aw / cols, ch = ah / rows;
  list.forEach((w, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const rowCount = r === rows - 1 ? n - cols * (rows - 1) : cols;
    const offset = (cols - rowCount) * cw / 2;
    const s = Math.min((cw - 40) / w.r.w, (ch - 56) / w.r.h, 1);
    const cx = ax + offset + cw * c + cw / 2, cy = ay + ch * r + ch / 2;
    const dx = cx - (w.r.x + w.r.w / 2), dy = cy - (w.r.y + w.r.h / 2);
    w.el.classList.remove('hidden');
    w.el.dataset.ov = w.title;
    w.el.style.transform = `translate(${dx}px,${dy}px) scale(${s})`;
  });
}
export const inOverview = () => ov;
