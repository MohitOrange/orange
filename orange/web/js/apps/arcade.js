// Arcade: 100+ small games for kids and families, plus Mohit's own games.
import { h, icon, ico, state, fail, sfx, anim, EASE, debounce } from '../core.js';
import { register, launch } from '../registry.js';
import { CATALOG, CATS, GAME_COUNT } from '../arcade/catalog.js';
import { runGame, loadScores, best, bestKey, recordPlay, migrateScores } from '../arcade/engine.js';

const mods = {};
const loadEngine = file => (mods[file] ||= import(`../arcade/games/${file}.js`));

function mount(win, args) {
  const S = { cat: 'all', q: '', game: null };
  const root = h('div', { class: 'arc' });
  win.body.append(root);
  win.getArgs = () => ({ game: S.game?.id });
  win.destroy = () => S.runner?.destroy();

  function tile(e, i) {
    const b = h('button', { class: 'arc-tile', style: { '--c': e.color, '--i': Math.min(i, 30) }, onclick: () => open(e, b) },
      h('span', { class: 'arc-ico' }, e.icon), h('b', {}, e.title),
      h('small', {}, best(bestKey(e)) ? `best ${best(bestKey(e))}` : e.modes ? `${e.modes.length} levels` : e.params.note && e.cat === 'quest' ? e.params.note : CATS.find(c => c[0] === e.cat)?.[1] || ''));
    return b;
  }

  async function hub() {
    S.runner?.destroy(); S.runner = null; S.game = null;
    win.setTitle('Arcade');
    const store = await loadScores();
    migrateScores(CATALOG);
    const search = h('input', { class: 'search-in arc-search', placeholder: `Search ${GAME_COUNT} games`, value: S.q, spellcheck: 'false' });
    const chips = h('div', { class: 'arc-chips' }, CATS.map(([id, label, i]) => h('button', { class: 'arc-chip' + (S.cat === id ? ' on' : ''), onclick: () => { S.cat = id; hub(); } }, `${i} ${label}`)));
    const gridEl = h('div', { class: 'arc-grid' });
    const paint = () => {
      const q = S.q.toLowerCase();
      const list = CATALOG.filter(e => (S.cat === 'all' || e.cat === S.cat) && (!q || e.title.toLowerCase().includes(q) || (e.modes || []).some(m => m[0].toLowerCase().includes(q))));
      gridEl.replaceChildren(...list.map(tile));
      root.querySelector('.arc-sec')?.toggleAttribute('hidden', !!q);
      win.setStatus(`${list.length} games`);
    };
    search.oninput = debounce(() => { S.q = search.value; paint(); }, 80);
    const recent = (store.recent || []).map(id => CATALOG.find(e => e.id === id)).filter(Boolean).slice(0, 6);
    root.replaceChildren(
      h('header', { class: 'tb arc-head', 'data-drag': '' }, h('span', { class: 'arc-logo', html: icon('play', 18) }), h('b', {}, 'Arcade'), h('div', { class: 'grow' }), search),
      h('div', { class: 'arc-scroll' },
        h('div', { class: 'arc-hero' }, h('div', {}, h('h2', {}, 'Play, learn, have fun'), h('p', {}, `${GAME_COUNT} different games · each with its own levels · light on your computer · scores saved in your box`)),
          h('div', { class: 'arc-hero-emoji' }, '🎮🧩🎈')),
        chips,
        recent.length && S.cat === 'all' && !S.q ? h('div', { class: 'arc-sec' }, h('small', {}, 'Continue playing'), h('div', { class: 'arc-recent' }, recent.map(tile))) : null,
        gridEl));
    paint();
  }

  async function open(e, from) {
    sfx('pop');
    S.game = e;
    win.setTitle(e.title);
    if (e.engine === 'app') { recordPlay(e.id); return launch(e.params.app, e.params.args || {}); }
    if (e.engine === 'web' || e.engine === 'info') return openWeb(e);
    try {
      const mod = await loadEngine(e.engine.split(':')[0]);
      const stage = h('div', { class: 'arc-game' });
      root.replaceChildren(stage);
      anim(stage, [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE.out });
      S.runner = runGame(stage, e, mod, win, hub);
      win.setStatus(e.how ? '' : '');
    } catch (err) { fail(err); hub(); }
  }

  function openWeb(e) {
    recordPlay(e.id);
    const back = h('button', { class: 'tbtn', title: 'Back to Arcade', html: icon('left'), onclick: hub });
    if (e.engine === 'info') {
      root.replaceChildren(h('div', { class: 'arc-info' }, back, h('div', { class: 'arc-big', style: { '--c': e.color } }, e.icon), h('h2', {}, e.title), h('p', {}, e.params.note),
        h('a', { class: 'btn primary', href: e.params.link, target: '_blank', rel: 'noreferrer' }, ico('link', 16), 'Open on GitHub')));
      return;
    }
    const frame = h('iframe', { class: 'arc-frame', src: e.params.url, allow: 'camera; microphone; fullscreen; autoplay; gamepad', title: e.title });
    const full = h('button', { class: 'tbtn', title: 'Full screen', html: icon('fullscreen'), onclick: () => frame.requestFullscreen?.() });
    root.replaceChildren(h('div', { class: 'gm' },
      h('header', { class: 'tb gm-bar', 'data-drag': '' }, back, h('span', { class: 'gm-ico', style: { '--c': e.color } }, e.icon), h('b', { class: 'gm-title' }, e.title),
        h('small', { class: 'muted arc-note' }, e.params.note), h('div', { class: 'grow' }), full),
      h('div', { class: 'gm-wrap' }, frame)));
    // stop the game drawing while its window is sunk (saves CPU and battery)
    const watch = setInterval(() => { if (!frame.isConnected) return clearInterval(watch); frame.style.display = win.state === 'min' ? 'none' : ''; }, 500);
    S.runner = { destroy: () => { clearInterval(watch); frame.src = 'about:blank'; } };
    win.setStatus(e.params.camera ? 'needs camera + internet' : 'your game');
  }

  win.reopen = a => { if (a?.game) { const e = CATALOG.find(x => x.id === a.game); if (e) open(e); } };
  return hub().then(() => { if (args.game) win.reopen(args); });
}

register({ id: 'arcade', name: 'Arcade', icon: 'play', color: '#ff5d8f', grad: 'linear-gradient(135deg,#ffb86b,#ff4f9a)', size: [980, 680], mount, blurb: `${GAME_COUNT} games for everyone` });
