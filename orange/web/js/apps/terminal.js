// Terminal: a shell that lives *inside* the box. Commands only ever touch the encrypted box.
import { api } from '../api.js';
import { h, state, emit, fmtSize, fmtWhen, kindOf, KIND, basename, dirname, join, setSetting, sfx } from '../core.js';
import { register, launch } from '../registry.js';
import { openItem, trashPaths } from './files.js';

const norm = (p, cwd) => {
  const parts = (p.startsWith('/') ? p : cwd + '/' + p).split('/');
  const out = [];
  for (const s of parts) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
  return '/' + out.join('/');
};
const ORANGE_ART = [
  '      .-~~~-.      ',
  '    /  \\ | /  \\    ',
  '   |----(o)----|   ',
  '    \\  / | \\  /    ',
  "      '-~~~-'      ",
];
const BOOTED = Date.now();

function mount(win, args) {
  const S = { cwd: args.cwd || '/', hist: (state.settings.termHistory || []).slice(-200), hi: -1 };
  const out = h('div', { class: 'term-out', role: 'log', 'aria-live': 'polite' });
  const prompt = h('span', { class: 'tp' });
  const inp = h('input', { class: 'term-in', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Command' });
  const line = h('div', { class: 'term-line' }, prompt, inp);
  const term = h('div', { class: 'term', onclick: () => getSelection().isCollapsed && inp.focus() }, out, line);
  win.body.append(h('div', { class: 'term-wrap' }, h('header', { class: 'tb term-tb', 'data-drag': '' }, h('span', { class: 'term-dots' }, h('i'), h('i'), h('i')), h('b', {}, 'orange shell'), h('span', { class: 'grow' }), h('small', {}, 'type help')), term));
  win.getArgs = () => ({ cwd: S.cwd });

  const setPrompt = () => {
    prompt.replaceChildren(h('b', {}, `${state.name}@orange`), ':', h('i', {}, S.cwd === '/' ? '~' : '~' + S.cwd), '$ ');
    win.setStatus(h('span', {}, S.cwd === '/' ? 'Home' : S.cwd));
  };
  const print = (...parts) => { out.append(h('div', { class: 'tl' }, ...parts)); term.scrollTop = term.scrollHeight; };
  const span = (cls, t) => h('span', { class: cls }, t);
  const err = t => print(span('t-err', t));

  const cmds = {
    async help() {
      const rows = [
        ['ls [dir]', 'list what’s here'], ['cd <dir>', 'go into a folder (cd .. goes up)'], ['pwd', 'where am I?'],
        ['tree [dir]', 'everything below, as a tree'], ['cat <file>', 'print a text file'], ['open <path>', 'open in the right app'],
        ['mkdir <dir>', 'make a folder'], ['touch <file>', 'make an empty file'], ['echo text > file', 'write (>> appends)'],
        ['mv <a> <b>', 'move or rename'], ['rm <path>', 'move to Trash (undo from the Pip)'], ['find <word>', 'search names in the whole box'],
        ['df', 'how much is stored'], ['neofetch', 'about this Orange'], ['history', 'what you typed'], ['theme day|night', 'switch the light'],
        ['clear', 'wipe the screen'], ['lock', 'lock the box'], ['exit', 'close this terminal'],
      ];
      print(span('t-h', 'Orange shell — every command works inside your encrypted box'));
      rows.forEach(([c, d]) => print(span('t-cmd', c.padEnd(18, ' ')), span('t-dim', d)));
      print(span('t-dim', 'Tab completes names · ↑/↓ for history · Ctrl+L clears'));
    },
    pwd() { print(S.cwd); },
    async ls(a) {
      const flags = a.filter(x => x.startsWith('-')).join(''), target = norm(a.find(x => !x.startsWith('-')) || '.', S.cwd);
      const { items } = await api.get('list', { path: target });
      if (!items.length) return print(span('t-dim', '(empty)'));
      if (flags.includes('l')) items.forEach(i => print(span('t-dim', (i.dir ? 'd ' : '- ') + (i.dir ? '' : fmtSize(i.size)).padStart(9, ' ') + '  ' + (fmtWhen(i.mtime) || '').padEnd(16, ' ')), span(i.dir ? 't-dir' : 't-k-' + kindOf(i.name), i.name + (i.dir ? '/' : ''))));
      else print(...items.flatMap(i => [span(i.dir ? 't-dir' : 't-k-' + kindOf(i.name), i.name + (i.dir ? '/' : '')), '   ']));
    },
    async cd(a) {
      const target = norm(a[0] || '/', S.cwd);
      await api.get('list', { path: target });
      S.cwd = target; setPrompt();
    },
    async tree(a) {
      const root = norm(a[0] || '.', S.cwd);
      let count = 0;
      const walk = async (p, pad) => {
        const { items } = await api.get('list', { path: p });
        for (const [i, it] of items.entries()) {
          if (++count > 400) return;
          const last = i === items.length - 1;
          print(span('t-dim', pad + (last ? '└─ ' : '├─ ')), span(it.dir ? 't-dir' : '', it.name));
          if (it.dir) await walk(it.path, pad + (last ? '   ' : '│  '));
        }
      };
      print(span('t-dir', root));
      await walk(root, '');
      if (count > 400) print(span('t-dim', '… (stopped after 400 entries)'));
    },
    async cat(a) {
      if (!a[0]) return err('cat: which file?');
      const t = await api.text(norm(a[0], S.cwd));
      print(h('pre', { class: 't-pre' }, t.length > 60000 ? t.slice(0, 60000) + '\n… (cut)' : t));
    },
    async open(a) {
      const p = norm(a[0] || '.', S.cwd), parent = dirname(p);
      if (p === '/') return launch('files', { path: '/' });
      const { items } = await api.get('list', { path: parent });
      const it = items.find(i => i.path === p);
      if (!it) return err(`open: ${a[0]}: not found`);
      openItem(it);
    },
    async mkdir(a) { for (const x of a.filter(x => x !== '-p')) await api.post('mkdir', { path: norm(x, S.cwd) }); emit('changed', { path: S.cwd }); },
    async touch(a) {
      for (const x of a) {
        const p = norm(x, S.cwd);
        try { await api.text(p); } catch { await api.post('write', { path: p, text: '' }); }
      }
      emit('changed', { path: S.cwd });
    },
    async echo(a, raw) {
      const m = raw.match(/^echo\s+(.*?)\s*(>>?)\s*(\S+)\s*$/);
      if (!m) return print(raw.replace(/^echo\s?/, '').replace(/^["']|["']$/g, ''));
      const text = m[1].replace(/^["']|["']$/g, ''), p = norm(m[3], S.cwd);
      let prev = '';
      if (m[2] === '>>') { try { prev = await api.text(p); } catch { /* new file */ } }
      await api.post('write', { path: p, text: prev + text + '\n' });
      emit('changed', { path: dirname(p) });
    },
    async mv(a) {
      if (a.length !== 2) return err('mv: usage: mv <from> <to>');
      const src = norm(a[0], S.cwd), dst = norm(a[1], S.cwd);
      const { items } = await api.get('list', { path: dirname(dst) }).catch(() => ({ items: [] }));
      const isDir = items.some(i => i.path === dst && i.dir);
      if (!isDir && dirname(src) === dirname(dst)) await api.post('rename', { path: src, name: basename(dst) });
      else await api.post('move', { src, dst });
      emit('changed', { path: '*' });
    },
    async rm(a) {
      const paths = a.filter(x => !x.startsWith('-')).map(x => norm(x, S.cwd));
      if (!paths.length) return err('rm: what should go to the Trash?');
      await trashPaths(paths);
      print(span('t-dim', `moved ${paths.length} item(s) to Trash`));
    },
    async find(a) {
      if (!a[0]) return err('find: find what?');
      const { items } = await api.get('search', { q: a.join(' ') });
      if (!items.length) print(span('t-dim', 'nothing found'));
      items.forEach(i => print(span(i.dir ? 't-dir' : '', i.path + (i.dir ? '/' : ''))));
    },
    async df() {
      const st = await api.get('stats');
      print(span('t-h', `${st.files} files in ${st.dirs} folders · ${fmtSize(st.bytes)} encrypted`));
      print(span('t-dim', `Trash: ${st.trashItems} item(s) · ${fmtSize(st.trashBytes)}   Free on this computer: ${fmtSize(st.diskFree)}`));
    },
    async neofetch() {
      const st = await api.get('state');
      const up = Math.round((Date.now() - BOOTED) / 60000);
      const info = [
        [`${state.name}@orange`, ''], ['─'.repeat(18), ''],
        ['OS', `Orange ${st.version} (inside ${st.platform})`], ['Shell', 'orange shell'], ['Uptime', `${up} min`],
        ['Files', `${st.files} · ${fmtSize(st.bytes)}`], ['Cipher', `${st.cipher}`], ['Key', `scrypt N=${st.kdf}`],
        ['Theme', `${state.settings.theme} · ${state.settings.accent}`],
      ];
      for (let i = 0; i < Math.max(ORANGE_ART.length, info.length); i++) {
        const [k, v] = info[i] || ['', ''];
        print(span('t-art', (ORANGE_ART[i] || '').padEnd(22, ' ')), k && v ? span('t-key', k + ': ') : span('t-key', k), v ? span('', v) : '');
      }
      print(h('span', { class: 't-swatch' }, ...['#ff8a1f', '#ffb347', '#ff5a3c', '#9be15d', '#4fd1ff', '#b18cff', '#ff7eb3', '#fff4ea'].map(c => h('i', { style: { background: c } }))));
    },
    history() { S.hist.forEach((c, i) => print(span('t-dim', String(i + 1).padStart(4, ' ') + '  '), c)); },
    theme(a) { const t = a[0] === 'day' ? 'day' : a[0] === 'night' ? 'night' : null; if (!t) return err('theme: day or night'); setSetting({ theme: t }); },
    clear() { out.replaceChildren(); },
    whoami() { print(state.name); },
    date() { print(new Date().toString()); },
    lock() { emit('lock'); },
    exit() { win.close(); },
    sudo() { print(span('t-dim', 'There’s no sudo in here. You already own everything in this box. 🍊')); },
  };
  cmds.dir = cmds.ls; cmds.cls = cmds.clear; cmds.del = cmds.rm; cmds.type = cmds.cat; cmds.ll = a => cmds.ls(['-l', ...a]);

  async function run(raw) {
    const text = raw.trim();
    print(prompt.cloneNode(true), span('t-typed', raw));
    if (!text) return;
    S.hist.push(text); S.hi = -1;
    setSetting({ termHistory: S.hist.slice(-200) });
    const [name, ...rest] = text.match(/"[^"]*"|'[^']*'|\S+/g).map(x => x.replace(/^["'](.*)["']$/, '$1'));
    const fn = cmds[name.toLowerCase()];
    if (!fn) { sfx('error'); return err(`${name}: command not found. Try 'help'.`); }
    try { await fn(rest, text); } catch (e) { err(`${name}: ${e.message}`); }
  }

  async function complete() {
    const v = inp.value, at = v.lastIndexOf(' ') + 1, word = v.slice(at);
    if (at === 0) {
      const hits = Object.keys(cmds).filter(c => c.startsWith(word));
      if (hits.length === 1) inp.value = hits[0] + ' ';
      else if (hits.length) print(span('t-dim', hits.join('   ')));
      return;
    }
    const dir = word.includes('/') ? norm(word.slice(0, word.lastIndexOf('/') + 1) || '/', S.cwd) : S.cwd;
    const stem = word.slice(word.lastIndexOf('/') + 1).toLowerCase();
    try {
      const { items } = await api.get('list', { path: dir });
      const hits = items.filter(i => i.name.toLowerCase().startsWith(stem));
      if (hits.length === 1) inp.value = v.slice(0, at) + word.slice(0, word.lastIndexOf('/') + 1) + hits[0].name.replace(/ /g, '\\ ') + (hits[0].dir ? '/' : ' ');
      else if (hits.length) print(span('t-dim', hits.map(i => i.name + (i.dir ? '/' : '')).join('   ')));
    } catch { /* ignore */ }
  }

  inp.addEventListener('keydown', async e => {
    if (e.key === 'Enter') { e.preventDefault(); const v = inp.value.replace(/\\ /g, ' '); inp.value = ''; inp.disabled = true; await run(v); inp.disabled = false; inp.focus(); }
    else if (e.key === 'ArrowUp' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); if (!S.hist.length) return; S.hi = S.hi < 0 ? S.hist.length - 1 : Math.max(0, S.hi - 1); inp.value = S.hist[S.hi]; }
    else if (e.key === 'ArrowDown' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); if (S.hi < 0) return; S.hi++; if (S.hi >= S.hist.length) { S.hi = -1; inp.value = ''; } else inp.value = S.hist[S.hi]; }
    else if (e.key === 'Tab') { e.preventDefault(); complete(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); out.replaceChildren(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'c') { if (!getSelection().toString()) { e.preventDefault(); print(prompt.cloneNode(true), span('t-typed', inp.value + '^C')); inp.value = ''; } }
  });
  setPrompt();
  print(span('t-h', `Welcome to the Orange shell, ${state.name}.`));
  print(span('t-dim', 'Everything you do here stays inside your encrypted box. Type '), span('t-cmd', 'help'), span('t-dim', ' to start, or '), span('t-cmd', 'neofetch'), span('t-dim', ' to show off.'));
  setTimeout(() => inp.focus(), 80);
  win.focusMain = () => inp.focus();
}

register({ id: 'terminal', name: 'Terminal', icon: 'terminal', color: '#ff9a3c', grad: 'linear-gradient(135deg,#4a3527,#120c08)', size: [780, 480], mount, blurb: 'A shell inside the box' });
