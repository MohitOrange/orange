// The Orange desktop: boot, rail, four corners, the Pip, Today, search ("Zest"), drop-to-encrypt,
// lock screen, welcome tour and global shortcuts.
import { api } from './api.js';
import {
  h, icon, ico, logo, state, on, emit, notify, fail, sfx, anim, EASE, fmtSize, fmtWhen, greeting,
  kindOf, KIND, setSetting, wait, debounce, basename, dirname, clamp, $, loadSettings, timeStr, timeParts,
} from './core.js';
import { wins, active, toggleOverview, inOverview, focusTop, workArea, clearActive } from './wm.js';
import { apps, launch } from './registry.js';
import { radial, closeRadial, radialOpen } from './radial.js';
import { openItem, PLACES, trashPaths } from './apps/files.js';
import { collect, uploadAll, pick } from './transfer.js';
import { SHORTCUTS, ACCENTS } from './apps/settings.js';
import { hostApps, openHostApp } from './apps/computer.js';

const WALLS = ['juice', 'grove', 'dusk', 'ink'];
const dateStr = (o = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date().toLocaleDateString([], o);
const typing = () => { const a = document.activeElement; return a && (a.matches('input,textarea,select,[contenteditable]')); };

// ================================================================ boot
async function bootSequence() {
  const b = $('#boot');
  const line = h('div', { class: 'boot-line' }, `Unlocking ${state.name}’s box`);
  b.replaceChildren(h('div', { class: 'boot-in' },
    h('div', { class: 'boot-mark', html: logo(136) }),
    h('div', { class: 'boot-name' }, ...'orange'.split('').map((c, i) => h('span', { style: { '--i': i } }, c))),
    line, h('div', { class: 'boot-bar' }, h('i'))));
  b.classList.add('run');
  let skipped = false;
  const skip = new Promise(r => {
    const go = () => { skipped = true; r(); };
    addEventListener('keydown', go, { once: true });
    b.addEventListener('pointerdown', go, { once: true });
  });
  const off = state.settings.motion === 'off', calm = state.settings.motion === 'calm';
  await Promise.race([wait(off ? 0 : calm ? 700 : 1650), skip]);
  if (!skipped) {
    line.textContent = `${greeting()}, ${state.name}.`;
    anim(line, [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 300);
    await Promise.race([wait(off ? 0 : calm ? 250 : 650), skip]);
  }
  b.classList.add('done');
  document.body.classList.add('booted');
  setTimeout(() => { b.classList.remove('run', 'done'); b.replaceChildren(); }, 900);
}

// ================================================================ rail
let railQueued = false;
function renderRail() {
  if (railQueued) return;
  railQueued = true;
  requestAnimationFrame(() => {
    railQueued = false;
    const running = new Map();
    for (const w of wins.values()) running.set(w.app.id, [...(running.get(w.app.id) || []), w]);
    const ids = (state.settings.pinned || []).filter(id => apps[id]);
    for (const id of running.keys()) if (!ids.includes(id) && id !== 'trash') ids.push(id);
    $('#rail').replaceChildren(
      h('div', { class: 'rail-apps' }, ids.map((id, i) => railBtn(id, running.get(id) || [], i))),
      h('div', { class: 'rail-sep' }),
      railBtn('trash', running.get('trash') || [], -1));
    document.body.classList.toggle('has-max', [...wins.values()].some(w => w.state === 'max' || w.state === 'snap'));
  });
}

function railBtn(id, ws, i) {
  const app = apps[id];
  const isActive = ws.includes(active);
  const b = h('button', {
    class: 'rail-btn' + (ws.length ? ' running' : '') + (isActive ? ' active' : '') + (ws.length && ws.every(w => w.state === 'min') ? ' sunk' : ''),
    dataset: { app: id }, 'aria-label': app.name,
    onclick: () => railClick(id, b),
    oncontextmenu: e => { e.preventDefault(); e.stopPropagation(); railMenu(e, id); },
  },
  h('span', { class: 'app-ico', style: { '--g': app.grad }, html: icon(app.icon, 22) }),
  h('span', { class: 'rail-label' }, h('b', {}, app.name), h('small', {}, ws.length ? `${ws.length} open` : app.blurb || ''), i >= 0 && i < 9 ? h('kbd', {}, `Alt ${i + 1}`) : null),
  h('span', { class: 'rail-dots' }, ws.slice(0, 3).map(() => h('i'))));
  if (id === 'trash') {
    b.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('application/x-orange')) { e.preventDefault(); b.classList.add('drop'); } });
    b.addEventListener('dragleave', () => b.classList.remove('drop'));
    b.addEventListener('drop', e => { e.preventDefault(); b.classList.remove('drop'); const raw = e.dataTransfer.getData('application/x-orange'); if (raw) trashPaths(JSON.parse(raw)); });
  }
  return b;
}

function appWins(id) { return [...wins.values()].filter(w => w.app.id === id).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex); }

function railClick(id, b) {
  const ws = appWins(id);
  anim(b.querySelector('.app-ico'), [{ transform: 'scale(1)' }, { transform: 'scale(.82,.9)' }, { transform: 'scale(1.08,.96)' }, { transform: 'scale(1)' }], { duration: 420, easing: EASE.out });
  if (!ws.length) return launch(id, {}, b);
  if (ws.includes(active) && ws.length === 1) return active.minimize();
  if (ws.includes(active)) { const i = ws.indexOf(active); const nxt = ws[(i + 1) % ws.length]; return nxt.state === 'min' ? nxt.restore() : nxt.focus(); }
  const top = ws[0];
  if (ws.every(w => w.state === 'min')) ws.forEach((w, i) => setTimeout(() => w.restore(), i * 70));
  else top.state === 'min' ? top.restore() : top.focus();
}

function railMenu(e, id) {
  const ws = appWins(id), app = apps[id], pinned = state.settings.pinned.includes(id);
  radial({ x: e.clientX + 40, y: e.clientY, title: app.name, items: [
    { label: 'New window', short: 'New', icon: 'plus', run: () => launch(id, {}, $(`#rail [data-app="${id}"]`)), disabled: app.single && ws.length },
    { label: 'Bring all forward', short: 'Show all', icon: 'overview', run: () => ws.forEach(w => (w.state === 'min' ? w.restore() : w.focus())), disabled: !ws.length },
    { label: 'Sink all', short: 'Sink all', icon: 'sink', run: () => ws.forEach(w => w.minimize()), disabled: !ws.length },
    { label: 'Close all', short: 'Close all', icon: 'x', danger: true, run: () => ws.forEach(w => w.close()), disabled: !ws.length },
    id === 'trash' ? null : { label: pinned ? 'Unpin from rail' : 'Keep in rail', short: pinned ? 'Unpin' : 'Pin', icon: 'star', run: () => { setSetting({ pinned: pinned ? state.settings.pinned.filter(x => x !== id) : [...state.settings.pinned, id] }); renderRail(); } },
  ] });
}

// big clocks show the period (AM/PM) small, beside the digits
function bigTime(cls) {
  const t = timeParts();
  return h('span', { class: cls }, h('span', { class: 'bt-main' }, t.main), t.period ? h('small', { class: 'bt-per' }, t.period) : null);
}
function updateBig(el) {
  if (!el) return;
  const t = timeParts();
  const m = el.querySelector('.bt-main'), p = el.querySelector('.bt-per');
  if (m && m.textContent !== t.main) m.textContent = t.main;
  if (p && p.textContent !== t.period) p.textContent = t.period;
}

// ================================================================ greeting (the desktop itself)
async function renderGreet() {
  const g = $('#greet');
  const jump = h('div', { class: 'g-chips' });
  const sub = h('p', { class: 'g-sub' });
  g.replaceChildren(
    h('div', { class: 'g-clock' }, bigTime('g-time'), h('span', { class: 'g-date' }, dateStr())),
    h('h1', {}, `${greeting()}, `, h('span', { class: 'g-name' }, state.name), '.'),
    sub,
    h('div', { class: 'g-jump' }, h('small', {}, 'Jump back in'), jump),
    h('div', { class: 'g-tips' },
      h('span', {}, h('kbd', {}, 'Type'), ' anywhere to search'),
      h('span', {}, h('kbd', {}, 'Right-click'), ' for Segments'),
      h('span', {}, h('kbd', {}, 'Drop files'), ' to encrypt them')));
  try {
    const [st, rec] = await Promise.all([api.get('state'), api.get('recent', { n: 6 })]);
    state.info = st;
    sub.replaceChildren(ico('shield', 16), ` ${st.files} file${st.files === 1 ? '' : 's'} · ${fmtSize(st.bytes)} · sealed with ${st.cipher}`);
    if (rec.items.length) {
      jump.replaceChildren(...rec.items.map((it, i) => {
        const k = kindOf(it.name);
        const c = h('button', { class: 'g-chip', style: { '--k': KIND[k].color, '--i': i }, onclick: e => openItem(it, e.currentTarget), title: it.path },
          h('span', { class: 'g-chip-ico', html: icon(KIND[k].icon, 16) }), h('b', {}, it.name), h('small', {}, fmtWhen(it.mtime)));
        return c;
      }));
    } else {
      jump.replaceChildren(
        h('button', { class: 'g-chip', style: { '--k': '#ff8a1f' }, onclick: async () => { const l = await pick(); if (l.length) uploadAll(l, '/Inbox'); } }, h('span', { class: 'g-chip-ico', html: icon('upload', 16) }), h('b', {}, 'Add your first files'), h('small', {}, 'into Inbox')),
        h('button', { class: 'g-chip', style: { '--k': '#7bd84a' }, onclick: () => launch('code') }, h('span', { class: 'g-chip-ico', html: icon('note', 16) }), h('b', {}, 'Write a note'), h('small', {}, 'saved as you type')),
        h('button', { class: 'g-chip', style: { '--k': '#ffd166' }, onclick: () => startTour() }, h('span', { class: 'g-chip-ico', html: icon('sparkle', 16) }), h('b', {}, 'Take the tour'), h('small', {}, '30 seconds')));
    }
  } catch { /* locked */ }
}
const refreshGreet = debounce(renderGreet, 400);

// ================================================================ corners
const CORNERS = [
  ['tl', 'Overview', 'overview', 'See every window', () => toggleOverview()],
  ['tr', 'Today', 'clock', 'Clock, calendar, switches', () => toggleToday()],
  ['bl', 'Apps', null, 'Every app, as Segments', () => launcherFan()],
  ['br', 'Peek', 'peek', 'Slide windows away', () => peek()],
];
function renderCorners() {
  $('#corners').replaceChildren(...CORNERS.map(([pos, label, ic, hint, run]) => {
    let dwell;
    const b = h('button', {
      class: `corner c-${pos}`, 'aria-label': `${label}: ${hint}`, onclick: e => { e.stopPropagation(); run(); },
      onpointerenter: () => { if (state.settings.hotCorners) dwell = setTimeout(run, 140); },
      onpointerleave: () => clearTimeout(dwell),
    }, h('span', { class: 'corner-disc', html: ic ? icon(ic, 19) : logo(30, 'corner-logo') }), h('span', { class: 'corner-tip' }, h('b', {}, label), h('small', {}, hint)));
    return b;
  }));
}

function launcherFan() {
  const list = ['files', 'computer', 'arcade', 'learn', 'divyanik', 'paint'].filter(id => apps[id]);
  radial({ x: 0, y: innerHeight, mode: 'corner', title: 'Apps', items: [
    ...list.map(id => ({ label: apps[id].name, icon: apps[id].icon, hint: apps[id].blurb, run: () => launch(id, {}, $('.c-bl')) })),
    { label: 'All apps', icon: 'grid', hint: 'or just type', run: () => openZest('') },
    { label: 'Lock', icon: 'lock', hint: 'Ctrl+L', run: () => lock() },
  ] });
}

function peek(force) {
  const on = force ?? !document.body.classList.contains('peek');
  document.body.classList.toggle('peek', on);
  sfx(on ? 'sink' : 'open');
}

// ================================================================ the Pip (status island)
const pipQ = [];
let pipBusy = false, prog = null, pipMode = 'idle';
function pipSet(node, mode, onclick) {
  const pip = $('#pip');
  pipMode = mode;
  pip.dataset.mode = mode;
  const inner = h('div', { class: 'pip-in' }, node);
  const olds = [...pip.querySelectorAll('.pip-in')];
  pip.append(inner);
  pip.onclick = onclick || null;
  const w = inner.offsetWidth, hh = inner.offsetHeight;
  pip.style.width = w + 'px';
  pip.style.height = hh + 'px';
  olds.forEach(o => { o.classList.add('leaving'); setTimeout(() => o.remove(), 260); });
  anim(inner.firstChild, [{ opacity: 0, transform: 'scale(.92)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 360, delay: 60, easing: EASE.out, fill: 'backwards' });
}
function pipIdle() {
  if (prog) return pipProgress(prog);
  const st = state.info || {};
  pipSet(h('div', { class: 'pip-face' },
    h('span', { class: 'pip-logo', html: logo(18) }),
    h('b', { class: 'pip-time' }, timeStr()),
    h('span', { class: 'pip-date' }, `${new Date().toLocaleDateString([], { weekday: 'short' })} ${new Date().getDate()}`),
    h('span', { class: 'pip-more' }, ico('shield', 13), ` ${st.files ?? '…'} files · encrypted`),
    h('span', { class: 'pip-lock', html: icon('lock', 13) })), 'idle', () => toggleToday());
}
function pipProgress(p) {
  pipSet(h('div', { class: 'pip-prog' },
    h('span', { class: 'pip-ring', style: { '--p': Math.round(p.pct * 100) } }, h('i', {}, `${Math.round(p.pct * 100)}`)),
    h('div', {}, h('b', {}, 'Encrypting'), h('small', {}, p.label))), 'prog');
}
async function pipRun() {
  if (pipBusy) return;
  pipBusy = true;
  while (pipQ.length) {
    const n = pipQ.shift();
    let done;
    const finished = new Promise(r => (done = r));
    const act = n.action ? h('button', { class: 'pip-act', onclick: async e => { e.stopPropagation(); done(); await n.action.run(); } }, n.action.label) : null;
    pipSet(h('div', { class: `pip-note tone-${n.tone || 'plain'}` },
      h('span', { class: 'pip-nico', html: icon(n.icon || 'info', 17) }),
      h('div', { class: 'pip-ntext' }, h('b', {}, n.title), n.body ? h('small', {}, n.body) : null), act), 'note', () => done());
    await Promise.race([finished, wait(n.action ? 6500 : 3600)]);
  }
  pipBusy = false;
  pipIdle();
}

// ================================================================ Today panel
let todayOpen = false;
function toggleToday(force) {
  const t = $('#today');
  todayOpen = force ?? !todayOpen;
  if (!todayOpen) {
    anim(t, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-12px) scale(.96)' }], { duration: 160, easing: EASE.in }).then(() => { if (!todayOpen) t.hidden = true; });
    if (state.settings.motion === 'off') t.hidden = true;
    return;
  }
  closeRadial(true);
  sfx('pop');
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1), startDow = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const cal = h('div', { class: 'cal' }, ...['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => h('b', {}, d)),
    ...Array.from({ length: startDow }, () => h('span', { class: 'mut' })),
    ...Array.from({ length: days }, (_, i) => h('span', { class: i + 1 === now.getDate() ? 'now' : '' }, i + 1)));
  const tg = (ic, label, on, fn) => h('button', { class: 'tg' + (on ? ' on' : ''), onclick: e => { fn(); sfx('tick'); toggleToday(true); } }, ico(ic, 19), h('span', {}, label));
  const motionNext = { full: 'calm', calm: 'off', off: 'full' };
  const isFull = !!document.fullscreenElement;
  t.replaceChildren(h('div', { class: 'today-card' },
    h('div', { class: 'td-top' }, h('div', {}, bigTime('td-time'), h('div', { class: 'td-date' }, dateStr())),
      h('div', { class: 'td-user' }, h('span', { class: 'avatar' }, state.name.slice(0, 1).toUpperCase()), h('b', {}, state.name), h('small', {}, 'box unlocked'))),
    h('div', { class: 'td-cal' }, h('div', { class: 'td-month' }, now.toLocaleDateString([], { month: 'long', year: 'numeric' })), cal),
    h('div', { class: 'toggles' },
      tg(state.settings.sound ? 'sound' : 'mute', state.settings.sound ? 'Sound on' : 'Sound off', state.settings.sound, () => setSetting({ sound: !state.settings.sound })),
      tg('motion', `Motion: ${state.settings.motion}`, state.settings.motion !== 'off', () => setSetting({ motion: motionNext[state.settings.motion] })),
      tg(document.body.dataset.theme === 'day' ? 'sun' : 'moon', document.body.dataset.theme === 'day' ? 'Daylight' : 'Night', true, () => setSetting({ theme: document.body.dataset.theme === 'day' ? 'night' : 'day' })),
      tg('fullscreen', isFull ? 'Full screen' : 'Windowed', isFull, () => (isFull ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}))),
    h('div', { class: 'td-accents' }, ACCENTS.map(([v, c, l]) => h('button', { class: 'swatch sm' + (state.settings.accent === v ? ' on' : ''), title: l, 'aria-label': l, style: { '--c': c }, onclick: () => { setSetting({ accent: v }); sfx('tick'); toggleToday(true); } }))),
    h('div', { class: 'td-actions' },
      h('button', { class: 'btn primary', onclick: () => { toggleToday(false); lock(); } }, ico('lock', 16), 'Lock'),
      h('button', { class: 'btn', onclick: () => { toggleToday(false); launch('settings'); } }, ico('settings', 16), 'Settings'),
      h('button', { class: 'btn ghost', onclick: () => { toggleToday(false); shutdown(); } }, ico('power', 16), 'Shut down'))));
  if (t.hidden) {
    t.hidden = false;
    anim(t, [{ opacity: 0, transform: 'translateY(-26px) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 440, easing: EASE.spring });
  }
}

// ================================================================ Zest: type-anywhere search
function calc(expr) {
  const t = expr.replace(/\s+/g, '').replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/,/g, '.');
  if (!/^[\d.+\-*/()%^]+$/.test(t) || !/\d[+\-*/%^]|[+\-*/^]\d|\)/.test(t)) return null;
  let i = 0;
  const eat = c => (t[i] === c ? (i++, true) : false);
  const num = () => {
    if (eat('(')) { const v = add(); if (!eat(')')) throw 0; return v; }
    if (eat('-')) return -num();
    const m = /^(\d+\.?\d*|\.\d+)/.exec(t.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    let v = parseFloat(m[0]);
    if (eat('%')) v /= 100;
    return v;
  };
  const pow = () => { const b = num(); return eat('^') ? Math.pow(b, pow()) : b; };
  const mul = () => { let v = pow(); for (;;) { if (eat('*')) v *= pow(); else if (eat('/')) v /= pow(); else return v; } };
  const add = () => { let v = mul(); for (;;) { if (eat('+')) v += mul(); else if (eat('-')) v -= mul(); else return v; } };
  try { const v = add(); return i === t.length && isFinite(v) ? +v.toPrecision(12) : null; } catch { return null; }
}
function score(text, q) {
  text = text.toLowerCase(); q = q.toLowerCase();
  if (!q) return 0;
  if (text === q) return 100;
  if (text.startsWith(q)) return 80;
  const wi = text.split(/[\s\-_.]+/).findIndex(w => w.startsWith(q));
  if (wi >= 0) return 65 - wi;
  if (text.includes(q)) return 50;
  let j = 0;
  for (const c of text) if (c === q[j]) j++;
  return j === q.length ? 25 : -1;
}
function actions() {
  const s = state.settings;
  return [
    { title: 'Lock the box', sub: 'wipes the key from memory', icon: 'lock', keys: 'lock secure', run: () => lock() },
    { title: 'Shut down Orange', sub: 'lock and close', icon: 'power', keys: 'shutdown quit exit close', run: () => shutdown() },
    { title: 'New note', sub: 'in Documents', icon: 'note', keys: 'write note text create', run: newNoteOnDesk },
    { title: 'Add files to the box', sub: 'into Inbox', icon: 'upload', keys: 'upload import add encrypt', run: async () => { const l = await pick(); l.length && uploadAll(l, '/Inbox'); } },
    { title: 'Overview', sub: 'every window at once', icon: 'overview', keys: 'windows expose mission', run: () => toggleOverview(true) },
    { title: s.theme === 'day' ? 'Switch to Night' : 'Switch to Daylight', sub: 'theme', icon: s.theme === 'day' ? 'moon' : 'sun', keys: 'dark light theme mode', run: () => setSetting({ theme: s.theme === 'day' ? 'night' : 'day' }) },
    { title: s.sound ? 'Turn sounds off' : 'Turn sounds on', sub: 'sound', icon: s.sound ? 'mute' : 'sound', keys: 'mute audio sound', run: () => setSetting({ sound: !s.sound }) },
    { title: 'Next wallpaper', sub: 'cycle the backgrounds', icon: 'wallpaper', keys: 'background wallpaper', run: nextWall },
    { title: 'Empty the Trash', sub: 'opens Trash', icon: 'trash', keys: 'bin recycle trash', run: () => launch('trash') },
    { title: 'Change password', sub: 'Settings · Security', icon: 'shield', keys: 'password security', run: () => launch('settings', { section: 'security' }) },
    { title: 'Storage', sub: 'what’s using space', icon: 'archive', keys: 'disk space storage', run: () => launch('settings', { section: 'storage' }) },
    { title: 'Play a game', sub: 'Arcade · 100+ games', icon: 'play', keys: 'game games play arcade fun kids', run: () => launch('arcade') },
    { title: 'Learn letters', sub: 'English · தமிழ் · numbers', icon: 'learn', keys: 'learn tamil english abc alphabet read write speak kids school', run: () => launch('learn') },
    { title: 'Draw a picture', sub: 'Paint', icon: 'paint', keys: 'draw paint picture colour color art', run: () => launch('paint') },
    { title: 'Write code', sub: 'Studio · HTML CSS React Python SQL', icon: 'studio', keys: 'html css react python sql database javascript program code', run: () => launch('studio') },
    { title: 'Check RAM and CPU', sub: 'Monitor', icon: 'monitor', keys: 'ram cpu memory rom disk performance task manager', run: () => launch('monitor') },
    { title: 'Keyboard shortcuts', sub: 'press ? any time', icon: 'keyboard', keys: 'keys hotkeys help', run: showKeys },
    { title: 'Welcome tour', sub: '30 seconds', icon: 'sparkle', keys: 'help tour guide intro', run: startTour },
    { title: 'Full screen', sub: 'toggle', icon: 'fullscreen', keys: 'fullscreen immersive', run: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}) },
  ];
}
let zest = null;
function openZest(prefill = '') {
  if (zest) { zest.input.focus(); return; }
  closeRadial(true); toggleToday(false);
  const input = h('input', { class: 'zest-in', placeholder: 'Search apps, files, actions — or type a sum', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Search' });
  const list = h('div', { class: 'zest-list', role: 'listbox' });
  const card = h('div', { class: 'zest-card' }, h('div', { class: 'zest-top' }, h('span', { class: 'zest-ico', html: icon('search', 20) }), input, h('kbd', {}, 'Esc')), list);
  const scrim = h('div', { class: 'zest', onpointerdown: e => e.target === scrim && closeZest() }, card);
  $('#layer').append(scrim);
  anim(scrim, [{ opacity: 0 }, { opacity: 1 }], 180);
  anim(card, [{ transform: 'translateY(-40px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EASE.spring });
  sfx('pop');
  let rows = [], sel = 0, reqId = 0;
  const render = () => {
    list.replaceChildren();
    let group = '';
    rows.forEach((r, i) => {
      if (r.group !== group) { group = r.group; list.append(h('div', { class: 'zest-g' }, group)); }
      const el = h('button', { class: 'zest-row' + (i === sel ? ' sel' : ''), role: 'option', onclick: () => runRow(i), onpointermove: () => { if (sel !== i) { sel = i; paint(); } } },
        h('span', { class: 'zr-ico', style: r.grad ? { background: r.grad, color: '#fff' } : r.color ? { '--k': r.color } : null, html: r.logo ? logo(20) : icon(r.icon, 18) }),
        h('span', { class: 'zr-t' }, h('b', {}, r.title), r.sub ? h('small', {}, r.sub) : null),
        h('span', { class: 'zr-hint' }, i === sel ? 'Enter ↵' : ''));
      el.dataset.i = i;
      list.append(el);
    });
    if (!rows.length && input.value.trim()) list.append(h('div', { class: 'zest-empty' }, 'Nothing found. Try another word.'));
  };
  const paint = () => list.querySelectorAll('.zest-row').forEach(el => { const on = +el.dataset.i === sel; el.classList.toggle('sel', on); el.querySelector('.zr-hint').textContent = on ? 'Enter ↵' : ''; if (on) el.scrollIntoView({ block: 'nearest' }); });
  const runRow = i => { const r = rows[i]; if (!r) return; closeZest(); sfx('pop'); setTimeout(() => r.run(), 40); };
  const update = async () => {
    const q = input.value.trim(), id = ++reqId;
    const out = [];
    const val = calc(q);
    if (val != null) out.push({ group: 'Answer', title: `= ${val.toLocaleString()}`, sub: 'Enter copies it', icon: 'calc', color: '#ffd166', run: () => { navigator.clipboard?.writeText(String(val)); notify({ title: `Copied ${val}`, icon: 'copy' }); } });
    const appRows = Object.values(apps).map(a => ({ s: q ? Math.max(score(a.name, q), score(a.blurb || '', q) - 30) : 1, group: 'Apps', title: a.name, sub: a.blurb, icon: a.icon, grad: a.grad, run: () => launch(a.id) })).filter(r => r.s >= 0).sort((a, b) => b.s - a.s);
    const placeRows = q ? PLACES.map(([l, p, ic]) => ({ s: score(l, q), group: 'Places', title: l, sub: 'folder', path: p, icon: ic, color: '#ffb347', run: () => launch('files', { path: p }) })).filter(r => r.s >= 50) : [];
    const actRows = q ? actions().map(a => ({ ...a, s: Math.max(score(a.title, q), ...a.keys.split(' ').map(k => score(k, q) - 5)), group: 'Actions' })).filter(r => r.s >= 40).sort((a, b) => b.s - a.s).slice(0, 5) : [];
    out.push(...(q ? appRows.slice(0, 4) : appRows), ...placeRows, ...actRows);
    if (!q) {
      try {
        const rec = await api.get('recent', { n: 5 });
        if (id !== reqId) return;
        out.push(...rec.items.map(it => ({ group: 'Recent', title: it.name, sub: dirname(it.path), icon: KIND[kindOf(it.name)].icon, color: KIND[kindOf(it.name)].color, run: () => openItem(it) })));
      } catch { /* ignore */ }
    }
    rows = out; sel = 0; render();
    if (q) {
      try {
        const res = await api.get('search', { q });
        if (id !== reqId) return;
        const shown = new Set(placeRows.map(r => r.path));
        let pcRows = [];
        try { pcRows = (await hostApps()).apps.map(a => ({ s: score(a.name, q), group: 'On this computer', title: a.name, sub: `${a.group} · opens outside the box`, icon: 'laptop', grad: 'linear-gradient(135deg,#80deea,#3949ab)', run: () => openHostApp(a) })).filter(r => r.s >= 50).sort((a, b) => b.s - a.s).slice(0, 4); } catch { /* no app list */ }
        if (id !== reqId) return;
        rows = [...out, ...pcRows, ...res.items.filter(it => !shown.has(it.path)).slice(0, 12).map(it => { const k = kindOf(it.name, it.dir); return { group: 'In your box', title: it.name, sub: it.dir ? it.path : dirname(it.path) + ' · ' + fmtSize(it.size), icon: KIND[k].icon, color: KIND[k].color, run: () => openItem(it) }; })];
        render();
      } catch { /* ignore */ }
    }
  };
  const deb = debounce(update, 90);
  input.addEventListener('input', deb);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeZest(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(rows.length - 1, sel + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); runRow(sel); }
    e.stopPropagation();
  });
  zest = { scrim, card, input };
  input.value = prefill;
  input.focus();
  update();
}
function closeZest() {
  if (!zest) return;
  const z = zest;
  zest = null;
  anim(z.card, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-20px) scale(.97)', opacity: 0 }], { duration: 150, easing: EASE.in });
  anim(z.scrim, [{ opacity: 1 }, { opacity: 0 }], 170).then(() => z.scrim.remove());
  setTimeout(() => z.scrim.remove(), 400);
}

async function newNoteOnDesk() {
  const name = `Note ${new Date().toLocaleDateString([], { day: 'numeric', month: 'short' })} ${timeStr().replace(':', '.')}.md`;
  const path = `/Documents/${name}`;
  try { await api.post('write', { path, text: '' }); launch('code', { path }); } catch (e) { fail(e); }
}
function nextWall() {
  const i = WALLS.indexOf(state.settings.wallpaper);
  document.body.classList.add('wall-swap');
  setTimeout(() => { setSetting({ wallpaper: WALLS[(i + 1) % WALLS.length] }); setTimeout(() => document.body.classList.remove('wall-swap'), 60); }, 260);
  sfx('pop');
}

// ================================================================ drop anywhere to encrypt
function setupDrop() {
  const d = $('#drop');
  d.replaceChildren(h('div', { class: 'drop-card' }, h('div', { class: 'drop-orb', html: logo(90) }), h('b', {}, 'Drop to encrypt'), h('span', {}, 'Files land in your Inbox, sealed with AES-256')));
  let depth = 0;
  const isFiles = e => [...(e.dataTransfer?.types || [])].includes('Files') && ![...e.dataTransfer.types].includes('application/x-orange');
  const overFiles = e => e.target.closest?.('.win[data-app="files"], .win[data-app="trash"]');
  const show = on => { if (on === !d.hidden) return; d.hidden = !on; if (on) anim(d.firstChild, [{ transform: 'scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: EASE.spring }); };
  document.addEventListener('dragenter', e => { if (isFiles(e)) depth++; }, true);
  document.addEventListener('dragleave', e => { if (isFiles(e) && --depth <= 0) { depth = 0; show(false); } }, true);
  document.addEventListener('dragover', e => {
    if (!isFiles(e)) return;
    if (overFiles(e)) { show(false); return; }
    e.preventDefault();
    show(true);
  }, true);
  document.addEventListener('drop', async e => {
    depth = 0;
    show(false);
    if (!isFiles(e) || overFiles(e)) return;
    e.preventDefault();
    const list = await collect(e.dataTransfer);
    if (!list.length) return;
    await uploadAll(list, '/Inbox');
    notify({ title: 'Safe in your Inbox', body: `${list.length} item${list.length === 1 ? '' : 's'}`, icon: 'inbox', tone: 'good', action: { label: 'Open', run: () => launch('files', { path: '/Inbox' }) } });
  }, false);
}

// ================================================================ lock / unlock / shut down
async function lock(reason = '') {
  if (state.locked) return;
  state.locked = true;
  for (const w of wins.values()) { try { await w.onLock?.(); } catch { /* ignore */ } }
  state.settings.session = serialize();
  try { await api.post('settings', state.settings); } catch { /* ignore */ }
  closeRadial(true); closeZest(); toggleToday(false); peek(false);
  if (inOverview()) toggleOverview(false);
  for (const w of [...wins.values()]) { w.el.remove(); w.destroy?.(); wins.delete(w.id); }
  focusTop();
  try { await api.post('lock'); } catch { /* already locked */ }
  sfx('lock');
  showLock(reason);
}

function showLock(reason) {
  state.locked = true;
  document.body.classList.add('locked');
  const L = $('#lock');
  const pw = h('input', { class: 'lock-in', type: 'password', placeholder: 'Password', autocomplete: 'off', 'aria-label': 'Password' });
  const msg = h('div', { class: 'lock-msg' }, reason === 'idle' ? 'Locked because you were away. Your key was wiped from memory.' : 'Locked. Your key was wiped from memory.');
  const go = h('button', { class: 'lock-go', 'aria-label': 'Unlock', html: icon('right', 20) });
  const clock = bigTime('lock-time');
  const tick = setInterval(() => updateBig(clock), 10000);
  const form = h('form', { class: 'lock-form', onsubmit: async e => {
    e.preventDefault();
    if (!pw.value) return;
    form.classList.add('busy');
    try {
      await api.post('unlock', { password: pw.value });
      clearInterval(tick);
      await unlocked();
    } catch (err) {
      form.classList.remove('busy');
      sfx('error');
      msg.textContent = err.message === 'wrong password' ? 'That’s not it. Try again.' : err.message;
      msg.classList.add('bad');
      anim(form, [{ transform: 'translateX(0)' }, { transform: 'translateX(-14px)' }, { transform: 'translateX(12px)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 420 });
      pw.select();
    }
  } }, pw, go);
  L.replaceChildren(h('div', { class: 'lock-in-wrap' },
    h('div', { class: 'lock-mark', html: logo(64) }), clock, h('div', { class: 'lock-date' }, dateStr()),
    h('div', { class: 'lock-user' }, h('span', { class: 'avatar big' }, state.name.slice(0, 1).toUpperCase()), h('b', {}, state.name)),
    form, msg),
    h('button', { class: 'lock-off', onclick: shutdown }, ico('power', 16), 'Shut down'));
  L.hidden = false;
  anim(L, [{ opacity: 0 }, { opacity: 1 }], 380);
  anim(L.firstChild, [{ transform: 'translateY(30px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: EASE.spring });
  setTimeout(() => pw.focus(), 80);
}

async function unlocked() {
  state.locked = false;
  sfx('unlock');
  const L = $('#lock');
  await anim(L, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-40px) scale(1.04)' }], { duration: 420, easing: EASE.in });
  L.hidden = true;
  L.replaceChildren();
  document.body.classList.remove('locked');
  if (!settingsLoaded) { await loadSettings(); settingsLoaded = true; }
  await restoreSession();
  renderGreet(); renderRail(); pipIdle();
  lastActive = Date.now();
}

async function shutdown() {
  for (const w of wins.values()) { try { await w.onLock?.(); } catch { /* ignore */ } }
  if (!state.locked) state.settings.session = serialize();
  await wait(120);
  document.body.classList.add('shutting');
  const b = $('#boot');
  b.replaceChildren(h('div', { class: 'boot-in' }, h('div', { class: 'boot-mark off', html: logo(110) }), h('div', { class: 'boot-line' }, 'Locking and shutting down…')));
  b.classList.add('run');
  sfx('lock');
  try { if (!state.locked) await api.post('settings', state.settings); } catch { /* ignore */ }
  try { await api.post('shutdown'); } catch { /* ignore */ }
  await wait(900);
  window.close();
  setTimeout(() => b.querySelector('.boot-line').textContent = 'Orange is locked. You can close this window.', 400);
}

// ================================================================ session memory
function serialize() { return [...wins.values()].sort((a, b) => a.el.style.zIndex - b.el.style.zIndex).map(w => w.serialize()); }
const saveSession = debounce(() => { if (!state.locked) setSetting({ session: serialize() }); }, 800);
async function restoreSession() {
  const list = (state.settings.session || []).slice(-8);
  for (const s of list) {
    if (!apps[s.app]) continue;
    const w = await launch(s.app, { ...s.args, _rect: s.r ? { x: s.r.x, y: s.r.y, w: s.r.w, h: s.r.h } : undefined });
    if (!w) continue;
    if (s.max) setTimeout(() => w.toggleFill(), 380);
    if (s.min) setTimeout(() => w.minimize(), 500);
  }
}

// ================================================================ welcome tour
async function startTour() {
  closeZest(); toggleToday(false);
  let files = [...wins.values()].find(w => w.app.id === 'files');
  if (!files) { files = await launch('files', { path: '/' }); await wait(600); }
  else { files.state === 'min' ? await files.restore() : files.focus(); }
  const steps = [
    { title: `Welcome to Orange, ${state.name}`, body: 'This is a computer inside your computer. Everything here is encrypted. Here’s how it’s different, in about 30 seconds.', target: null },
    { title: 'Controls live at the bottom', body: 'Sink, Fill and Close sit on each window’s Base bar, next to the window’s status, so the top is left for content. Drag the Base bar (or any toolbar) to move the window.', target: () => files.base },
    { title: 'Four corners, four jobs', body: 'Bottom-left: Apps. Top-left: Overview. Top-right: Today. Bottom-right: Peek. Corners are the easiest targets on a screen. Throw the pointer there.', target: () => $('.c-bl'), pad: 30 },
    { title: 'Your rail', body: 'Apps you keep and apps that are open. Dots show open windows. Right-click an icon for more.', target: () => $('#rail') },
    { title: 'The Pip talks to you', body: 'Messages, progress and Undo appear here, where your eyes already go. Click it to open Today.', target: () => $('#pip'), pad: 10 },
    { title: 'Right-click = Segments', body: 'Choices open all around your pointer, like an orange slice. Move toward one and click. You don’t even need to land on it.', target: null, demo: true },
    { title: 'Just type', body: 'No search box to find first. Start typing anywhere on the desktop to find apps, files and actions, or do maths. Drop files anywhere to encrypt them.', target: null, last: true },
  ];
  const ov = h('div', { class: 'tour' });
  const hole = h('div', { class: 'tour-hole' });
  const card = h('div', { class: 'tour-card' });
  ov.append(hole, card);
  $('#layer').append(ov);
  let i = 0;
  const end = () => { ov.remove(); removeEventListener('keydown', key, true); setSetting({ tourDone: true }); sfx('ok'); closeRadial(true); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); } else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); next(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); next(-1); } };
  addEventListener('keydown', key, true);
  function next(d) { i += d; if (i < 0) i = 0; if (i >= steps.length) return end(); show(); }
  function show() {
    const s = steps[i];
    closeRadial(true);
    const el = s.target && s.target();
    const pad = s.pad ?? 8;
    if (el) {
      const r = el.getBoundingClientRect();
      Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px', borderRadius: '18px', opacity: 1 });
    } else Object.assign(hole.style, { left: innerWidth / 2 + 'px', top: innerHeight / 2 + 'px', width: '0px', height: '0px', opacity: 1 });
    card.replaceChildren(
      h('div', { class: 'tour-step' }, steps.map((_, k) => h('i', { class: k === i ? 'on' : k < i ? 'done' : '' }))),
      h('b', {}, s.title), h('p', {}, s.body),
      h('div', { class: 'tour-acts' }, h('button', { class: 'btn ghost', onclick: end }, 'Skip'), h('div', { class: 'grow' }),
        i ? h('button', { class: 'btn', onclick: () => next(-1) }, 'Back') : null,
        h('button', { class: 'btn primary', onclick: () => next(1) }, s.last ? 'Start using Orange' : 'Next')));
    // place the card near the target, but always on screen
    const r = el ? el.getBoundingClientRect() : null;
    let x = innerWidth / 2 - 190, y = innerHeight / 2 - 110;
    if (s.demo) { y = innerHeight / 2 + 170; }
    if (r) {
      x = clamp(r.left + r.width / 2 - 190, 110, innerWidth - 400);
      y = r.top > innerHeight / 2 ? r.top - 250 : r.bottom + 24;
      if (el.id === 'rail') { x = r.right + 30; y = clamp(r.top + r.height / 2 - 100, 20, innerHeight - 260); }
    }
    Object.assign(card.style, { left: x + 'px', top: clamp(y, 16, innerHeight - 250) + 'px' });
    anim(card, [{ transform: 'translateY(12px) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: EASE.spring });
    if (s.demo) setTimeout(() => radial({ x: innerWidth / 2, y: innerHeight / 2 - 40, title: 'Segments', items: [
      { label: 'Files', icon: 'folder', run() {} }, { label: 'New note', short: 'Note', icon: 'note', run() {} }, { label: 'Add files', short: 'Add', icon: 'upload', run() {} },
      { label: 'Search', icon: 'search', run() {} }, { label: 'Overview', icon: 'overview', run() {} }, { label: 'Wallpaper', icon: 'wallpaper', run() {} },
      { label: 'Terminal', icon: 'terminal', run() {} }, { label: 'Lock', icon: 'lock', run() {} },
    ] }), 250);
    sfx('tick');
  }
  show();
}

function showKeys() {
  const scrim = h('div', { class: 'scrim', onclick: () => close() });
  const card = h('div', { class: 'sheet keys-sheet' }, h('div', { class: 'sheet-head' }, h('span', { class: 'sheet-mark', html: icon('keyboard', 20) }), h('b', {}, 'Shortcuts')),
    h('div', { class: 'keys' }, SHORTCUTS.map(([k, d]) => h('div', { class: 'key-row' }, h('span', {}, ...k.split(' ').map(p => (p === '+' || p === '/' || p === '…' ? ` ${p} ` : h('kbd', {}, p)))), h('small', {}, d)))),
    h('div', { class: 'sheet-actions' }, h('button', { class: 'btn primary', onclick: () => close() }, 'Got it')));
  const close = () => { scrim.remove(); card.remove(); removeEventListener('keydown', k, true); };
  const k = e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === '?') { e.preventDefault(); e.stopPropagation(); close(); } };
  addEventListener('keydown', k, true);
  $('#layer').append(scrim, card);
  anim(card, [{ transform: 'translateY(-30px) scale(.95)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EASE.spring });
}

// ================================================================ global input
let lastActive = Date.now();
function setupInput() {
  const bump = () => (lastActive = Date.now());
  ['pointermove', 'keydown', 'wheel', 'pointerdown'].forEach(t => addEventListener(t, bump, { passive: true, capture: true }));
  setInterval(() => {
    const m = +state.settings.autolock || 0;
    const playing = [...document.querySelectorAll('video,audio')].some(v => !v.paused);
    if (m && !state.locked && !playing && Date.now() - lastActive > m * 60000) lock('idle');
  }, 10000);
  setInterval(() => api.post('heartbeat').catch(() => {}), 20000);

  // system shortcuts: handled first (capture phase), like an operating system would
  addEventListener('keydown', e => {
    if (state.locked || radialOpen()) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey, w = active;
    const take = () => { e.preventDefault(); e.stopPropagation(); };
    if (mod && !e.altKey && k.toLowerCase() === 'k') { take(); return openZest(''); }
    if (mod && !e.altKey && k.toLowerCase() === 'l' && !document.activeElement?.closest('.term-wrap')) { take(); return lock(); }
    if (mod && k === 'ArrowUp') { take(); return toggleOverview(); }
    if (k === 'F5' || (mod && k.toLowerCase() === 'r') || (mod && k.toLowerCase() === 'p')) { take(); return; }
    if (!e.altKey || mod) return;
    const lower = k.toLowerCase();
    if (lower === 'q' && w) { take(); return w.close(); }
    if (lower === 'm' && w) { take(); return w.minimize(); }
    if (k === 'Enter' && w) { take(); return w.toggleFill(); }
    if (e.shiftKey && w && k.startsWith('Arrow')) {
      take();
      if (k === 'ArrowLeft') return w.snap('left');
      if (k === 'ArrowRight') return w.snap('right');
      if (k === 'ArrowDown') return w.state === 'normal' ? w.minimize() : w.toggleFill();
      if (k === 'ArrowUp') return w.state !== 'max' && w.toggleFill();
    }
    if (k === '`') {
      take();
      const list = [...wins.values()].sort((a, b) => a.el.style.zIndex - b.el.style.zIndex);
      if (list.length) { const nx = list[0]; nx.state === 'min' ? nx.restore() : nx.focus(); }
      return;
    }
    if (/^[1-9]$/.test(k)) {
      take();
      const ids = (state.settings.pinned || []).filter(id => apps[id]);
      const id = ids[+k - 1];
      if (id) railClick(id, $(`#rail [data-app="${id}"]`));
    }
  }, true);

  addEventListener('keydown', e => {
    if (state.locked || radialOpen() || e.defaultPrevented) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey, w = active;
    if (e.altKey && k.startsWith('Arrow')) e.preventDefault();   // never let the browser go "back"
    if (k === 'Escape') {
      if (inOverview()) return toggleOverview(false);
      if (todayOpen) return toggleToday(false);
      if (document.body.classList.contains('peek')) return peek(false);
    }
    if (typing() || mod || e.altKey) return;
    if (k === '?' ) { e.preventDefault(); return showKeys(); }
    // type anywhere: when no window has focus, letters go straight into search
    if (!w && k.length === 1 && k !== ' ') { e.preventDefault(); openZest(k); }
  });

  addEventListener('contextmenu', e => {
    if (e.defaultPrevented) return;                                              // an app already showed its own Segments
    if (e.target.closest('input,textarea,[contenteditable],.ed-ta')) return;   // keep copy/paste there
    e.preventDefault();
    if (state.locked) return;
    const winEl = e.target.closest('.win');
    if (winEl) {
      const w = [...wins.values()].find(x => x.el === winEl);
      if (!w) return;
      return radial({ x: e.clientX, y: e.clientY, title: w.title, items: [
        { label: 'Sink', icon: 'sink', hint: 'Alt+M', run: () => w.minimize() },
        { label: w.state === 'max' ? 'Unfill' : 'Fill', icon: w.state === 'max' ? 'unfill' : 'fill', hint: 'Alt+Enter', run: () => w.toggleFill() },
        { label: 'Snap left', short: 'Left', icon: 'left', run: () => w.snap('left') },
        { label: 'Snap right', short: 'Right', icon: 'right', run: () => w.snap('right') },
        { label: 'New window', short: 'New', icon: 'plus', run: () => launch(w.app.id), disabled: w.app.single },
        { label: 'Overview', icon: 'overview', run: () => toggleOverview(true) },
        { label: 'Close', icon: 'x', hint: 'Alt+Q', danger: true, run: () => w.close() },
      ] });
    }
    if (e.target.closest('#rail, #pip, #today, .corner')) return;
    radial({ x: e.clientX, y: e.clientY, title: 'Orange', items: [
      { label: 'Files', icon: 'folder', hint: 'your box', run: () => launch('files') },
      { label: 'New note', short: 'Note', icon: 'note', hint: 'in Documents', run: newNoteOnDesk },
      { label: 'Add files', short: 'Add', icon: 'upload', hint: 'into Inbox', run: async () => { const l = await pick(); l.length && uploadAll(l, '/Inbox'); } },
      { label: 'Search', icon: 'search', hint: 'or just type', run: () => openZest('') },
      { label: 'Overview', icon: 'overview', hint: 'Ctrl+↑', run: () => toggleOverview(true) },
      { label: 'Next wallpaper', short: 'Wallpaper', icon: 'wallpaper', run: nextWall },
      { label: 'Terminal', icon: 'terminal', run: () => launch('terminal') },
      { label: 'Lock', icon: 'lock', hint: 'Ctrl+L', run: () => lock() },
    ] });
  });

  // overview: click a window to go to it; click anywhere else to leave
  addEventListener('pointerdown', e => {
    if (inOverview()) {
      e.preventDefault(); e.stopPropagation();
      const el = e.target.closest('.win');
      const w = el && [...wins.values()].find(x => x.el === el);
      toggleOverview(false);
      if (w) setTimeout(() => (w.state === 'min' ? w.restore() : w.focus()), 60);
      return;
    }
    if (e.button === 0 && document.body.classList.contains('peek') && !e.target.closest('.corner, .rad, #layer')) { peek(false); }
    if (todayOpen && !e.target.closest('#today, #pip')) toggleToday(false);
  }, true);

  // clicking the empty desktop means "no window": typing now searches
  $('#desktop').addEventListener('pointerdown', e => {
    if (e.target.closest('.win, button, a, input')) return;
    clearActive();
    document.activeElement?.blur?.();
  });
  addEventListener('resize', debounce(() => { for (const w of wins.values()) if (w.state === 'max') w.morph(workArea()); }, 120));
  addEventListener('orange:locked', () => {
    if (state.locked) return;
    for (const w of [...wins.values()]) { w.el.remove(); w.destroy?.(); wins.delete(w.id); }
    focusTop();
    showLock('');
  });
}

// ================================================================ start
let settingsLoaded = false;
export async function start(locked) {
  renderCorners();
  setupDrop();
  setupInput();
  on('wm', d => { renderRail(); if (d.type !== 'focus') saveSession(); });
  on('notify', n => { pipQ.push(n); pipRun(); });
  on('progress', p => { if (p.end) { prog = null; if (!pipBusy) pipIdle(); return; } prog = p; if (!pipBusy) pipProgress(p); });
  on('changed', () => refreshGreet());
  on('settings', p => { if ('pinned' in p) renderRail(); });
  on('lock', () => lock());
  on('tour', () => startTour());
  on('keys', () => showKeys());
  setInterval(() => {
    const t = timeStr();
    const pt = $('.pip-time'); if (pt && pt.textContent !== t) pt.textContent = t;
    updateBig($('.g-time')); updateBig($('.td-time')); updateBig($('.lock-time'));
    const gd = $('.g-date'); if (gd) gd.textContent = dateStr();
  }, 5000);
  renderRail();
  pipIdle();
  if (locked) {
    document.body.classList.add('booted');
    showLock('');
    return;
  }
  settingsLoaded = true;
  await renderGreet();
  await bootSequence();
  pipIdle();
  await restoreSession();
  if (!state.settings.tourDone) setTimeout(startTour, 500);
}
