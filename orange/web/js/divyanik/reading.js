// Speed Reading: a timed passage, then a quiz with the passage hidden, then a report.
// WPM = words ÷ minutes the passage was open, so it is shown as an estimate. Reading aloud (accuracy and
// expression) is rated by a parent or teacher and kept apart from the automatic score, as the scope asks.
import { h, sfx } from '../core.js';
import { PASSAGES, PATHWAYS, DIMS } from './data.js';
import { chart, meter, stat, today, shuffle, pick } from './common.js';

const words = t => t.trim().split(/\s+/).length;

export function mount(el, { data: d, save }) {
  let path = d.profile.path || (['4–6', '7–9', '10–12'].includes(d.profile.band) ? 'junior' : ['13–15', '16–18'].includes(d.profile.band) ? 'academic' : 'professional');
  let timer = null;
  const stop = () => clearInterval(timer);

  function home() {
    stop();
    const mine = d.reading.filter(r => r.path === path);
    el.replaceChildren(
      h('div', { class: 'dn-card' }, h('h2', {}, '📖 Speed Reading'), h('p', { class: 'muted' }, 'Read a passage at your normal pace, then answer questions without looking back. You get your reading speed and how well you understood it.'),
        h('div', { class: 'arc-chips' }, PATHWAYS.map(([id, name, sub]) => h('button', { class: 'arc-chip' + (id === path ? ' on' : ''), onclick: () => { path = id; d.profile.path = id; save(); home(); } }, `${name} · ${sub}`))),
        h('button', { class: 'btn primary dn-big-btn', onclick: () => ready(next()) }, '▶ Start a timed passage')),
      h('div', { class: 'dn-card' }, h('h3', {}, 'Your progress'), h('div', { class: 'dn-stats' },
        stat(mine.length, 'passages read'), stat(mine.length ? Math.max(...mine.map(r => r.wpm)) : '–', 'best WPM'), stat(mine.length ? `${Math.round((mine.reduce((s, r) => s + r.score, 0) / mine.length) * 100)}%` : '–', 'average quiz')),
        chart(mine.slice(-15).map(r => r.wpm), { label: 'Words per minute', color: '#00897b' }),
        mine.length ? h('table', { class: 'dn-table' }, h('tr', {}, ['Date', 'Passage', 'WPM', 'Quiz', 'Effective'].map(x => h('th', {}, x))), mine.slice(-8).reverse().map(r => h('tr', {}, h('td', {}, r.date), h('td', {}, r.title), h('td', {}, r.wpm), h('td', {}, `${Math.round(r.score * 100)}%`), h('td', {}, Math.round(r.wpm * r.score))))) : null));
  }
  function next() {   // random passage, avoiding the last ones read so answers are not memorised
    const recent = new Set(d.reading.slice(-3).map(r => r.id)), pool = PASSAGES.filter(p => p.path === path);
    return pick(pool.filter(p => !recent.has(p.id)).length ? pool.filter(p => !recent.has(p.id)) : pool);
  }
  function ready(p) {
    el.replaceChildren(h('div', { class: 'dn-card dn-center' }, h('h2', {}, p.title), h('p', { class: 'muted' }, `${words(p.text)} words · ${PATHWAYS.find(x => x[0] === p.path)[1]}`),
      h('p', {}, 'Read at your normal speed, the way you would read a book. The clock starts when you press Start and stops when you press “I\'ve finished”.'),
      h('button', { class: 'btn primary dn-big-btn', onclick: () => read(p) }, '▶ Start reading'), h('button', { class: 'btn ghost', onclick: home }, 'Back')));
  }
  function read(p) {
    const t0 = performance.now(), clock = h('span', { class: 'dn-clock' }, '0:00');
    timer = setInterval(() => { const s = Math.floor((performance.now() - t0) / 1000); clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
    el.replaceChildren(h('div', { class: 'dn-card dn-reader' }, h('div', { class: 'dn-reader-top' }, h('h2', {}, p.title), clock),
      ...p.text.split(/\n\s*\n/).map(par => h('p', {}, par)),
      h('button', { class: 'btn primary dn-big-btn', onclick: () => { stop(); quiz(p, (performance.now() - t0) / 1000); } }, '✓ I\'ve finished reading')));
    el.scrollTop = 0;
  }
  function quiz(p, secs) {
    const qs = shuffle(p.qs).slice(0, 5), answers = [];
    let i = 0;
    const show = () => {
      if (i >= qs.length) return report(p, secs, qs, answers);
      const q = qs[i], opts = shuffle(q.a.map((a, k) => [a, k]));
      el.replaceChildren(h('div', { class: 'dn-card dn-quiz' }, h('div', { class: 'qz-prog' }, h('i', { style: { width: `${(i / qs.length) * 100}%` } })),
        h('small', { class: 'dn-dim' }, DIMS.find(x => x[0] === q.d)[1]), h('h3', {}, q.q),
        h('div', { class: 'dn-opts' }, opts.map(([a, k]) => h('button', { class: 'qz-a', onclick: e => { answers.push(k === q.c); e.currentTarget.classList.add(k === q.c ? 'good' : 'bad'); sfx(k === q.c ? 'ok' : 'error'); i++; setTimeout(show, 450); } }, a)))));
    };
    show();
  }
  function report(p, secs, qs, answers) {
    const n = words(p.text), wpm = Math.round(n / (secs / 60)), score = answers.filter(Boolean).length / answers.length;
    const plausible = secs >= 8 && wpm <= 900;
    const dims = {}; qs.forEach((q, k) => { dims[q.d] ||= [0, 0]; dims[q.d][1]++; if (answers[k]) dims[q.d][0]++; });
    const prev = d.reading.filter(r => r.path === p.path).at(-1);
    if (plausible) { d.reading.push({ id: p.id, title: p.title, path: p.path, words: n, secs: Math.round(secs), wpm, score, dims, date: today() }); save(); }
    const diff = (a, b, unit = '') => (b == null ? '' : `${a - b >= 0 ? '+' : ''}${a - b}${unit} since last time`);
    const rate = (label, key) => h('label', { class: 'dn-rate' }, h('span', {}, label), h('input', { type: 'range', min: 1, max: 5, value: 3, onchange: e => { d.rated.push({ id: p.id, date: today(), [key]: +e.target.value }); save(); sfx('tick'); } }));
    el.replaceChildren(
      h('div', { class: 'dn-card' }, h('h2', {}, '📊 Your reading report'), h('p', { class: 'muted' }, p.title),
        plausible ? null : h('p', { class: 'dn-warn' }, 'That was too fast to be real reading, so this attempt is not counted in your progress.'),
        h('div', { class: 'dn-stats' }, stat(wpm, 'words per minute', 'estimate: how long the page was open'), stat(`${Math.round(score * 100)}%`, 'understood', `${answers.filter(Boolean).length} of ${answers.length} right`), stat(Math.round(wpm * score), 'effective WPM', 'speed × understanding')),
        prev && plausible ? h('p', { class: 'dn-cmp' }, `${diff(wpm, prev.wpm, ' WPM')} · ${diff(Math.round(score * 100), Math.round(prev.score * 100), '% understanding')}`) : null,
        h('h3', {}, 'Skills'), ...DIMS.filter(([k]) => dims[k]).map(([k, name], i) => meter(name, (dims[k][0] / dims[k][1]) * 100, ['#00897b', '#7e57c2', '#ff8a1f', '#1e88e5'][i], `${dims[k][0]}/${dims[k][1]}`)),
        h('h3', {}, 'Progress'), chart(d.reading.filter(r => r.path === p.path).slice(-15).map(r => r.wpm), { label: 'Words per minute', color: '#00897b' }),
        h('div', { class: 'nm-btns' }, h('button', { class: 'btn primary', onclick: () => ready(next()) }, 'Read another'), h('button', { class: 'btn', onclick: home }, 'Done'))),
      h('div', { class: 'dn-card dn-note' }, h('b', {}, 'Reading aloud (for a parent or teacher)'), h('p', {}, 'Listen to the learner read part of the passage aloud and rate it. This is a human rating, kept apart from the automatic score above.'),
        rate('Accuracy', 'accuracy'), rate('Expression', 'expression')));
    el.scrollTop = 0;
  }
  home();
  return stop;
}
