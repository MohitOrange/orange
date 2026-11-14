// Settings: how Orange looks, moves, sounds and protects you. Changes apply instantly (no Apply button).
import { api } from '../api.js';
import { h, icon, ico, state, setSetting, emit, notify, fail, sfx, fmtSize, kindOf, KIND, logo, ask, anim, EASE } from '../core.js';
import { register, launch } from '../registry.js';

export const ACCENTS = [
  ['orange', '#ff8a1f', 'Orange'], ['blood', '#ff4f3a', 'Blood orange'], ['mango', '#ffb000', 'Mango'],
  ['lime', '#6fd13f', 'Lime'], ['berry', '#e8457f', 'Berry'], ['ocean', '#2fb8ff', 'Ocean'],
];
const WALLS = [['juice', 'Juice', 'slow, glowing citrus'], ['grove', 'Grove', 'dark, quiet dots'], ['dusk', 'Dusk', 'sunset gradient'], ['ink', 'Ink', 'plain and still']];
export const SHORTCUTS = [
  ['Type anything', 'Search apps, files, actions — or do maths'], ['Ctrl + K', 'Search from anywhere'],
  ['Right-click', 'Segments menu: actions all around the pointer'], ['Alt + Q', 'Close window'], ['Alt + M', 'Sink window into the rail'],
  ['Alt + Enter', 'Fill the screen / restore'], ['Alt + Shift + ← / →', 'Snap window left / right'], ['Alt + Shift + ↑', 'Fill the screen'], ['Alt + `', 'Cycle windows'],
  ['Ctrl + ↑', 'Overview — see every window'], ['Ctrl + L', 'Lock the box'], ['Alt + 1…5', 'Open apps from the rail'],
  ['Space', 'Quick look (in Files)'], ['F2 / Del', 'Rename / move to Trash (in Files)'], ['?', 'Show these shortcuts'],
];

function mount(win, args) {
  const nav = h('nav', { class: 'set-nav' });
  const main = h('div', { class: 'set-main' });
  win.body.append(h('div', { class: 'settings' }, h('header', { class: 'tb', 'data-drag': '' }, h('b', {}, 'Settings'), h('div', { class: 'grow' }), h('small', { class: 'muted' }, 'Changes apply instantly and are stored encrypted')), h('div', { class: 'set-split' }, nav, main)));
  const SECTIONS = [['look', 'Look', 'sparkle'], ['motion', 'Motion & sound', 'motion'], ['security', 'Security', 'shield'], ['storage', 'Storage', 'archive'], ['keys', 'Shortcuts', 'keyboard'], ['about', 'About Orange', 'info']];
  let cur = args.section || 'look';

  const row = (title, desc, control) => h('div', { class: 'row' }, h('div', { class: 'row-l' }, h('b', {}, title), desc ? h('small', {}, desc) : null), h('div', { class: 'row-r' }, control));
  const choice = (key, options, after) => h('div', { class: 'opts', role: 'radiogroup' }, options.map(([v, label]) => h('button', {
    class: 'opt' + (state.settings[key] === v ? ' on' : ''), role: 'radio', 'aria-checked': state.settings[key] === v ? 'true' : 'false',
    onclick: e => { setSetting({ [key]: v }); sfx('tick'); e.currentTarget.parentNode.querySelectorAll('.opt').forEach(o => { o.classList.toggle('on', o === e.currentTarget); o.setAttribute('aria-checked', o === e.currentTarget); }); after && after(v); },
  }, label)));
  const toggle = (key, after) => {
    const b = h('button', { class: 'switch' + (state.settings[key] ? ' on' : ''), role: 'switch', 'aria-checked': state.settings[key] ? 'true' : 'false', onclick: () => {
      setSetting({ [key]: !state.settings[key] }); b.classList.toggle('on', state.settings[key]); b.setAttribute('aria-checked', state.settings[key]); sfx('tick'); after && after(state.settings[key]);
    } }, h('i'));
    return b;
  };

  const views = {
    look() {
      const themes = h('div', { class: 'theme-cards' }, [['night', 'Night', 'moon'], ['day', 'Daylight', 'sun'], ['auto', 'Follow computer', 'sparkle']].map(([v, l, i]) => h('button', {
        class: `theme-card tc-${v}` + (state.settings.theme === v ? ' on' : ''), onclick: e => { setSetting({ theme: v }); sfx('tick'); themes.querySelectorAll('.theme-card').forEach(c => c.classList.toggle('on', c === e.currentTarget)); },
      }, h('div', { class: 'tc-mini' }, h('i'), h('i'), h('i')), h('span', {}, ico(i, 15), l))));
      const sw = h('div', { class: 'swatches' }, ACCENTS.map(([v, c, l]) => h('button', {
        class: 'swatch' + (state.settings.accent === v ? ' on' : ''), title: l, 'aria-label': l, style: { '--c': c },
        onclick: e => { setSetting({ accent: v }); sfx('tick'); sw.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s === e.currentTarget)); },
      })));
      const walls = h('div', { class: 'wall-pick' }, [...WALLS, ['custom', 'Your photo', state.settings.wallpaperPath ? state.settings.wallpaperPath.split('/').pop() : 'pick one in Files']].map(([v, l, d]) => h('button', {
        class: `wp wp-${v}` + (state.settings.wallpaper === v ? ' on' : ''),
        onclick: e => {
          if (v === 'custom' && !state.settings.wallpaperPath) { notify({ title: 'Pick a photo', body: 'Right-click any image in Files → Set as wallpaper.', icon: 'wallpaper' }); launch('files', { path: '/Pictures' }); return; }
          setSetting({ wallpaper: v }); sfx('tick'); walls.querySelectorAll('.wp').forEach(w => w.classList.toggle('on', w === e.currentTarget));
        },
        style: v === 'custom' && state.settings.wallpaperPath ? { backgroundImage: `url("${api.fileUrl(state.settings.wallpaperPath)}")` } : null,
      }, h('span', {}, h('b', {}, l), h('small', {}, d)))));
      return [h('h2', {}, 'Look'), row('Light', 'Night is easy on the eyes. Daylight is for bright rooms.', themes), row('Accent colour', 'Used for highlights, focus and the rind under the active window.', sw), h('div', { class: 'row col' }, h('div', { class: 'row-l' }, h('b', {}, 'Wallpaper'), h('small', {}, 'Moving wallpapers pause automatically when motion is set to Calm or Off.')), walls)];
    },
    motion() {
      return [h('h2', {}, 'Motion & sound'),
        row('Motion', 'Full: springy and alive. Calm: quick fades only. Off: everything instant.', choice('motion', [['full', 'Full'], ['calm', 'Calm'], ['off', 'Off']])),
        row('Sounds', 'Soft, short tones confirm what happened, so you don’t have to look.', toggle('sound')),
        row('Hot corners', 'Just touch a corner with the pointer (no click) to use it.', toggle('hotCorners')),
        h('div', { class: 'callout' }, ico('info', 18), h('span', {}, 'Orange also follows your computer’s “reduce motion” setting the first time it starts.'))];
    },
    security() {
      const pw = { old: h('input', { class: 'field', type: 'password', placeholder: 'Current password', autocomplete: 'off' }), n1: h('input', { class: 'field', type: 'password', placeholder: 'New password (6+ characters)', autocomplete: 'off' }), n2: h('input', { class: 'field', type: 'password', placeholder: 'New password again', autocomplete: 'off' }) };
      const meter = h('div', { class: 'meter' }, h('i'));
      pw.n1.oninput = () => { const v = pw.n1.value; const s = Math.min(4, (v.length >= 8) + (v.length >= 12) + /[A-Z]/.test(v) + /[0-9]/.test(v) + /[^A-Za-z0-9]/.test(v)); meter.dataset.s = s; };
      const change = async () => {
        if (pw.n1.value.length < 6) return fail(new Error('The new password needs at least 6 characters.'));
        if (pw.n1.value !== pw.n2.value) return fail(new Error('The two new passwords don’t match.'));
        try { await api.post('passwd', { old: pw.old.value, new: pw.n1.value }); sfx('ok'); notify({ title: 'Password changed', body: 'Use it next time you unlock.', icon: 'shield', tone: 'good' }); Object.values(pw).forEach(i => (i.value = '')); meter.dataset.s = 0; }
        catch (e) { fail(e); }
      };
      return [h('h2', {}, 'Security'),
        row('Lock automatically', 'After this long without you, the box locks and the key is wiped from memory.', choice('autolock', [[0, 'Never'], [2, '2 min'], [5, '5 min'], [10, '10 min'], [30, '30 min']], () => emit('autolock'))),
        row('Lock now', 'Ctrl + L does the same.', h('button', { class: 'btn', onclick: () => emit('lock') }, ico('lock', 16), 'Lock')),
        row('Start in full screen', 'Opens Orange as a whole computer that fills the screen.', toggle('immersive')),
        h('div', { class: 'row col' }, h('div', { class: 'row-l' }, h('b', {}, 'Change password'), h('small', {}, 'Your files aren’t re-encrypted, only the key lock changes, so it’s instant. There is no recovery — keep it safe.')),
          h('div', { class: 'pw-form' }, pw.old, pw.n1, meter, pw.n2, h('button', { class: 'btn primary', onclick: change }, ico('shield', 16), 'Change password'))),
        h('div', { class: 'callout' }, ico('shield', 18), h('span', {}, `Files are encrypted with ${state.info.cipher || 'AES-256-GCM'}. Your password is stretched with scrypt (N=${state.info.kdf || 32768}), so guessing it is slow. Nothing leaves this computer.`))];
    },
    storage() {
      const box = h('div', { class: 'storage' }, h('small', {}, 'Counting…'));
      api.get('stats').then(st => {
        const groups = {};
        for (const [ext, b] of Object.entries(st.byExt)) { const k = kindOf('x.' + ext); groups[k] = (groups[k] || 0) + b; }
        const total = st.bytes || 1, ordered = Object.entries(groups).sort((a, b) => b[1] - a[1]);
        let acc = 0;
        const stops = ordered.map(([k, b]) => { const s = acc; acc += (b / total) * 360; return `${KIND[k].color} ${s}deg ${acc}deg`; }).join(',');
        const ring = h('div', { class: 'ring', style: { background: st.bytes ? `conic-gradient(${stops})` : 'var(--line)' } }, h('div', { class: 'ring-in' }, h('b', {}, fmtSize(st.bytes)), h('small', {}, `${st.files} files`)));
        anim(ring, [{ transform: 'rotate(-120deg) scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: EASE.spring });
        box.replaceChildren(h('div', { class: 'storage-top' }, ring,
          h('div', { class: 'legend' }, ordered.length ? ordered.map(([k, b]) => h('div', { class: 'lg' }, h('i', { style: { background: KIND[k].color } }), h('span', {}, KIND[k].label), h('b', {}, fmtSize(b)))) : h('small', {}, 'Your box is empty. Drop some files in!'))),
          row('Trash', `${st.trashItems} item(s) waiting, using ${fmtSize(st.trashBytes)}.`, h('button', { class: 'btn', onclick: () => launch('trash') }, ico('trash', 16), 'Open Trash')),
          row('Folders', `${st.dirs} folders`, h('button', { class: 'btn', onclick: () => launch('files') }, ico('folder', 16), 'Open Files')),
          row('Free space on this computer', 'Orange can grow until the drive is full.', h('b', {}, fmtSize(st.diskFree))));
      }).catch(fail);
      return [h('h2', {}, 'Storage'), box];
    },
    keys() {
      return [h('h2', {}, 'Shortcuts'), h('p', { class: 'muted' }, 'You never need these, everything can be clicked, but they’re fast once your hands learn them.'),
        h('div', { class: 'keys' }, SHORTCUTS.map(([k, d]) => h('div', { class: 'key-row' }, h('span', {}, ...k.split(' ').map(p => (p === '+' || p === '/' || p === '…' ? ` ${p} ` : h('kbd', {}, p)))), h('small', {}, d))))];
    },
    about() {
      return [h('div', { class: 'about-hero' }, h('div', { class: 'about-logo', html: logo(84, 'spin-slow') }), h('h2', {}, 'Orange'), h('p', {}, `Version ${state.version} · ${state.name}’s box`), h('small', { class: 'muted' }, 'An encrypted computer inside your computer.')),
        h('div', { class: 'principles' }, [
          ['Controls at the bottom', 'The top of every window is left for content. One Base bar does two jobs: window controls and live status.'],
          ['Four working corners', 'Corners are the easiest targets on any screen. Orange gives each one a job.'],
          ['Segments, not lists', 'Right-click opens choices all around the pointer. Each one is the same short move away.'],
          ['Type anywhere', 'No search box to find first. Start typing and Orange listens.'],
          ['Undo, not “Are you sure?”', 'Deleting is instant and reversible. Questions are saved for things that can’t be undone.'],
          ['Nothing to save', 'Notes and code save and encrypt themselves while you type.'],
        ].map(([t, d]) => h('div', { class: 'pr' }, h('b', {}, t), h('small', {}, d)))),
        h('div', { class: 'about-acts' }, h('button', { class: 'btn', onclick: () => emit('tour') }, ico('sparkle', 16), 'Replay the welcome tour'), h('button', { class: 'btn', onclick: () => emit('keys') }, ico('keyboard', 16), 'Shortcuts'))];
    },
  };

  function show(id, animate = true) {
    cur = id;
    nav.replaceChildren(...SECTIONS.map(([sid, label, ic]) => h('button', { class: 'set-link' + (sid === cur ? ' on' : ''), onclick: () => show(sid) }, ico(ic, 17), h('span', {}, label))));
    main.replaceChildren(h('div', { class: 'set-sec' }, ...views[id]()));
    main.scrollTop = 0;
    win.setStatus(SECTIONS.find(s => s[0] === id)[1]);
    if (animate) anim(main.firstChild, [{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASE.out });
  }
  win.reopen = a => a.section && show(a.section);
  win.getArgs = () => ({ section: cur });
  show(cur, false);
}

register({ id: 'settings', name: 'Settings', icon: 'settings', color: '#9aa3b5', grad: 'linear-gradient(135deg,#c6ccd8,#5d6678)', size: [880, 600], single: true, mount, blurb: 'Look, motion, security' });
