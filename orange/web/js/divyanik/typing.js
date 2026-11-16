// Speed Typing: five levels, 30 s to 10 min tests, live WPM and accuracy, and a full report.
// Keystrokes are captured here with timestamps and the score is computed from that log once, at the end.
// Paste and drop are blocked; very regular timing or impossible bursts are flagged and never certified.
import { h, sfx } from '../core.js';
import { api } from '../api.js';
import { LEVELS, DURATIONS, TYPING } from './data.js';
import { chart, meter, stat, today, shuffle, certificate, boxHas } from './common.js';

let custom = null;
async function customPassages() {   // DivyaNik's own passages, if a teacher has put them in the box
  if (custom) return custom;
  try {
    const there = await boxHas('/DivyaNik/Typing passages.txt');
    custom = !there ? [] : (await api.text('/DivyaNik/Typing passages.txt')).split(/\n\s*\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 20); } catch { custom = []; }
  return custom;
}
const sd = a => { if (a.length < 2) return 0; const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };

export function mount(el, { data: d, save }) {
  const T = d.typing;
  let level = Math.min(T.sel || T.level, T.level), dur = T.dur || 60, cert = false, run = null;

  function home() {
    run?.stop(); run = null;
    const att = T.attempts, weak = Object.entries(T.weak).sort((a, b) => b[1] - a[1]).slice(0, 8);
    el.replaceChildren(
      h('div', { class: 'dn-card' }, h('h2', {}, '⌨️ Speed Typing'), h('p', { class: 'muted' }, 'Pass a level twice (in tests of 1 minute or longer) to unlock the next one. Keep your eyes on the screen!'),
        h('div', { class: 'dn-levels' }, LEVELS.map(L => {
          const open = L.n <= T.level, passes = T.passes[L.n] || 0;
          return h('button', { class: 'dn-level' + (L.n === level ? ' on' : '') + (open ? '' : ' locked'), disabled: !open, onclick: () => { level = L.n; T.sel = level; save(); home(); } },
            h('b', {}, open ? `Level ${L.n}` : '🔒'), h('span', {}, L.name), h('small', {}, `${L.wpm} WPM · ${L.acc}%`), h('i', {}, '●'.repeat(Math.min(2, passes)) + '○'.repeat(Math.max(0, 2 - passes))));
        })),
        h('div', { class: 'arc-chips' }, DURATIONS.map(([s, label]) => h('button', { class: 'arc-chip' + (s === dur ? ' on' : ''), onclick: () => { dur = s; T.dur = s; save(); home(); } }, `⏱ ${label}`))),
        h('label', { class: 'dn-check' }, h('input', { type: 'checkbox', checked: cert, onchange: e => (cert = e.target.checked) }), h('span', {}, 'Certificate test: separate passages, and a certificate if you pass (needs 1 minute or more)')),
        h('button', { class: 'btn primary dn-big-btn', onclick: test }, `▶ Start Level ${level} test`)),
      h('div', { class: 'dn-card' }, h('h3', {}, 'Your progress'),
        h('div', { class: 'dn-stats' }, stat(att.length, 'tests'), stat(att.length ? Math.max(...att.map(a => a.net)) : '–', 'best net WPM'), stat(att.length ? `${Math.max(...att.map(a => a.acc))}%` : '–', 'best accuracy')),
        chart(att.slice(-15).map(a => a.net), { label: 'Net words per minute', color: '#3949ab' }),
        weak.length ? h('div', {}, h('b', {}, 'Keys to practise '), h('span', { class: 'dn-keys' }, weak.map(([k, n]) => h('kbd', { title: `${n} mistakes` }, k === ' ' ? 'space' : k)))) : null,
        att.length ? h('table', { class: 'dn-table' }, h('tr', {}, ['Date', 'Level', 'Length', 'Net WPM', 'Accuracy', 'Score', ''].map(x => h('th', {}, x))),
          att.slice(-8).reverse().map(a => h('tr', {}, h('td', {}, a.date), h('td', {}, a.level), h('td', {}, DURATIONS.find(x => x[0] === a.dur)?.[1] || `${a.dur}s`), h('td', {}, a.net), h('td', {}, `${a.acc}%`), h('td', {}, a.score), h('td', {}, a.flagged ? '⚑ review' : a.pass ? '✅ pass' : '–'))))
          : null));
  }

  async function test() {
    const pool = cert ? TYPING.cert : [...TYPING[level], ...(await customPassages())];
    let text = ''; while (text.length < dur * 12) for (const p of shuffle(pool)) text += (text ? ' ' : '') + p;
    const spans = [...text].map(ch => h('span', {}, ch)), box = h('div', { class: 'ty-box' }, spans);
    const cap = h('textarea', { class: 'ty-cap', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Type here' });
    const live = { time: h('b', {}, `${dur}s`), wpm: h('b', {}, '0'), acc: h('b', {}, '100%') }, msg = h('div', { class: 'nm-info' }, 'Start typing: the clock starts with your first key.');
    const typed = [], log = []; let pos = 0, t0 = 0, tick = null, done = false;
    const mark = () => { spans.forEach(s => s.classList.remove('cur')); if (spans[pos]) { spans[pos].classList.add('cur'); const top = spans[pos].offsetTop; if (top > box.scrollTop + box.clientHeight - 40 || top < box.scrollTop) box.scrollTop = top - 40; } };
    const block = e => { e.preventDefault(); msg.textContent = 'Pasting and dropping text are turned off in tests.'; sfx('error'); };
    cap.addEventListener('paste', block); cap.addEventListener('drop', block); cap.addEventListener('beforeinput', e => { if (/paste|drop/i.test(e.inputType)) block(e); });
    cap.addEventListener('keydown', e => {
      if (done) return;
      if (e.ctrlKey || e.metaKey || e.altKey) { if (/^[vx]$/i.test(e.key)) e.preventDefault(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); if (pos > 0) { pos--; typed.pop(); spans[pos].className = ''; log.push({ t: performance.now() - t0, k: '⌫' }); mark(); } return; }
      if (e.key.length !== 1) return;
      e.preventDefault();
      if (!t0) { t0 = performance.now(); tick = setInterval(update, 250); }
      const ok = e.key === text[pos]; typed.push(e.key); log.push({ t: performance.now() - t0, k: e.key, ok, want: text[pos] });
      spans[pos].className = ok ? 'ok' : 'bad'; pos++; mark();
      if (pos >= text.length) finish();
    });
    const update = () => {
      const s = (performance.now() - t0) / 1000, left = Math.max(0, dur - s), keys = log.filter(x => x.k !== '⌫');
      live.time.textContent = `${Math.ceil(left)}s`; live.wpm.textContent = String(Math.round((typed.length / 5) / Math.max(s / 60, 1 / 60)));
      live.acc.textContent = `${keys.length ? Math.round((keys.filter(x => x.ok).length / keys.length) * 100) : 100}%`;
      if (left <= 0) finish();
    };
    const finish = () => { if (done) return; done = true; clearInterval(tick); result(score(text, typed, log, Math.min(dur, (performance.now() - t0) / 1000))); };
    run = { stop: () => { done = true; clearInterval(tick); } };
    el.replaceChildren(h('div', { class: 'dn-card ty' },
      h('div', { class: 'ty-live' }, h('span', {}, '⏱ ', live.time), h('span', {}, 'WPM ', live.wpm), h('span', {}, 'Accuracy ', live.acc), h('small', {}, `Level ${level} · ${LEVELS[level - 1].name}${cert ? ' · certificate test' : ''}`)),
      h('div', { class: 'ty-area', onclick: () => cap.focus() }, box, cap), msg,
      h('div', { class: 'nm-btns' }, h('button', { class: 'btn ghost', onclick: home }, 'Stop'), h('button', { class: 'btn', onclick: () => { if (t0) finish(); } }, 'Finish now'))));
    mark(); cap.focus();
  }

  function score(text, typed, log, secs) {
    const mins = Math.max(secs, 1) / 60, keys = log.filter(x => x.k !== '⌫'), right = keys.filter(x => x.ok).length;
    const uncorrected = typed.reduce((s, ch, i) => s + (ch !== text[i] ? 1 : 0), 0);
    const gross = Math.round((typed.length / 5) / mins), net = Math.max(0, Math.round((typed.length / 5 - uncorrected) / mins));
    const acc = keys.length ? Math.round((right / keys.length) * 1000) / 10 : 0;
    const bins = []; for (const x of keys) { const b = Math.floor(x.t / 5000); bins[b] = (bins[b] || 0) + 1; }
    const samples = Array.from({ length: Math.max(1, Math.floor(secs / 5)) }, (_, i) => bins[i] || 0), mean = samples.reduce((s, x) => s + x, 0) / samples.length;
    const cons = samples.length > 1 && mean ? Math.round(Math.max(0, Math.min(100, 100 - (sd(samples) / mean) * 100))) : 100;
    const gaps = keys.slice(1).map((x, i) => x.t - keys[i].t);
    const regular = gaps.length > 60 && sd(gaps) < 10, burst = keys.some((x, i) => i >= 10 && x.t - keys[i - 10].t < 120);
    const L = LEVELS[level - 1];
    const total = Math.round(50 * Math.min(1, net / (L.wpm * 1.25)) + 35 * Math.max(0, (acc - 70) / 30) + 15 * (cons / 100));
    const weak = {}; for (const x of keys) if (!x.ok) weak[x.want] = (weak[x.want] || 0) + 1;
    const flagged = regular || burst;
    return { secs, gross, net, acc, errors: keys.length - right, uncorrected, cons, score: Math.min(100, total), weak, flagged, why: regular ? 'very regular timing' : burst ? 'an impossibly fast burst' : '', pass: !flagged && dur >= 60 && net >= L.wpm && acc >= L.acc };
  }

  async function result(r) {
    const L = LEVELS[level - 1];
    for (const [k, n] of Object.entries(r.weak)) T.weak[k] = (T.weak[k] || 0) + n;
    let unlocked = false, certPath = null;
    if (r.pass) { T.passes[level] = (T.passes[level] || 0) + 1; if (T.passes[level] >= 2 && level === T.level && level < 5) { T.level++; unlocked = true; } }
    T.attempts.push({ date: today(), level, dur, gross: r.gross, net: r.net, acc: r.acc, errors: r.errors, cons: r.cons, score: r.score, pass: r.pass, flagged: r.flagged, cert });
    if (T.attempts.length > 300) T.attempts.splice(0, T.attempts.length - 300);
    save(); sfx(r.pass ? 'ok' : 'pop');
    const weakNow = Object.entries(r.weak).sort((a, b) => b[1] - a[1]).slice(0, 6);
    el.replaceChildren(h('div', { class: 'dn-card' }, h('h2', {}, r.pass ? '🎉 Level passed!' : '📊 Your typing report'),
      r.flagged ? h('p', { class: 'dn-warn' }, `⚑ This test showed ${r.why}, so it is flagged for a teacher to check and does not count towards levels or certificates.`) : null,
      h('div', { class: 'dn-stats' }, stat(r.net, 'net WPM', `gross ${r.gross}`), stat(`${r.acc}%`, 'accuracy', `${r.errors} wrong keys`), stat(r.cons, 'consistency', 'steady speed'), stat(`${r.score}/100`, 'score')),
      meter(`Speed: you need ${L.wpm} net WPM`, (r.net / L.wpm) * 100, r.net >= L.wpm ? '#2ecc71' : '#ffb300', `${r.net} / ${L.wpm}`),
      meter(`Accuracy: you need ${L.acc}%`, r.acc, r.acc >= L.acc ? '#2ecc71' : '#ffb300', `${r.acc}%`),
      dur < 60 ? h('p', { class: 'muted' }, 'Tests shorter than a minute are for practice: they don\'t count towards passing a level.') : null,
      h('p', {}, r.pass ? `Passes at Level ${level}: ${Math.min(2, T.passes[level])} of 2.` : 'Keep practising: accuracy first, then speed.', unlocked ? h('b', {}, ` Level ${T.level} is now unlocked! 🔓`) : null),
      weakNow.length ? h('div', {}, h('b', {}, 'Keys you missed '), h('span', { class: 'dn-keys' }, weakNow.map(([k, n]) => h('kbd', { title: `${n}×` }, k === ' ' ? 'space' : k)))) : null,
      h('h3', {}, 'Progress'), chart(T.attempts.slice(-15).map(a => a.net), { label: 'Net WPM', color: '#3949ab' }),
      h('div', { class: 'nm-btns' }, h('button', { class: 'btn primary', onclick: test }, 'Try again'), h('button', { class: 'btn', onclick: home }, 'Back'))));
    if (cert && r.pass) { try { certPath = await certificate({ title: `Speed Typing Level ${level}`, name: d.profile.name, lines: [`${L.name} · ${r.net} net WPM · ${r.acc}% accuracy`, `${DURATIONS.find(x => x[0] === dur)[1]} test · score ${r.score}/100`] }); } catch { /* shown by notify */ } }
    return certPath;
  }

  home();
  return () => run?.stop();
}
