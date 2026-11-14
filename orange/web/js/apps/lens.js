// Lens: photos, video, music and PDFs — straight from the encrypted box, never written to disk.
import { api } from '../api.js';
import { h, icon, ico, notify, sfx, setSetting, fmtSize, kindOf, KIND, basename, dirname, logo, anim, EASE } from '../core.js';
import { register, launch } from '../registry.js';
import { download } from './files.js';

const VIEWABLE = new Set(['image', 'video', 'audio', 'pdf']);

function mount(win, args) {
  const S = { path: args.path, list: [], idx: 0, zoom: 1, x: 0, y: 0, rot: 0 };
  const stage = h('div', { class: 'lens-stage' });
  const nameEl = h('b', { class: 'lens-name' });
  const counter = h('span', { class: 'lens-count' });
  const tbtn = (i, t, fn) => h('button', { class: 'tbtn', title: t, 'aria-label': t, html: icon(i), onclick: fn });
  const zoomBtns = h('div', { class: 'lens-zoom' }, tbtn('zoomout', 'Zoom out (-)', () => zoom(1 / 1.25)), tbtn('fill', 'Fit (0)', fit), tbtn('zoomin', 'Zoom in (+)', () => zoom(1.25)), tbtn('rotate', 'Rotate (R)', () => { S.rot = (S.rot + 90) % 360; apply(true); }));
  const wallBtn = tbtn('wallpaper', 'Use as wallpaper', () => { setSetting({ wallpaper: 'custom', wallpaperPath: S.path }); sfx('ok'); notify({ title: 'New wallpaper', body: basename(S.path), icon: 'wallpaper', tone: 'good' }); });
  const tb = h('header', { class: 'tb', 'data-drag': '' },
    tbtn('left', 'Previous (←)', () => step(-1)), tbtn('right', 'Next (→)', () => step(1)), nameEl, counter, h('div', { class: 'grow' }),
    zoomBtns, wallBtn, tbtn('download', 'Export a decrypted copy', () => download([{ path: S.path, name: basename(S.path) }])),
    tbtn('folder', 'Show in Files', () => launch('files', { path: dirname(S.path) })));
  const root = h('div', { class: 'lens', tabindex: '0' }, tb, stage);
  win.body.append(root);
  win.getArgs = () => ({ path: S.path });

  function apply(smooth) {
    const img = stage.querySelector('.lens-img');
    if (!img) return;
    img.style.transition = smooth ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
    img.style.transform = `translate(${S.x}px,${S.y}px) scale(${S.zoom}) rotate(${S.rot}deg)`;
    win.setStatus(h('span', {}, `${Math.round(S.zoom * 100)}%`, h('em', {}, ` · ${img.naturalWidth || '?'} × ${img.naturalHeight || '?'}`)));
  }
  function fit() { S.zoom = 1; S.x = 0; S.y = 0; apply(true); }
  function zoom(f, cx, cy) {
    const nz = Math.max(0.1, Math.min(12, S.zoom * f));
    if (cx != null) { const r = stage.getBoundingClientRect(); const px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2; S.x = px - (px - S.x) * (nz / S.zoom); S.y = py - (py - S.y) * (nz / S.zoom); }
    S.zoom = nz; apply(cx == null);
  }

  async function show(path, dir = 0) {
    S.path = path; S.zoom = 1; S.x = 0; S.y = 0; S.rot = 0;
    const name = basename(path), k = kindOf(name), url = api.fileUrl(path, { v: Date.now() });
    win.setTitle(name);
    nameEl.textContent = name;
    counter.textContent = S.list.length > 1 ? `${S.idx + 1} / ${S.list.length}` : '';
    zoomBtns.hidden = k !== 'image'; wallBtn.hidden = k !== 'image';
    let el;
    if (k === 'image') {
      el = h('img', { class: 'lens-img', src: url, alt: name, draggable: 'false' });
      el.onload = () => apply(false);
    } else if (k === 'video') {
      el = h('video', { class: 'lens-media', src: url, controls: true, autoplay: true });
      win.setStatus('Video · streamed and decrypted on the fly');
    } else if (k === 'audio') {
      const audio = h('audio', { src: url, controls: true, autoplay: true });
      const disc = h('div', { class: 'disc', html: logo(180) });
      audio.onplay = () => disc.classList.add('spin'); audio.onpause = () => disc.classList.remove('spin');
      el = h('div', { class: 'lens-audio' }, disc, h('b', {}, name.replace(/\.[^.]+$/, '')), audio);
      win.setStatus('Music · decrypted as it plays');
    } else if (k === 'pdf') {
      el = h('iframe', { class: 'lens-pdf', src: url, title: name });
      win.setStatus('PDF');
    } else {
      const meta = S.list[S.idx] || {};
      el = h('div', { class: 'lens-none' }, h('div', { class: 'lens-none-ico', style: { '--k': KIND[k].color }, html: icon(KIND[k].icon, 54) }),
        h('b', {}, name), h('span', {}, `${KIND[k].label}${meta.size ? ' · ' + fmtSize(meta.size) : ''} — Orange can’t show this kind of file yet.`),
        h('div', { class: 'empty-acts' },
          h('button', { class: 'btn primary', onclick: () => download([{ path, name }]) }, ico('download', 16), 'Export to open it'),
          h('button', { class: 'btn', onclick: () => launch('code', { path }) }, ico('code', 16), 'Open as text')));
      win.setStatus(KIND[k].label);
    }
    stage.replaceChildren(el);
    if (dir) anim(el, [{ transform: `translateX(${dir * 60}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: EASE.out });
  }

  function step(d) {
    if (S.list.length < 2) return;
    S.idx = (S.idx + d + S.list.length) % S.list.length;
    sfx('tick');
    show(S.list[S.idx].path, d);
  }

  stage.addEventListener('wheel', e => {
    if (!stage.querySelector('.lens-img')) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  }, { passive: false });
  stage.addEventListener('pointerdown', e => {
    const img = stage.querySelector('.lens-img');
    if (!img || e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX - S.x, y0 = e.clientY - S.y;
    stage.classList.add('panning');
    const mv = ev => { S.x = ev.clientX - x0; S.y = ev.clientY - y0; apply(false); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); stage.classList.remove('panning'); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  stage.addEventListener('dblclick', e => { if (stage.querySelector('.lens-img')) S.zoom > 1.01 ? fit() : zoom(2.2, e.clientX, e.clientY); });
  root.addEventListener('keydown', e => {
    if (e.target.closest('video,audio')) return;
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === '+' || e.key === '=') zoom(1.25);
    else if (e.key === '-') zoom(1 / 1.25);
    else if (e.key === '0') fit();
    else if (e.key.toLowerCase() === 'r') { S.rot = (S.rot + 90) % 360; apply(true); }
  });
  win.focusMain = () => root.focus();
  win.reopen = a => a.path && loadList(a.path);

  async function loadList(path) {
    try {
      const { items } = await api.get('list', { path: dirname(path) });
      S.list = items.filter(i => !i.dir && VIEWABLE.has(kindOf(i.name)));
      S.idx = Math.max(0, S.list.findIndex(i => i.path === path));
      if (!S.list.some(i => i.path === path)) { S.list = [{ path, name: basename(path) }]; S.idx = 0; }
    } catch { S.list = [{ path, name: basename(path) }]; }
    show(path);
    setTimeout(() => root.focus(), 50);
  }
  if (!S.path) {
    stage.replaceChildren(h('div', { class: 'lens-none' }, h('div', { class: 'lens-none-ico', html: icon('lens', 54) }), h('b', {}, 'Lens'), h('span', {}, 'Open a photo, video, song or PDF from Files.'),
      h('button', { class: 'btn primary', onclick: () => launch('files', { path: '/Pictures' }) }, ico('pictures', 16), 'Browse Pictures')));
    return;
  }
  return loadList(S.path);
}

register({ id: 'lens', name: 'Lens', icon: 'lens', color: '#ff5d8f', grad: 'linear-gradient(135deg,#ff9ac1,#ff3d6e)', size: [900, 620], mount, blurb: 'Photos, video, music, PDF' });
