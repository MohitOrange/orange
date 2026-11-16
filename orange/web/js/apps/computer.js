// Computer: every app installed on this computer, opened from inside Orange.
// The apps run in their own windows outside the box; Orange only lists them and starts them by id.
import { api } from '../api.js';
import { h, icon, ico, sfx, notify, fail, debounce } from '../core.js';
import { register } from '../registry.js';

let cache = null;
export async function hostApps(refresh) {
  if (!cache || refresh) cache = api.get('hostapps', refresh ? { refresh: 1 } : undefined).catch(e => { cache = null; throw e; });
  return cache;
}
let prefs = null;
async function loadPrefs() { if (!prefs) { try { prefs = await api.get('kv', { key: 'computer' }); } catch { prefs = {}; } prefs.fav ||= []; prefs.recent ||= []; prefs.aside ??= true; } return prefs; }
const savePrefs = debounce(() => api.post('kv', { key: 'computer', value: prefs }).catch(() => {}), 400);

export async function openHostApp(a) {
  const p = await loadPrefs();
  try {
    const r = await api.post('hostlaunch', { id: a.id, step_aside: p.aside });
    p.recent = [a.id, ...p.recent.filter(x => x !== a.id)].slice(0, 10); savePrefs();
    sfx('open'); notify({ title: `Opening ${r.name}`, body: r.stepped_aside ? 'Orange stepped aside. Click Orange in the taskbar to come back.' : 'It opens in its own window.', icon: 'laptop' });
  } catch (e) { fail(e); }
}

const HUES = n => [...n].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 360, 7);
export function appIcon(a, size = 48) {
  const letter = h('span', { class: 'pc-letter', style: { '--h': HUES(a.name), width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.45}px` } }, a.name.trim()[0]?.toUpperCase() || '?');
  const img = h('img', { class: 'pc-img', alt: '', decoding: 'async', width: size, height: size, src: `/api/hosticon?id=${encodeURIComponent(a.id)}` });
  img.onload = () => letter.replaceWith(img);
  return letter;
}

function mount(win) {
  const S = { q: '', group: 'all', list: [], platform: '' };
  const search = h('input', { class: 'search-in pc-search', placeholder: 'Search your apps', spellcheck: 'false', oninput: debounce(e => { S.q = e.target.value.trim().toLowerCase(); paint(); }, 60) });
  const chips = h('div', { class: 'arc-chips' }), grid = h('div', { class: 'pc-grid' }), info = h('div', { class: 'pc-note' });
  const aside = h('label', { class: 'pc-aside', title: 'Minimise Orange when an app opens, so the app is in front' }, h('input', { type: 'checkbox', onchange: e => { prefs.aside = e.target.checked; savePrefs(); } }), h('span', {}, 'Step aside'));
  win.body.append(h('div', { class: 'pc' },
    h('header', { class: 'tb', 'data-drag': '' }, h('span', { class: 'arc-logo pc-logo', html: icon('laptop', 18) }), h('b', {}, 'Computer'), h('div', { class: 'grow' }), aside,
      h('button', { class: 'tbtn', title: 'Look for apps again', 'aria-label': 'Refresh', html: icon('rotate'), onclick: () => load(true) }), search),
    h('div', { class: 'arc-scroll' }, info, chips, grid)));

  function tile(a) {
    const fav = prefs.fav.includes(a.id);
    return h('div', { class: 'pc-tile' },
      h('button', { class: 'pc-open', title: `Open ${a.name}`, onclick: () => openHostApp(a), oncontextmenu: e => { e.preventDefault(); toggleFav(a); } }, appIcon(a), h('b', {}, a.name), h('small', {}, a.group)),
      h('button', { class: 'pc-star' + (fav ? ' on' : ''), title: fav ? 'Remove from favourites' : 'Add to favourites', 'aria-label': 'Favourite', onclick: () => toggleFav(a) }, fav ? '★' : '☆'));
  }
  function toggleFav(a) { prefs.fav = prefs.fav.includes(a.id) ? prefs.fav.filter(x => x !== a.id) : [...prefs.fav, a.id]; savePrefs(); sfx('pop'); paint(); }
  function paint() {
    const groups = [...new Set(S.list.map(a => a.group))].sort();
    const tabs = [['all', 'All', '✨'], ['fav', 'Favourites', '⭐'], ['recent', 'Recent', '🕘'], ...groups.map(g => [g, g, { Internet: '🌐', Office: '📄', Code: '💻', Media: '🎬', Games: '🎮', System: '⚙️', Apps: '📦' }[g] || '📦'])];
    chips.replaceChildren(...tabs.map(([id, label, e]) => h('button', { class: 'arc-chip' + (S.group === id ? ' on' : ''), onclick: () => { S.group = id; paint(); } }, `${e} ${label}`)));
    let list = S.list;
    if (S.group === 'fav') list = list.filter(a => prefs.fav.includes(a.id));
    else if (S.group === 'recent') list = prefs.recent.map(id => S.list.find(a => a.id === id)).filter(Boolean);
    else if (S.group !== 'all') list = list.filter(a => a.group === S.group);
    if (S.q) list = list.filter(a => a.name.toLowerCase().includes(S.q));
    grid.replaceChildren(...(list.length ? list.map(tile) : [h('div', { class: 'pc-empty' }, S.group === 'fav' ? 'Tap ☆ on an app to keep it here.' : S.q ? 'No app with that name.' : 'Nothing here yet.')]));
    win.setStatus(`${S.list.length} apps on this computer`);
  }
  async function load(refresh) {
    grid.replaceChildren(h('div', { class: 'pc-empty' }, h('span', { class: 'spin', html: icon('rotate', 22) }), ' Looking for the apps on this computer…'));
    try {
      await loadPrefs(); aside.querySelector('input').checked = prefs.aside;
      const r = await hostApps(refresh);
      S.list = r.apps; S.platform = r.platform;
      aside.hidden = r.platform !== 'win32';
      info.replaceChildren(ico('info', 16), h('span', {}, 'These apps open in their own windows on your computer, outside the encrypted box. Files you save in them are not encrypted by Orange: keep private things in Files.'));
      if (r.icons === 'loading') { let tries = 0; const poll = () => api.get('hostapps').then(x => { if (x.icons === 'ready') { cache = Promise.resolve(x); paint(); } else if (++tries < 20) setTimeout(poll, 4000); }).catch(() => {}); setTimeout(poll, 4000); }
      paint();
    } catch (e) { grid.replaceChildren(h('div', { class: 'pc-empty' }, 'Could not list the apps: ', e.message)); }
  }
  load();
}

register({ id: 'computer', name: 'Computer', icon: 'laptop', color: '#26a69a', grad: 'linear-gradient(135deg,#80deea,#3949ab)', size: [960, 640], single: true, mount, blurb: 'Open the apps installed on this PC' });
