// Paint: brushes, eraser, fill bucket, lines & shapes, undo/redo, open and save pictures inside the box.
import { api } from '../api.js';
import { h, icon, ico, sfx, notify, fail, ask, basename, dirname } from '../core.js';
import { register } from '../registry.js';

const COLORS = ['#1d1d1d', '#ffffff', '#e53935', '#ff8a1f', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#5e35b1', '#d81b60', '#8d6e63', '#9e9e9e',
  '#ffcdd2', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b3e5fc', '#d1c4e9', '#f8bbd0', '#3e2723'];
const STAMPS = ['⭐', '❤️', '🌸', '🍊', '🐱', '🦋', '🌈', '☀️', '🚗', '🎈'];

function mount(win, args) {
  const S = { tool: 'brush', color: '#ff8a1f', size: 10, path: args.path || null, dirty: false, stamp: '⭐' };
  const W = 1200, H = 800;
  const canvas = h('canvas', { class: 'pt-canvas', width: W, height: H });
  const c = canvas.getContext('2d', { willReadFrequently: true });
  const preview = h('canvas', { class: 'pt-preview', width: W, height: H });
  const pc = preview.getContext('2d');
  const undo = [], redo = [];
  const snap = () => { undo.push(c.getImageData(0, 0, W, H)); if (undo.length > 25) undo.shift(); redo.length = 0; S.dirty = true; win.setDirty(true); };
  const clear = () => { c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); };
  clear();

  const toolBtn = (id, i, label) => h('button', { class: 'tbtn pt-tool' + (S.tool === id ? ' on' : ''), title: label, 'aria-label': label, dataset: { t: id }, html: icon(i), onclick: () => { S.tool = id; tools.querySelectorAll('.pt-tool').forEach(b => b.classList.toggle('on', b.dataset.t === id)); stampRow.hidden = id !== 'stamp'; } });
  const tools = h('div', { class: 'pt-tools' },
    toolBtn('brush', 'brush', 'Brush (B)'), toolBtn('eraser', 'eraser', 'Eraser (E)'), toolBtn('fill', 'bucket', 'Fill (F)'),
    toolBtn('line', 'line', 'Line (L)'), toolBtn('rect', 'square', 'Rectangle (R)'), toolBtn('circle', 'circle', 'Circle (C)'),
    h('button', { class: 'tbtn pt-tool', title: 'Stamps', dataset: { t: 'stamp' }, onclick: e => { S.tool = 'stamp'; tools.querySelectorAll('.pt-tool').forEach(b => b.classList.toggle('on', b.dataset.t === 'stamp')); stampRow.hidden = false; } }, '⭐'));
  const sizeIn = h('input', { type: 'range', min: 2, max: 60, value: S.size, class: 'pt-size', title: 'Brush size', oninput: e => (S.size = +e.target.value) });
  const swatches = h('div', { class: 'pt-colors' }, COLORS.map(col => h('button', { class: 'pt-sw' + (col === S.color ? ' on' : ''), style: { '--c': col }, title: col, onclick: e => pickColor(col) })),
    h('label', { class: 'pt-sw custom', title: 'Any colour' }, h('input', { type: 'color', value: S.color, oninput: e => pickColor(e.target.value) })));
  const stampRow = h('div', { class: 'pt-stamps', hidden: true }, STAMPS.map(s => h('button', { class: 'pt-stamp', onclick: () => (S.stamp = s) }, s)));
  function pickColor(col) { S.color = col; swatches.querySelectorAll('.pt-sw').forEach(b => b.classList.toggle('on', b.style.getPropertyValue('--c') === col)); if (S.tool === 'eraser') S.tool = 'brush'; }

  const btn = (i, t, fn) => h('button', { class: 'tbtn', title: t, 'aria-label': t, html: icon(i), onclick: fn });
  win.body.append(h('div', { class: 'pt' },
    h('header', { class: 'tb', 'data-drag': '' }, tools, h('div', { class: 'pt-sep' }), sizeIn, h('div', { class: 'grow' }),
      btn('undo', 'Undo (Ctrl+Z)', () => doUndo()), btn('redo', 'Redo (Ctrl+Y)', () => doRedo()),
      btn('newfolder', 'Open a picture from the box', () => openPicture()), btn('plus', 'New canvas', () => { snap(); clear(); }),
      h('button', { class: 'tbtn primary', onclick: () => save() }, ico('save', 16), h('span', {}, 'Save'))),
    h('div', { class: 'pt-side' }, swatches, stampRow),
    h('div', { class: 'pt-stage' }, h('div', { class: 'pt-paper' }, canvas, preview))));

  const pos = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  let drawing = false, start = null, last = null;
  preview.addEventListener('pointerdown', e => {
    preview.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    if (S.tool === 'fill') { snap(); flood(x | 0, y | 0); sfx('pop'); return; }
    if (S.tool === 'stamp') { snap(); c.font = `${S.size * 4}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(S.stamp, x, y); sfx('pop'); return; }
    snap(); drawing = true; start = last = [x, y];
    if (S.tool === 'brush' || S.tool === 'eraser') { stroke([x, y], [x + 0.1, y]); }
  });
  preview.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pos(e);
    if (S.tool === 'brush' || S.tool === 'eraser') { stroke(last, p); last = p; }
    else { pc.clearRect(0, 0, W, H); shape(pc, start, p); }
  });
  preview.addEventListener('pointerup', e => {
    if (!drawing) return;
    drawing = false;
    if (!['brush', 'eraser'].includes(S.tool)) { pc.clearRect(0, 0, W, H); shape(c, start, pos(e)); }
  });
  function stroke(a, b) {
    c.lineCap = c.lineJoin = 'round'; c.lineWidth = S.size; c.strokeStyle = S.tool === 'eraser' ? '#fff' : S.color;
    c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke();
  }
  function shape(cx, a, b) {
    cx.lineCap = cx.lineJoin = 'round'; cx.lineWidth = S.size; cx.strokeStyle = S.color;
    cx.beginPath();
    if (S.tool === 'line') { cx.moveTo(...a); cx.lineTo(...b); }
    if (S.tool === 'rect') cx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    if (S.tool === 'circle') cx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
    cx.stroke();
  }
  function flood(x, y) {
    const img = c.getImageData(0, 0, W, H), d = img.data, i0 = (y * W + x) * 4;
    const t = [d[i0], d[i0 + 1], d[i0 + 2]];
    const n = parseInt(S.color.slice(1), 16), f = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    if (t.every((v, k) => Math.abs(v - f[k]) < 3)) return;
    const same = i => Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) < 60;
    const stack = [x, y];
    while (stack.length) {
      const yy = stack.pop(), xx0 = stack.pop();
      let xx = xx0;
      while (xx >= 0 && same((yy * W + xx) * 4)) xx--;
      xx++;
      let up = false, down = false;
      while (xx < W && same((yy * W + xx) * 4)) {
        const i = (yy * W + xx) * 4; d[i] = f[0]; d[i + 1] = f[1]; d[i + 2] = f[2]; d[i + 3] = 255;
        if (yy > 0) { const u = same(((yy - 1) * W + xx) * 4); if (u && !up) { stack.push(xx, yy - 1); up = true; } else if (!u) up = false; }
        if (yy < H - 1) { const v = same(((yy + 1) * W + xx) * 4); if (v && !down) { stack.push(xx, yy + 1); down = true; } else if (!v) down = false; }
        xx++;
      }
    }
    c.putImageData(img, 0, 0);
  }
  function doUndo() { if (!undo.length) return; redo.push(c.getImageData(0, 0, W, H)); c.putImageData(undo.pop(), 0, 0); }
  function doRedo() { if (!redo.length) return; undo.push(c.getImageData(0, 0, W, H)); c.putImageData(redo.pop(), 0, 0); }

  async function save() {
    let path = S.path;
    if (!path) {
      const name = await ask({ title: 'Save picture', body: 'Saved in Pictures, encrypted.', value: 'My drawing.png', ok: 'Save', selectName: true });
      if (!name) return;
      path = `/Pictures/${name.trim().replace(/\.png$/i, '')}.png`;
    }
    canvas.toBlob(async b => {
      try {
        const r = await api.upload(path, b, null, !!S.path);
        S.path = r.path; S.dirty = false; win.setDirty(false); win.setTitle(basename(S.path));
        sfx('ok'); notify({ title: 'Picture saved & encrypted', body: S.path, icon: 'shield', tone: 'good' });
      } catch (e) { fail(e); }
    }, 'image/png');
  }
  async function load(path) {
    const img = new Image();
    img.onload = () => { snap(); clear(); const s = Math.min(W / img.width, H / img.height, 1); c.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s); S.path = /\.png$/i.test(path) ? path : null; win.setTitle(basename(path)); win.setDirty(false); };
    img.onerror = () => fail(new Error('That picture could not be opened'));
    img.src = api.fileUrl(path, { v: Date.now() });
  }
  async function openPicture() {
    try {
      const { items } = await api.get('list', { path: '/Pictures' });
      const pics = items.filter(i => /\.(png|jpe?g|gif|webp)$/i.test(i.name));
      if (!pics.length) return notify({ title: 'No pictures in Pictures yet', icon: 'image' });
      const list = h('div', { class: 'pick-list' }, pics.map(p => h('button', { class: 'pick-row', onclick: () => { document.querySelector('.sheet .btn.ghost')?.click(); load(p.path); } }, ico('image', 16), h('span', {}, p.name))));
      ask({ title: 'Open a picture', extra: list, ok: 'Close', cancel: 'Cancel' });
    } catch (e) { fail(e); }
  }
  const onKey = e => {
    if (!win.el.classList.contains('active') || e.target.closest?.('input,textarea')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); doUndo(); }
    else if (mod && k === 'y') { e.preventDefault(); doRedo(); }
    else if (mod && k === 's') { e.preventDefault(); save(); }
    else if (!mod && { b: 'brush', e: 'eraser', f: 'fill', l: 'line', r: 'rect', c: 'circle' }[k]) tools.querySelector(`[data-t="${{ b: 'brush', e: 'eraser', f: 'fill', l: 'line', r: 'rect', c: 'circle' }[k]}"]`)?.click();
  };
  addEventListener('keydown', onKey);
  win.destroy = () => removeEventListener('keydown', onKey);
  win.beforeClose = async () => {
    if (!S.dirty) return true;
    const ok = await ask({ title: 'Save your drawing?', body: 'You have changes that are not saved yet.', ok: 'Save', cancel: 'Don’t save' });
    if (ok) await new Promise(r => { save().then(() => setTimeout(r, 400)); });
    return true;
  };
  win.getArgs = () => ({ path: S.path });
  win.setStatus('B brush · E eraser · F fill · Ctrl+Z undo · Ctrl+S save');
  if (args.path) load(args.path);
}

register({ id: 'paint', name: 'Paint', icon: 'paint', color: '#e8457f', grad: 'linear-gradient(135deg,#ff9ac1,#7e57c2)', size: [1000, 700], mount, blurb: 'Draw, colour and stamp' });
