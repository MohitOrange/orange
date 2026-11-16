// DivyaNik: Speed Test (reading + typing), QuestVerse and Publishing House, as one app inside Orange.
// Each module loads only when it is opened. Progress, certificates, quest work and books are all stored in the box.
import { h, icon, sfx } from '../core.js';
import { register, launch } from '../registry.js';
import { loadDN, saveDN, stat, isMinor } from '../divyanik/common.js';
import { AGE_BANDS, TIERS, LEVELS } from '../divyanik/data.js';

const TABS = [['home', 'Home', '🏠'], ['reading', 'Speed Reading', '📖'], ['typing', 'Speed Typing', '⌨️'], ['quest', 'QuestVerse', '🧭'], ['publish', 'Publishing House', '📚']];
const MODULES = { reading: () => import('../divyanik/reading.js'), typing: () => import('../divyanik/typing.js'), quest: () => import('../divyanik/quest.js'), publish: () => import('../divyanik/publish.js') };

function mount(win, args) {
  const S = { tab: args.tab || 'home', cleanup: null };
  const nav = h('nav', { class: 'dn-nav' }), body = h('div', { class: 'dn-body' });
  win.body.append(h('div', { class: 'dn' }, h('header', { class: 'tb dn-head', 'data-drag': '' }, h('span', { class: 'dn-logo' }, 'DN'), h('b', {}, 'DivyaNik'), h('small', { class: 'dn-sub' }, 'Speed Test · QuestVerse · Publishing House')), h('div', { class: 'dn-main' }, nav, body)));

  async function go(tab) {
    S.cleanup?.(); S.cleanup = null; S.tab = tab; sfx('tick');
    nav.replaceChildren(...TABS.map(([id, label, e]) => h('button', { class: 'dn-tab' + (id === tab ? ' on' : ''), onclick: () => go(id) }, h('span', {}, e), h('b', {}, label))));
    const data = await loadDN();
    win.setTitle(tab === 'home' ? 'DivyaNik' : `DivyaNik · ${TABS.find(t => t[0] === tab)[1]}`);
    body.replaceChildren(); body.scrollTop = 0;
    if (tab === 'home') return home(data);
    if (!data.profile.name || !data.profile.band) return profile(data, () => go(tab));
    const mod = await MODULES[tab]();
    S.cleanup = mod.mount(body, { win, data, go, save: saveDN }) || null;
  }

  function profile(d, then) {
    const name = h('input', { class: 'field', placeholder: 'Your name (it goes on certificates)', value: d.profile.name || '' });
    let band = d.profile.band || '';
    const bands = h('div', { class: 'arc-chips' }, AGE_BANDS.map(b => h('button', { class: 'arc-chip' + (b === band ? ' on' : ''), onclick: e => { band = b; bands.querySelectorAll('.arc-chip').forEach(x => x.classList.toggle('on', x === e.currentTarget)); } }, b)));
    body.replaceChildren(h('div', { class: 'dn-card dn-profile' }, h('h2', {}, 'Who is learning?'), h('p', { class: 'muted' }, 'Your age group picks the right missions and passages. Learners under 18 publish with a pen name, and a parent approves before a book is published.'),
      name, h('b', {}, 'Age group'), bands, h('button', { class: 'btn primary', onclick: () => { if (!name.value.trim() || !band) return name.focus(); d.profile.name = name.value.trim(); d.profile.band = band; saveDN(); then(); } }, 'Save and continue')));
    name.focus();
  }

  function home(d) {
    const best = d.reading.length ? Math.max(...d.reading.map(r => r.wpm)) : 0, last = d.reading.at(-1);
    const tAtt = d.typing.attempts, tBest = tAtt.length ? Math.max(...tAtt.map(a => a.net)) : 0;
    const done = Object.values(d.quest.done).filter(x => x.best >= 50 || x.reviewed).length, tier = [...TIERS].reverse().find(t => done >= t[1]);
    const card = (tab, e, title, kids) => h('button', { class: 'dn-mod', onclick: () => go(tab) }, h('span', { class: 'dn-mod-e' }, e), h('b', {}, title), h('div', { class: 'dn-mod-stats' }, kids));
    body.append(
      h('div', { class: 'dn-hero' }, h('div', {}, h('h2', {}, d.profile.name ? `Hello, ${d.profile.name}!` : 'Welcome to DivyaNik'), h('p', {}, 'Read faster, type better, take on missions and publish your own book. Everything is saved, encrypted, in your Orange box.'),
        h('button', { class: 'btn', onclick: () => profile(d, () => go('home')) }, d.profile.name ? `✏️ ${d.profile.name} · ages ${d.profile.band}` : 'Set up your profile')), h('span', { class: 'dn-hero-e' }, '🚀')),
      h('div', { class: 'dn-mods' },
        card('reading', '📖', 'Speed Reading', [stat(best || '–', 'best WPM'), stat(last ? `${Math.round(last.score * 100)}%` : '–', 'last quiz')]),
        card('typing', '⌨️', 'Speed Typing', [stat(`L${d.typing.level}`, LEVELS[d.typing.level - 1].name), stat(tBest || '–', 'best net WPM')]),
        card('quest', '🧭', 'QuestVerse', [stat(done, 'missions done'), stat(tier ? tier[2] : '–', tier ? tier[0] : 'no badge yet')]),
        card('publish', '📚', 'Publishing House', [stat('✍️', 'write a book'), stat('📘', 'export EPUB')])),
      h('div', { class: 'dn-card' }, h('h3', {}, '🎓 Certificates'), d.certs.length
        ? h('div', { class: 'dn-certs' }, d.certs.slice(0, 12).map(c => h('button', { class: 'dn-cert', onclick: () => launch('lens', { path: c.path }) }, h('b', {}, c.title), h('small', {}, `${c.lines[0] || ''} · ${c.date}`))))
        : h('p', { class: 'muted' }, 'Pass a typing level as a certificate test, or earn a QuestVerse badge, to get your first certificate.')),
      h('div', { class: 'dn-card dn-note' }, h('b', {}, 'About DivyaNik on Orange'),
        h('p', {}, 'Orange runs the learning parts of the DivyaNik scope on this one computer. Sign-in, parent and teacher accounts, subscriptions and payments, reviewer queues shared between people, QR certificate verification and the public book catalogue need the DivyaNik web platform and are not part of Orange.'),
        isMinor(d) ? h('p', {}, 'Child safety here: no leaderboards, pen names on books, and a parent approval step before a book is published.') : null));
  }

  win.reopen = a => a?.tab && go(a.tab);
  win.getArgs = () => ({ tab: S.tab });
  win.destroy = () => S.cleanup?.();
  go(S.tab);
}

register({ id: 'divyanik', name: 'DivyaNik', icon: 'quest', color: '#8e24aa', grad: 'linear-gradient(135deg,#ffb74d,#8e24aa)', size: [1040, 720], single: true, mount, blurb: 'Speed reading, typing tests, missions and publishing' });
