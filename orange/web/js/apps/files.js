// Files: browse, organise, preview and move things in and out of the box.
import { api } from '../api.js';
import {
  h, icon, ico, state, setSetting, bus, emit, notify, fail, ask, sfx, anim, EASE, fmtSize, fmtWhen,
  kindOf, KIND, isTextKind, basename, dirname, join, debounce, logo,
} from '../core.js';
import { register, launch } from '../registry.js';
import { radial } from '../radial.js';
import { collect, pick, uploadAll } from '../transfer.js';

const TRASH = '/.trash';
export const PLACES = [
  ['Home', '/', 'home'], ['Inbox', '/Inbox', 'inbox'], ['Documents', '/Documents', 'documents'],
  ['Projects', '/Projects', 'projects'], ['Pictures', '/Pictures', 'pictures'], ['Downloads', '/Downloads', 'downloads'],
];
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', pdf: 'application/pdf', mp4: 'video/mp4', mp3: 'audio/mpeg' };

// ---------------------------------------------------------------- shared actions (also used by search & desktop)
export function openItem(item, origin) {
  if (item.dir) return launch('files', { path: item.path }, origin);
  const k = kindOf(item.name, false);
  if (isTextKind(k)) return launch('code', { path: item.path }, origin);
  return launch('lens', { path: item.path }, origin);
}

export async function trashPaths(paths) {
  if (!paths.length) return;
  try {
    const res = await api.post('trash', { paths });
    sfx('close');
    emit('changed', { path: '*' });
    notify({
      title: paths.length > 1 ? `${paths.length} items moved to Trash` : `“${basename(paths[0])}” moved to Trash`,
      icon: 'trash', action: {
        label: 'Undo', run: async () => {
          await api.post('restore', { paths: res.items });
          emit('changed', { path: '*' });
          notify({ title: 'Restored', icon: 'restore', tone: 'good' });
        },
      },
    });
  } catch (e) { fail(e); }
}

export function download(items) {
  const files = items.filter(i => !i.dir);
  if (files.length < items.length) notify({ title: 'Folders can’t be exported in one go yet', body: 'Open the folder and select the files inside.', icon: 'info' });
  files.forEach((it, i) => setTimeout(() => {
    const a = h('a', { href: api.fileUrl(it.path, { dl: true }), download: it.name });
    document.body.append(a); a.click(); a.remove();
  }, i * 250));
  if (files.length) notify({ title: `Exporting ${files.length} file${files.length > 1 ? 's' : ''}`, body: 'Decrypted copies go to your computer’s Downloads folder.', icon: 'download' });
}

async function chooseFolder(title) {
  const { dirs } = await api.get('dirs');
  return new Promise(resolve => {
    let chosen = null;
    const list = h('div', { class: 'pick-list' }, dirs.map(d => h('button', {
      class: 'pick-row', style: { paddingLeft: 12 + (d.split('/').length - 2) * 16 + 'px' },
      onclick: e => { list.querySelectorAll('.on').forEach(x => x.classList.remove('on')); e.currentTarget.classList.add('on'); chosen = d; },
      ondblclick: () => { chosen = d; okBtnClick(); },
    }, ico(d === '/' ? 'home' : 'folder', 16), h('span', {}, d === '/' ? 'Home' : basename(d)))));
    let okBtnClick = () => {};
    ask({ title, body: 'Pick where it should go.', ok: 'Move here', extra: list }).then(v => resolve(v ? chosen : null));
    okBtnClick = () => document.querySelector('.sheet .btn.primary')?.click();
  });
}

function infoSheet(it) {
  const k = kindOf(it.name, it.dir);
  const rows = [['Kind', KIND[k].label], ['Size', it.dir ? `${it.count ?? 0} items` : fmtSize(it.size)],
    ['Where', it.from || dirname(it.path)], ['Changed', fmtWhen(it.mtime) || '—'], ['Protection', 'AES-256-GCM · only you can read it']];
  ask({ title: it.name, ok: 'Close', cancel: 'Open', extra: h('dl', { class: 'info-dl' }, rows.map(([a, b]) => [h('dt', {}, a), h('dd', {}, b)])) })
    .then(v => v === null && openItem(it));
}

// ---------------------------------------------------------------- the Files window
function mount(win, args) {
  const S = { path: args.path || '/', back: [], fwd: [], items: [], sel: new Set(), view: state.settings.view || 'grid', filter: '', anchor: null };
  const isTrash = () => S.path === TRASH;
  const navBtn = (i, title, fn) => h('button', { class: 'tbtn', title, 'aria-label': title, html: icon(i), onclick: fn });

  const crumbs = h('nav', { class: 'crumbs', 'aria-label': 'Location' });
  const filterIn = h('input', { class: 'search-in', placeholder: 'Filter this folder', spellcheck: 'false', 'aria-label': 'Filter' });
  filterIn.oninput = () => { S.filter = filterIn.value.toLowerCase(); render(false); };
  const viewBtn = navBtn(S.view === 'grid' ? 'list' : 'grid', 'Grid or list', () => {
    S.view = S.view === 'grid' ? 'list' : 'grid';
    setSetting({ view: S.view });
    viewBtn.innerHTML = icon(S.view === 'grid' ? 'list' : 'grid');
    render(true);
  });
  const actions = h('div', { class: 'tb-actions' });
  const tb = h('header', { class: 'tb', 'data-drag': '' },
    navBtn('left', 'Back (Alt+←)', back), navBtn('right', 'Forward (Alt+→)', forward), navBtn('up', 'Up one folder (Alt+↑)', up),
    crumbs, h('div', { class: 'grow' }), filterIn, viewBtn, actions);
  const places = h('aside', { class: 'places' });
  const itemsEl = h('section', { class: 'items', tabindex: '0', 'aria-label': 'Files' });
  const dropHint = h('div', { class: 'drop-hint' }, h('div', { class: 'drop-ring', html: icon('shield', 34) }), h('b', {}, 'Drop to encrypt'), h('span', { class: 'drop-where' }, ''));
  const main = h('div', { class: 'files-main' }, itemsEl, dropHint);
  win.body.append(h('div', { class: 'files' }, tb, h('div', { class: 'files-split' }, places, main)));
  win.getArgs = () => ({ path: S.path });

  function renderActions() {
    actions.replaceChildren(...(isTrash()
      ? [h('button', { class: 'tbtn danger-t', onclick: emptyTrash }, ico('trash', 16), h('span', {}, 'Empty Trash'))]
      : [navBtn('newfolder', 'New folder (Ctrl+Shift+N)', newFolder), navBtn('note', 'New note', newNote),
        h('button', { class: 'tbtn primary', title: 'Add files from this computer', onclick: e => addMenu(e) }, ico('upload', 16), h('span', {}, 'Add'))]));
  }

  // ---- navigation ----
  async function go(path, push = true, keepSel = false) {
    try {
      const data = await api.get('list', { path });
      if (push && data.path !== S.path) { S.back.push(S.path); S.fwd = []; }
      const changed = data.path !== S.path;
      S.path = data.path;
      S.items = data.items;
      if (!keepSel) S.sel.clear(); else S.sel = new Set([...S.sel].filter(p => S.items.some(i => i.path === p)));
      if (changed) { S.filter = ''; filterIn.value = ''; }
      win.setTitle(S.path === '/' ? 'Home' : isTrash() ? 'Trash' : basename(S.path));
      renderCrumbs(); renderPlaces(); renderActions(); render(changed || !keepSel);
    } catch (e) {
      if (push) fail(e); else if (S.path !== '/') go('/', false);
    }
  }
  const refresh = () => go(S.path, false, true);
  function back() { if (S.back.length) { S.fwd.push(S.path); go(S.back.pop(), false); } }
  function forward() { if (S.fwd.length) { S.back.push(S.path); go(S.fwd.pop(), false); } }
  function up() { if (S.path !== '/') go(isTrash() ? '/' : dirname(S.path)); }

  function renderCrumbs() {
    const parts = isTrash() ? [['Trash', TRASH]] : [['Home', '/'], ...S.path.split('/').filter(Boolean).map((p, i, a) => [p, '/' + a.slice(0, i + 1).join('/')])];
    crumbs.replaceChildren(...parts.flatMap(([label, path], i) => [
      ...(i ? [h('span', { class: 'crumb-sep', html: icon('right', 12) })] : []),
      h('button', { class: 'crumb' + (i === parts.length - 1 ? ' on' : ''), dataset: { path }, onclick: () => go(path) }, label),
    ]));
  }

  async function renderPlaces() {
    places.replaceChildren(
      h('div', { class: 'places-h' }, 'Places'),
      ...PLACES.map(([label, path, ic]) => h('button', { class: 'place' + (S.path === path ? ' on' : ''), dataset: { path }, onclick: () => go(path) }, ico(ic, 17), h('span', {}, label))),
      h('div', { class: 'places-sep' }),
      h('button', { class: 'place' + (isTrash() ? ' on' : ''), dataset: { path: TRASH }, onclick: () => go(TRASH) }, ico('trash', 17), h('span', {}, 'Trash')),
      h('div', { class: 'grow' }),
      h('div', { class: 'vault-card' }, h('span', { html: logo(26) }), h('div', {}, h('b', {}, 'Encrypted'), h('small', { class: 'vault-n' }, '…'))));
    try {
      const st = await api.get('state');
      places.querySelector('.vault-n').textContent = `${st.files} files · ${fmtSize(st.bytes)}`;
    } catch { /* locked */ }
  }

  function emptyState() {
    if (S.filter) return h('div', { class: 'empty' }, ico('search', 40), h('b', {}, 'Nothing matches'), h('span', {}, `No names here contain “${S.filter}”.`));
    if (isTrash()) return h('div', { class: 'empty' }, ico('trash', 44), h('b', {}, 'Trash is empty'), h('span', {}, 'Deleted things wait here, so you can always undo.'));
    return h('div', { class: 'empty' },
      h('div', { class: 'empty-art', html: logo(70, 'spin-slow') }),
      h('b', {}, 'This folder is empty'),
      h('span', {}, 'Drag files or folders here from your computer. They’re encrypted the moment they land.'),
      h('div', { class: 'empty-acts' },
        h('button', { class: 'btn primary', onclick: () => add(false) }, ico('upload', 16), 'Add files'),
        h('button', { class: 'btn', onclick: () => add(true) }, ico('folder', 16), 'Add a folder')));
  }

  function tile(it) {
    const k = kindOf(it.name, it.dir), K = KIND[k], grid = S.view === 'grid';
    const thumb = h('div', { class: `thumb k-${k}`, style: { '--k': K.color } });
    if (k === 'image' && it.size < 30e6 && !isTrash()) {
      const img = h('img', { src: api.fileUrl(it.path, { v: it.mtime }), loading: 'lazy', alt: '', draggable: 'false', decoding: 'async' });
      img.onerror = () => { img.remove(); thumb.innerHTML = icon(K.icon, grid ? 34 : 20); };
      thumb.append(img);
      thumb.classList.add('has-img');
    } else thumb.innerHTML = icon(K.icon, grid ? 34 : 19);
    if (grid && k !== 'folder' && k !== 'image') thumb.append(h('span', { class: 'ext' }, (it.name.split('.').pop() || '').slice(0, 4)));
    const meta = it.dir ? (it.count != null ? `${it.count} item${it.count === 1 ? '' : 's'}` : 'Folder') : fmtSize(it.size);
    const el = h('div', {
      class: 'item' + (S.sel.has(it.path) ? ' sel' : ''), dataset: { path: it.path }, draggable: 'true', role: 'option',
      'aria-selected': S.sel.has(it.path) ? 'true' : 'false', title: it.from ? `${it.name}\nWas in ${dirname(it.from)}` : it.name,
    }, thumb, h('div', { class: 'nm' }, it.name), h('div', { class: 'kd' }, K.label), h('div', { class: 'sz' }, meta), h('div', { class: 'dt' }, fmtWhen(it.mtime)));
    el.item = it;
    return el;
  }

  function visible() { return S.items.filter(i => !S.filter || i.name.toLowerCase().includes(S.filter)); }

  function render(animate) {
    itemsEl.className = `items ${S.view}`;
    const list = visible();
    const frag = document.createDocumentFragment();
    if (!list.length) frag.append(emptyState());
    else {
      if (S.view === 'list') frag.append(h('div', { class: 'lhead' }, h('span'), h('span', {}, 'Name'), h('span', {}, 'Kind'), h('span', {}, 'Size'), h('span', {}, isTrash() ? 'Deleted' : 'Changed')));
      list.forEach((it, i) => {
        const el = tile(it);
        if (animate && i < 48) { el.classList.add('enter'); el.style.animationDelay = `${i * 16}ms`; }
        frag.append(el);
      });
    }
    itemsEl.replaceChildren(frag);
    status();
  }

  function status() {
    const sel = S.items.filter(i => S.sel.has(i.path));
    const size = sel.reduce((s, i) => s + (i.size || 0), 0);
    win.setStatus(h('span', {}, `${S.items.length} item${S.items.length === 1 ? '' : 's'}`,
      sel.length ? h('em', {}, ` · ${sel.length} selected${size ? ` (${fmtSize(size)})` : ''}`) : ''));
  }

  function paintSel() {
    for (const el of itemsEl.querySelectorAll('.item')) {
      const on = S.sel.has(el.dataset.path);
      el.classList.toggle('sel', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    status();
  }
  const selItems = () => S.items.filter(i => S.sel.has(i.path));
  const tileOf = path => [...itemsEl.querySelectorAll('.item')].find(e => e.dataset.path === path);

  // ---- actions ----
  async function newFolder() {
    const name = await ask({ title: 'New folder', value: 'New folder', ok: 'Create' });
    if (!name) return;
    try {
      const r = await api.post('mkdir', { path: join(S.path, name.trim()), unique: true });
      sfx('ok');
      S.sel = new Set([r.path]);
      await go(S.path, false, true);
      const t = tileOf(r.path);
      t && anim(t, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EASE.spring });
    } catch (e) { fail(e); }
  }

  async function newNote() {
    let name = await ask({ title: 'New note', value: 'Note.md', ok: 'Create', selectName: true });
    if (!name) return;
    name = name.trim();
    const names = new Set(S.items.map(i => i.name));
    let final = name, n = 2;
    while (names.has(final)) { const d = name.lastIndexOf('.'); final = d > 0 ? `${name.slice(0, d)} (${n})${name.slice(d)}` : `${name} (${n})`; n++; }
    const path = join(S.path, final);
    try {
      await api.post('write', { path, text: '' });
      await go(S.path, false, true);
      launch('code', { path }, tileOf(path));
    } catch (e) { fail(e); }
  }

  async function add(folder) {
    const list = await pick({ folder });
    if (list.length) { await uploadAll(list, S.path); }
  }
  function addMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    radial({ x: r.left + r.width / 2, y: r.bottom + 10, title: 'Add', items: [
      { label: 'Files', icon: 'upload', hint: 'pick files', run: () => add(false) },
      { label: 'A whole folder', short: 'Folder', icon: 'folder', hint: 'keeps its structure', run: () => add(true) },
      { label: 'New note', short: 'Note', icon: 'note', run: newNote },
      { label: 'New folder', short: 'New folder', icon: 'newfolder', run: newFolder },
    ] });
  }

  function rename(it) {
    const el = tileOf(it.path);
    if (!el) return;
    const nm = el.querySelector('.nm');
    const inp = h('input', { class: 'rename-in', value: it.name, spellcheck: 'false' });
    nm.replaceWith(inp);
    el.draggable = false;
    const dot = it.name.lastIndexOf('.');
    inp.focus();
    it.dir || dot <= 0 ? inp.select() : inp.setSelectionRange(0, dot);
    let done = false;
    const finish = async ok => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (ok && v && v !== it.name) {
        try {
          const r = await api.post('rename', { path: it.path, name: v });
          sfx('ok');
          S.sel = new Set([r.path]);
          emit('changed', { path: S.path });
        } catch (e) { fail(e); }
      }
      refresh();
      itemsEl.focus();
    };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
    inp.onblur = () => finish(true);
  }

  async function trashSel(list = selItems()) {
    if (!list.length) return;
    list.forEach((it, i) => { const t = tileOf(it.path); t && anim(t, [{ transform: 'none', opacity: 1 }, { transform: 'scale(.4) rotate(-8deg)', opacity: 0 }], { duration: 260, delay: i * 20, easing: EASE.in, fill: 'forwards' }); });
    await trashPaths(list.map(i => i.path));
  }

  async function restoreSel(list = selItems()) {
    if (!list.length) return;
    try {
      const r = await api.post('restore', { paths: list.map(i => i.path) });
      sfx('ok');
      notify({ title: `${r.items.length} item${r.items.length === 1 ? '' : 's'} restored`, icon: 'restore', tone: 'good' });
      emit('changed', { path: '*' });
    } catch (e) { fail(e); }
  }

  async function deleteForever(list = selItems()) {
    if (!list.length) return;
    const ok = await ask({ title: 'Delete forever?', body: `${list.length === 1 ? `“${list[0].name}”` : `${list.length} items`} will be destroyed. This one can’t be undone.`, ok: 'Delete forever', danger: true });
    if (!ok) return;
    try { await api.post('delete', { paths: list.map(i => i.path) }); sfx('close'); emit('changed', { path: '*' }); } catch (e) { fail(e); }
  }

  async function emptyTrash() {
    if (!S.items.length) return notify({ title: 'Trash is already empty', icon: 'trash' });
    const ok = await ask({ title: 'Empty the Trash?', body: `${S.items.length} item${S.items.length === 1 ? '' : 's'} will be destroyed for good.`, ok: 'Empty Trash', danger: true });
    if (!ok) return;
    try { await api.post('emptytrash'); sfx('close'); emit('changed', { path: '*' }); } catch (e) { fail(e); }
  }

  async function moveTo(list = selItems()) {
    if (!list.length) return;
    const dest = await chooseFolder(list.length === 1 ? `Move “${list[0].name}”` : `Move ${list.length} items`);
    if (dest) await moveInto(list.map(i => i.path), dest);
  }

  async function moveInto(paths, dest) {
    paths = paths.filter(p => p !== dest && !dest.startsWith(p + '/') && dirname(p) !== dest);
    if (!paths.length) return;
    try {
      for (const p of paths) await api.post('move', { src: p, dst: dest });
      sfx('drop');
      emit('changed', { path: '*' });
      notify({ title: `Moved ${paths.length} item${paths.length === 1 ? '' : 's'}`, body: `into ${dest === '/' ? 'Home' : basename(dest)}`, icon: 'moveto' });
    } catch (e) { fail(e); }
  }

  async function duplicate(it) {
    try { const r = await api.post('duplicate', { path: it.path }); S.sel = new Set([r.path]); sfx('ok'); refresh(); } catch (e) { fail(e); }
  }

  function setWallpaper(it) {
    setSetting({ wallpaper: 'custom', wallpaperPath: it.path });
    sfx('ok');
    notify({ title: 'New wallpaper', body: it.name, icon: 'wallpaper', tone: 'good' });
  }

  // ---- Segments (right-click) ----
  function itemMenu(ev, it) {
    const k = kindOf(it.name, it.dir), many = S.sel.size > 1;
    if (isTrash()) return radial({ x: ev.clientX, y: ev.clientY, title: many ? `${S.sel.size} items` : it.name, items: [
      { label: 'Restore', icon: 'restore', hint: 'put it back', run: () => restoreSel() },
      { label: 'Delete forever', short: 'Destroy', icon: 'trash', danger: true, run: () => deleteForever() },
      { label: 'Info', icon: 'info', run: () => infoSheet(it), disabled: many },
      { label: 'Empty Trash', short: 'Empty', icon: 'sparkle', run: emptyTrash },
    ] });
    radial({ x: ev.clientX, y: ev.clientY, title: many ? `${S.sel.size} items` : it.name, items: [
      { label: 'Open', icon: 'eye', hint: 'Enter', run: () => (many ? selItems().forEach(i => openItem(i)) : openItem(it, tileOf(it.path))) },
      { label: 'Rename', icon: 'edit', hint: 'F2', run: () => rename(it), disabled: many },
      { label: 'Export', icon: 'download', hint: 'decrypted copy', run: () => download(many ? selItems() : [it]) },
      { label: 'Move to…', short: 'Move', icon: 'moveto', run: () => moveTo() },
      { label: 'Move to Trash', short: 'Trash', icon: 'trash', hint: 'Del · undo anytime', danger: true, run: () => trashSel() },
      k === 'image' && !many ? { label: 'Set as wallpaper', short: 'Wallpaper', icon: 'wallpaper', run: () => setWallpaper(it) }
        : it.dir ? { label: 'Open in new window', short: 'New window', icon: 'overview', run: () => launch('files', { path: it.path }) }
          : { label: 'Duplicate', icon: 'copy', run: () => duplicate(it), disabled: many },
      { label: 'Quick look', short: 'Peek', icon: 'eye', hint: 'Space', run: () => quickLook(it), disabled: it.dir },
      { label: 'Info', icon: 'info', run: () => infoSheet(it), disabled: many },
    ] });
  }
  function spaceMenu(ev) {
    if (isTrash()) return radial({ x: ev.clientX, y: ev.clientY, title: 'Trash', items: [
      { label: 'Empty Trash', short: 'Empty', icon: 'trash', danger: true, run: emptyTrash },
      { label: 'Go Home', short: 'Home', icon: 'home', run: () => go('/') },
    ] });
    radial({ x: ev.clientX, y: ev.clientY, title: S.path === '/' ? 'Home' : basename(S.path), items: [
      { label: 'New folder', short: 'Folder', icon: 'newfolder', hint: 'Ctrl+Shift+N', run: newFolder },
      { label: 'New note', short: 'Note', icon: 'note', run: newNote },
      { label: 'Add files', short: 'Add files', icon: 'upload', run: () => add(false) },
      { label: 'Add a folder', short: 'Add folder', icon: 'folder', run: () => add(true) },
      { label: S.view === 'grid' ? 'List view' : 'Grid view', short: 'View', icon: S.view === 'grid' ? 'list' : 'grid', run: () => viewBtn.click() },
      { label: 'Select all', short: 'Select all', icon: 'select', hint: 'Ctrl+A', run: () => { S.sel = new Set(visible().map(i => i.path)); paintSel(); } },
      { label: 'Open Terminal here', short: 'Terminal', icon: 'terminal', run: () => launch('terminal', { cwd: S.path }) },
      { label: 'Refresh', icon: 'rotate', run: refresh },
    ] });
  }

  // ---- Quick look (Space) ----
  let ql = null;
  function quickLook(it) {
    closeQL();
    if (!it || it.dir) return;
    const k = kindOf(it.name), url = api.fileUrl(it.path, { v: it.mtime });
    let media;
    if (k === 'image') media = h('img', { src: url, alt: it.name });
    else if (k === 'video') media = h('video', { src: url, controls: true, autoplay: true });
    else if (k === 'audio') media = h('div', { class: 'ql-audio' }, h('div', { class: 'disc spin', html: logo(120) }), h('audio', { src: url, controls: true, autoplay: true }));
    else if (k === 'pdf') media = h('iframe', { src: url, title: it.name });
    else if (isTextKind(k) || it.size < 200000) { media = h('pre', { class: 'ql-text' }, 'Loading…'); api.text(it.path).then(t => { media.textContent = t.slice(0, 20000) || '(empty file)'; }).catch(() => { media.textContent = 'No preview.'; }); }
    else media = h('div', { class: 'ql-none' }, ico(KIND[k].icon, 60), h('span', {}, 'No preview for this kind of file'));
    const card = h('div', { class: 'ql-card' }, h('div', { class: 'ql-media' }, media),
      h('div', { class: 'ql-bar' }, h('b', {}, it.name), h('span', {}, `${KIND[k].label} · ${fmtSize(it.size)}`), h('div', { class: 'grow' }),
        h('button', { class: 'btn', onclick: () => { closeQL(); openItem(it, tileOf(it.path)); } }, 'Open'),
        h('button', { class: 'btn ghost', onclick: closeQL }, 'Close · Space')));
    ql = h('div', { class: 'ql', onclick: e => e.target === ql && closeQL() }, card);
    document.getElementById('layer').append(ql);
    const t = tileOf(it.path)?.getBoundingClientRect();
    anim(card, t ? [{ transform: `translate(${t.left + t.width / 2 - innerWidth / 2}px,${t.top + t.height / 2 - innerHeight / 2}px) scale(.15)`, opacity: 0 }, { transform: 'none', opacity: 1 }]
      : [{ transform: 'scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EASE.spring });
    anim(ql, [{ opacity: 0 }, { opacity: 1 }], 200);
    sfx('pop');
  }
  function closeQL() { if (!ql) return; const q = ql; ql = null; anim(q, [{ opacity: 1 }, { opacity: 0 }], 140).then(() => q.remove()); setTimeout(() => q.remove(), 300); }
  win.destroy = () => { closeQL(); off(); };

  // ---- pointer + keyboard ----
  itemsEl.addEventListener('click', e => {
    const el = e.target.closest('.item');
    if (!el) { if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !marqueeMoved) { S.sel.clear(); paintSel(); } return; }
    const p = el.dataset.path;
    if (e.ctrlKey || e.metaKey) { S.sel.has(p) ? S.sel.delete(p) : S.sel.add(p); S.anchor = p; }
    else if (e.shiftKey && S.anchor) {
      const vis = visible().map(i => i.path), a = vis.indexOf(S.anchor), b = vis.indexOf(p);
      S.sel = new Set(vis.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else { S.sel = new Set([p]); S.anchor = p; }
    paintSel();
  });
  itemsEl.addEventListener('dblclick', e => {
    const el = e.target.closest('.item');
    if (!el) return;
    const it = el.item;
    if (isTrash()) return infoSheet(it);
    if (it.dir) go(it.path); else openItem(it, el);
  });
  itemsEl.addEventListener('contextmenu', e => {
    e.preventDefault();
    const el = e.target.closest('.item');
    if (!el) return spaceMenu(e);
    if (!S.sel.has(el.dataset.path)) { S.sel = new Set([el.dataset.path]); S.anchor = el.dataset.path; paintSel(); }
    itemMenu(e, el.item);
  });

  let typed = '', typedT;
  itemsEl.addEventListener('keydown', e => {
    const vis = visible(), cur = vis.findIndex(i => i.path === S.anchor);
    const one = selItems()[0];
    const k = e.key;
    if (k === 'Enter' && one) { e.preventDefault(); one.dir ? go(one.path) : selItems().forEach(i => openItem(i, tileOf(i.path))); }
    else if ((k === 'Delete') && S.sel.size) { e.preventDefault(); isTrash() ? deleteForever() : trashSel(); }
    else if (k === 'F2' && one && !isTrash()) { e.preventDefault(); rename(one); }
    else if (k === ' ' && one) { e.preventDefault(); ql ? closeQL() : quickLook(one); }
    else if (k === 'Escape') { if (ql) closeQL(); else { S.sel.clear(); paintSel(); } }
    else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') { e.preventDefault(); S.sel = new Set(vis.map(i => i.path)); paintSel(); }
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && k.toLowerCase() === 'n') { e.preventDefault(); newFolder(); }
    else if (k === 'Backspace' || (e.altKey && k === 'ArrowLeft')) { e.preventDefault(); back(); }
    else if (e.altKey && k === 'ArrowRight') { e.preventDefault(); forward(); }
    else if (e.altKey && k === 'ArrowUp') { e.preventDefault(); up(); }
    else if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(k) && vis.length) {
      e.preventDefault();
      let cols = 1;
      if (S.view === 'grid') { const tiles = itemsEl.querySelectorAll('.item'); if (tiles.length > 1) { const top = tiles[0].offsetTop; cols = [...tiles].findIndex(t => t.offsetTop !== top); if (cols < 1) cols = tiles.length; } }
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[k];
      let i = k === 'Home' ? 0 : k === 'End' ? vis.length - 1 : cur < 0 ? 0 : Math.max(0, Math.min(vis.length - 1, cur + step));
      S.anchor = vis[i].path;
      if (e.shiftKey && cur >= 0) S.sel.add(S.anchor); else S.sel = new Set([S.anchor]);
      paintSel();
      tileOf(S.anchor)?.scrollIntoView({ block: 'nearest' });
      if (ql) quickLook(vis[i]);
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      typed += k.toLowerCase(); clearTimeout(typedT); typedT = setTimeout(() => (typed = ''), 700);
      const hit = vis.find(i => i.name.toLowerCase().startsWith(typed));
      if (hit) { S.sel = new Set([hit.path]); S.anchor = hit.path; paintSel(); tileOf(hit.path)?.scrollIntoView({ block: 'nearest' }); }
    }
  });

  // marquee (rubber-band) selection on empty space
  let marqueeMoved = false;
  itemsEl.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.item, .empty button, .lhead')) return;
    itemsEl.focus();
    const box = itemsEl.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY + itemsEl.scrollTop;
    const band = h('div', { class: 'marquee' });
    const base = e.ctrlKey || e.metaKey || e.shiftKey ? new Set(S.sel) : new Set();
    marqueeMoved = false;
    const move = ev => {
      if (!marqueeMoved && Math.hypot(ev.clientX - x0, ev.clientY + itemsEl.scrollTop - y0) < 5) return;
      if (!marqueeMoved) { marqueeMoved = true; itemsEl.append(band); }
      const y1 = ev.clientY + itemsEl.scrollTop;
      const L = Math.min(x0, ev.clientX) - box.left, T = Math.min(y0, y1) - box.top, W = Math.abs(ev.clientX - x0), H = Math.abs(y1 - y0);
      Object.assign(band.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: H + 'px' });
      const sel = new Set(base);
      for (const t of itemsEl.querySelectorAll('.item')) {
        const r = t.getBoundingClientRect(), rt = r.top - box.top + itemsEl.scrollTop, rl = r.left - box.left;
        if (rl < L + W && rl + r.width > L && rt < T + H && rt + r.height > T) sel.add(t.dataset.path);
      }
      S.sel = sel; paintSel();
    };
    const upH = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', upH); band.remove(); setTimeout(() => (marqueeMoved = false), 0); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', upH);
  });

  // ---- drag & drop: inside the box, out to the computer, and in from the computer ----
  itemsEl.addEventListener('dragstart', e => {
    const el = e.target.closest('.item');
    if (!el) return;
    if (!S.sel.has(el.dataset.path)) { S.sel = new Set([el.dataset.path]); paintSel(); }
    const paths = [...S.sel];
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/x-orange', JSON.stringify(paths));
    const it = el.item;
    if (paths.length === 1 && !it.dir && !isTrash()) {   // drag a file out onto the real desktop = export
      const ext = it.name.split('.').pop().toLowerCase();
      e.dataTransfer.setData('DownloadURL', `${MIME[ext] || 'application/octet-stream'}:${it.name}:${location.origin}${api.fileUrl(it.path, { dl: true })}`);
    }
    const ghost = h('div', { class: 'drag-ghost' }, ico(KIND[kindOf(it.name, it.dir)].icon, 18), paths.length > 1 ? `${paths.length} items` : it.name);
    document.body.append(ghost);
    e.dataTransfer.setDragImage(ghost, 20, 20);
    setTimeout(() => ghost.remove(), 0);
    itemsEl.classList.add('dragging-out');
  });
  itemsEl.addEventListener('dragend', () => itemsEl.classList.remove('dragging-out'));

  const external = e => [...e.dataTransfer.types].includes('Files') && ![...e.dataTransfer.types].includes('application/x-orange');
  let dropTarget = null;
  const setTarget = el => { if (dropTarget === el) return; dropTarget?.classList.remove('drop'); dropTarget = el; dropTarget?.classList.add('drop'); };
  const folderUnder = e => { const el = e.target.closest?.('.item'); return el && el.item.dir ? el : null; };
  win.body.addEventListener('dragover', e => {
    if (isTrash()) return;
    const ext = external(e), internal = [...e.dataTransfer.types].includes('application/x-orange');
    if (!ext && !internal) return;
    e.preventDefault(); e.stopPropagation();
    const place = e.target.closest?.('.place, .crumb');
    const folder = folderUnder(e);
    setTarget(place || folder);
    e.dataTransfer.dropEffect = ext ? 'copy' : 'move';
    if (ext) {
      main.classList.add('dropping');
      dropHint.querySelector('.drop-where').textContent = 'into ' + (dropTarget ? (dropTarget.item?.name || dropTarget.textContent) : (S.path === '/' ? 'Home' : basename(S.path)));
    }
  });
  win.body.addEventListener('dragleave', e => { if (!win.body.contains(e.relatedTarget)) { main.classList.remove('dropping'); setTarget(null); } });
  win.body.addEventListener('drop', async e => {
    const ext = external(e), raw = e.dataTransfer.getData('application/x-orange');
    if (!ext && !raw) return;
    e.preventDefault(); e.stopPropagation();
    main.classList.remove('dropping');
    const dest = dropTarget ? (dropTarget.dataset.path || dropTarget.item?.path) : S.path;
    setTarget(null);
    if (dest === TRASH) return raw && trashPaths(JSON.parse(raw));
    if (ext) { const list = await collect(e.dataTransfer); await uploadAll(list, dest); }
    else await moveInto(JSON.parse(raw), dest);
  });

  // stay in sync with every other window
  const offFns = [];
  const sync = debounce(d => { if (!d || d.path === '*' || d.path === S.path || dirname(d.path) === S.path || d.path.startsWith(S.path)) refresh(); }, 120);
  const handler = e => sync(e.detail);
  bus.addEventListener('changed', handler);
  offFns.push(() => bus.removeEventListener('changed', handler));
  const off = () => offFns.forEach(f => f());

  win.reopen = a => a.path && go(a.path);
  win.onResize = () => {};
  win.focusMain = () => itemsEl.focus();
  setTimeout(() => itemsEl.focus(), 60);
  return go(S.path, false);
}

register({ id: 'files', name: 'Files', icon: 'folder', color: '#ff8a1f', grad: 'linear-gradient(135deg,#ffc56b,#ff7a00)', size: [960, 600], mount, openItem, blurb: 'Everything in your box' });
register({ id: 'trash', name: 'Trash', icon: 'trash', color: '#bfa38c', grad: 'linear-gradient(135deg,#e7d3bf,#9d8571)', size: [860, 540], mount: (w, a) => mount(w, { ...a, path: TRASH }), blurb: 'Deleted things, ready to restore' });
