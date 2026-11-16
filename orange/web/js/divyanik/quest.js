// QuestVerse: monthly missions by age band. Ordering, word-building and quiz missions are scored automatically;
// creative work (allocation plans, photos, talks, reflections) goes to a review desk where a parent or teacher
// scores it with a rubric. Software never scores creativity, as the scope requires.
import { h, sfx, fail } from '../core.js';
import { api } from '../api.js';
import { launch } from '../registry.js';
import { EDITION, TIERS, RUBRIC } from './data.js';
import { meter, stat, today, shuffle, pick, certificate, boxHas } from './common.js';

const MAX_TRIES = 3;
const KIND = { order: 'Sequence ordering', build: 'Word builder', quiz: 'Picture & multiple choice', allocate: 'Resource allocation', submit: 'Photo / audio / video', reflect: 'Written reflection' };
const AUTO = new Set(['order', 'build', 'quiz']);
const MEDIA = /\.(png|jpe?g|gif|webp|heic|mp3|wav|ogg|m4a|webm|mp4|mov)$/i;

export function mount(el, { data: d, save }) {
  const Q = d.quest, band = d.profile.band;
  let timer = null;
  const stop = () => clearInterval(timer);
  const rec = id => (Q.done[id] ||= { tries: [], best: 0 });
  const completed = () => EDITION.missions.filter(m => { const r = Q.done[m.id]; return r && (r.best >= 50 || r.reviewed); }).length;
  const tierOf = n => [...TIERS].reverse().find(t => n >= t[1]);

  async function checkTier() {
    const t = tierOf(completed());
    if (t && Q.tier !== t[0]) { Q.tier = t[0]; save(); sfx('ok'); try { await certificate({ title: t[0], name: d.profile.name, lines: [`QuestVerse · ${EDITION.name}`, `${completed()} missions completed`], kind: 'quest' }); } catch { /* notified */ } }
  }

  function home() {
    stop();
    const n = completed(), pending = Q.subs.filter(s => s.status === 'review').length;
    el.replaceChildren(
      h('div', { class: 'dn-hero quest' }, h('div', {}, h('small', {}, `${EDITION.name} · ages ${band}`), h('h2', {}, EDITION.theme), h('p', {}, `${n} of ${EDITION.missions.length} missions complete`)),
        h('div', { class: 'dn-badges' }, TIERS.map(([name, need, e]) => h('span', { class: 'dn-badge' + (n >= need ? ' on' : ''), title: `${name}: ${need} missions` }, h('i', {}, e), h('small', {}, name.replace('PRISM ', '')))))),
      h('div', { class: 'dn-missions' }, EDITION.missions.map(m => {
        const r = Q.done[m.id], sub = [...Q.subs].reverse().find(s => s.mission === m.id);
        const status = AUTO.has(m.kind) ? (r?.tries.length ? `Best ${r.best}% · ${MAX_TRIES - r.tries.length} tries left` : 'Not started') : sub ? (sub.status === 'review' ? '⏳ Waiting for review' : `✅ Reviewed: ${sub.pct}%`) : 'Not started';
        return h('button', { class: 'dn-mission', onclick: () => open(m) }, h('span', { class: 'dn-mission-e' }, m.icon), h('b', {}, m.title), h('small', {}, `${KIND[m.kind]} · ${m.skill}`), h('em', {}, AUTO.has(m.kind) ? '⚡ scored automatically' : '🧑‍🏫 scored by a reviewer'), h('i', {}, status));
      })),
      h('div', { class: 'dn-card dn-note' }, h('b', {}, '🧑‍🏫 Review desk'), h('p', {}, 'Creative missions are scored by a parent or teacher, using the same four-part rubric for everyone.'),
        h('button', { class: 'btn', onclick: desk }, pending ? `Open the review desk (${pending} waiting)` : 'Open the review desk')));
  }

  function frame(m, stage, ...kids) {
    el.replaceChildren(h('div', { class: 'dn-card dn-mission-screen' },
      h('div', { class: 'dn-mission-head' }, h('button', { class: 'tbtn', onclick: home, 'aria-label': 'Back' }, '←'), h('span', { class: 'dn-mission-e' }, m.icon), h('div', {}, h('b', {}, m.title), h('small', {}, `${KIND[m.kind]} · ${m.skill}`))),
      h('ol', { class: 'dn-stages' }, ['Read the brief', 'Do the mission', 'Check', 'Reflect'].map((s, i) => h('li', { class: i < stage ? 'done' : i === stage ? 'on' : '' }, s))),
      h('p', { class: 'dn-brief' }, m.how), ...kids));
    el.scrollTop = 0;
  }

  function open(m) {
    const r = rec(m.id);
    if (AUTO.has(m.kind) && r.tries.length >= MAX_TRIES) return frame(m, 3, h('p', {}, `You have used all ${MAX_TRIES} tries for this edition. Best score: ${r.best}%.`), growth(r), h('button', { class: 'btn', onclick: home }, 'Back'));
    ({ order: tilesMission, build: tilesMission, quiz: quizMission, allocate, submit, reflect })[m.kind](m);
  }

  // ---- sequence ordering and sentence building share one tile board
  function tilesMission(m) {
    const target = m.kind === 'order' ? pick(m.versions(band)) : pick(m.versions(band)).split(' ');
    let pool = shuffle(target.map((t, i) => [t, i])); if (pool.every(([, i], k) => i === k)) pool = pool.reverse();
    const answer = [], ans = h('div', { class: 'qv-answer' }), tiles = h('div', { class: 'qv-tiles' });
    const paint = () => {
      ans.replaceChildren(...(answer.length ? answer.map(([t, i], k) => h('button', { class: 'qv-tile on', onclick: () => { pool.push(answer.splice(k, 1)[0]); paint(); } }, m.kind === 'order' ? `${k + 1}. ${t}` : t)) : [h('span', { class: 'muted' }, m.kind === 'order' ? 'Tap the steps in order…' : 'Tap the words to build the sentence…')]));
      tiles.replaceChildren(...pool.map((p, k) => h('button', { class: 'qv-tile', onclick: () => { answer.push(pool.splice(k, 1)[0]); sfx('tick'); paint(); } }, p[0])));
      check.disabled = !!pool.length;
    };
    const check = h('button', { class: 'btn primary', onclick: () => finish(m, Math.round((answer.filter(([, i], k) => i === k).length / target.length) * 100), m.kind === 'order' ? target.map((t, i) => `${i + 1}. ${t}`).join('  ') : target.join(' ')) }, 'Check my answer');
    frame(m, 1, ans, tiles, check); paint();
  }

  function quizMission(m) {
    const qs = shuffle(m.versions(band)).slice(0, 5), right = []; let i = 0;
    const show = () => {
      if (i >= qs.length) return finish(m, Math.round((right.filter(Boolean).length / qs.length) * 100));
      const [q, good, ...bad] = qs[i], emo = [...good].length <= 2;
      frame(m, 1, h('div', { class: 'qz-prog' }, h('i', { style: { width: `${(i / qs.length) * 100}%` } })), h('h3', {}, q),
        h('div', { class: 'dn-opts' + (emo ? ' emo' : '') }, shuffle([good, ...bad]).map(a => h('button', { class: 'qz-a', onclick: e => { right.push(a === good); e.currentTarget.classList.add(a === good ? 'good' : 'bad'); sfx(a === good ? 'ok' : 'error'); i++; setTimeout(show, 500); } }, a))));
    };
    show();
  }

  function finish(m, pct, solution) {
    const r = rec(m.id); r.tries.push({ pct, date: today() }); r.best = Math.max(r.best, pct); save(); sfx(pct >= 50 ? 'ok' : 'pop');
    frame(m, 3, h('div', { class: 'dn-stats' }, stat(`${pct}%`, 'this try'), stat(`${r.best}%`, 'best'), stat(MAX_TRIES - r.tries.length, 'tries left')),
      solution && pct < 100 ? h('p', { class: 'dn-cmp' }, 'The right order: ', solution) : null, growth(r),
      h('div', { class: 'nm-btns' }, r.tries.length < MAX_TRIES ? h('button', { class: 'btn primary', onclick: () => open(m) }, 'Try a new version') : null, h('button', { class: 'btn', onclick: home }, 'Back to missions')));
    checkTier();
  }
  const growth = r => (r.tries.length > 1 ? h('p', { class: 'dn-cmp' }, `📈 Growth: ${r.tries.at(-1).pct - r.tries[0].pct >= 0 ? '+' : ''}${r.tries.at(-1).pct - r.tries[0].pct} points since your first try`) : null);

  // ---- creative missions: saved into the box and sent to the review desk
  async function sendForReview(m, sub) {
    const lines = [`# ${m.title}`, '', `*${EDITION.name} · ${d.profile.name} · ages ${band} · ${today()}*`, '', `**Brief:** ${m.how}`, ''];
    if (sub.alloc) lines.push('| Area | Points |', '|---|---|', ...sub.alloc.map(([k, v]) => `| ${k} | ${v} |`), '');
    if (sub.file) lines.push(`**Attached:** ${sub.file}`, '');
    lines.push(sub.text || '');
    try {
      const r = await api.post('write', { path: `/DivyaNik/QuestVerse/${m.title} - ${today()}.md`, text: lines.join('\n'), unique: true });
      Q.subs.push({ id: Math.random().toString(36).slice(2, 9), mission: m.id, title: m.title, date: today(), status: 'review', path: r.path, ...sub });
      save(); sfx('ok');
      frame(m, 3, h('p', {}, '📨 Sent to the review desk. A parent or teacher will score it with the rubric.'), h('p', { class: 'muted' }, `Saved in your box: ${r.path}`),
        h('div', { class: 'nm-btns' }, h('button', { class: 'btn primary', onclick: desk }, 'Open the review desk'), h('button', { class: 'btn', onclick: home }, 'Back to missions')));
    } catch (e) { fail(e); }
  }
  const words = t => (t.trim().match(/\S+/g) || []).length;

  function allocate(m) {
    const cats = m.versions(band)[0].map(([k]) => [k, 0]), why = h('textarea', { class: 'field dn-text', placeholder: 'Why did you share the points this way?' });
    const total = h('b', { class: 'qv-total' }), rows = h('div', { class: 'qv-alloc' }), send = h('button', { class: 'btn primary', onclick: () => sendForReview(m, { alloc: cats.map(c => [...c]), text: why.value.trim() }) }, 'Send my plan');
    const paint = () => { const t = cats.reduce((s, c) => s + c[1], 0); total.textContent = `${t} / 100`; total.classList.toggle('ok', t === 100); send.disabled = t !== 100 || words(why.value) < 8; };
    cats.forEach(c => { const out = h('output', {}, '0'); rows.append(h('label', { class: 'qv-row' }, h('span', {}, c[0]), h('input', { type: 'range', min: 0, max: 100, step: 5, value: 0, oninput: e => { c[1] = +e.target.value; out.textContent = c[1]; paint(); } }), out)); });
    why.addEventListener('input', paint);
    frame(m, 1, rows, h('p', {}, 'Total: ', total, h('small', { class: 'muted' }, ' (must be exactly 100)')), why, send); paint();
  }

  async function submit(m) {
    let file = null;
    const chosen = h('div', { class: 'qv-file muted' }, 'No file added yet.'), text = h('textarea', { class: 'field dn-text', placeholder: m.media === 'photo' ? 'What did you make, and what was it before?' : 'Write your main points' });
    const send = h('button', { class: 'btn primary', onclick: () => sendForReview(m, { file, text: text.value.trim() }) }, 'Send for review');
    const paint = () => { send.disabled = !file || words(text.value) < 8; };
    const pickFrom = async () => {
      const found = [];
      for (const dir of ['/Pictures', '/Inbox', '/Downloads', '/Documents', '/DivyaNik/QuestVerse']) { if (!(await boxHas(dir))) continue; try { found.push(...(await api.get('list', { path: dir })).items.filter(i => !i.dir && MEDIA.test(i.name) && (m.media === 'photo' ? /\.(png|jpe?g|gif|webp|heic)$/i.test(i.name) : !/\.(png|jpe?g|gif|webp|heic)$/i.test(i.name)))); } catch { /* folder missing */ } }
      list.replaceChildren(...(found.length ? found.slice(0, 40).map(f => h('button', { class: 'pick-row', onclick: () => { file = f.path; chosen.textContent = `📎 ${f.path}`; list.replaceChildren(); paint(); } }, f.name)) : [h('small', { class: 'muted' }, 'Nothing found. Add the file to your box first (use Files, or the button below).')]));
    };
    const input = h('input', { type: 'file', hidden: true, accept: m.media === 'photo' ? 'image/*' : 'audio/*,video/*', onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > (m.media === 'photo' ? 25 : 200) * 1048576) return fail(new Error(`That file is too big (limit ${m.media === 'photo' ? 25 : 200} MB).`));
      try { const r = await api.upload(`/DivyaNik/QuestVerse/${f.name}`, f); file = r.path; chosen.textContent = `📎 ${r.path}`; paint(); } catch (er) { fail(er); }
    } });
    const list = h('div', { class: 'pick-list qv-pick' });
    const kids = [h('div', { class: 'nm-btns' }, h('button', { class: 'btn', onclick: pickFrom }, `Choose a ${m.media === 'photo' ? 'photo' : 'recording'} from the box`), h('button', { class: 'btn', onclick: () => input.click() }, 'Add from this computer')), input, list, chosen, text, send];
    if (m.timer) {
      const clock = h('b', { class: 'dn-clock big' }, `${m.timer}s`);
      kids.unshift(h('div', { class: 'qv-timer' }, h('span', {}, 'Practise your talk: '), clock, h('button', { class: 'btn', onclick: () => { stop(); let left = m.timer; clock.textContent = `${left}s`; timer = setInterval(() => { left--; clock.textContent = `${left}s`; if (left <= 0) { stop(); sfx('ok'); clock.textContent = 'Time!'; } }, 1000); } }, '▶ Start 90 seconds')));
    }
    text.addEventListener('input', paint);
    frame(m, 1, ...kids); paint();
  }

  function reflect(m) {
    const text = h('textarea', { class: 'field dn-text tall', placeholder: 'Start writing…' }), count = h('small', { class: 'muted' });
    const send = h('button', { class: 'btn primary', onclick: () => sendForReview(m, { text: text.value.trim() }) }, 'Send for review');
    const paint = () => { const n = words(text.value); count.textContent = `${n} words (at least ${m.minWords})`; send.disabled = n < m.minWords; };
    text.addEventListener('input', paint);
    frame(m, 1, text, count, send); paint(); text.focus();
  }

  // ---- review desk (a parent or teacher, on this computer)
  function desk() {
    stop();
    const waiting = Q.subs.filter(s => s.status === 'review'), done = Q.subs.filter(s => s.status !== 'review').slice(-10).reverse();
    el.replaceChildren(h('div', { class: 'dn-card' }, h('div', { class: 'dn-mission-head' }, h('button', { class: 'tbtn', onclick: home, 'aria-label': 'Back' }, '←'), h('b', {}, '🧑‍🏫 Review desk')),
      h('p', { class: 'muted' }, 'For a parent or teacher. Score each piece of work with the rubric: 0 = not yet, 4 = excellent.'),
      waiting.length ? h('div', { class: 'qv-subs' }, waiting.map(s => h('button', { class: 'pick-row', onclick: () => review(s) }, `⏳ ${s.title} · ${s.date}`))) : h('p', {}, 'Nothing is waiting for review.'),
      done.length ? h('div', {}, h('h3', {}, 'Already reviewed'), ...done.map(s => h('div', { class: 'qv-done' }, `✅ ${s.title} · ${s.date} · ${s.pct}%`, s.comment ? h('small', {}, ` “${s.comment}”`) : null))) : null));
  }
  function review(s) {
    const scores = RUBRIC.map(() => 2), comment = h('input', { class: 'field', placeholder: 'A kind comment for the learner (optional)' });
    const rows = RUBRIC.map(([name, hint], i) => h('div', { class: 'qv-rub' }, h('div', {}, h('b', {}, name), h('small', {}, hint)),
      h('div', { class: 'qv-pts' }, [0, 1, 2, 3, 4].map(v => h('button', { class: 'qv-pt' + (v === scores[i] ? ' on' : ''), onclick: e => { scores[i] = v; e.currentTarget.parentNode.querySelectorAll('.qv-pt').forEach((b, k) => b.classList.toggle('on', k === v)); } }, v)))));
    el.replaceChildren(h('div', { class: 'dn-card' }, h('div', { class: 'dn-mission-head' }, h('button', { class: 'tbtn', onclick: desk, 'aria-label': 'Back' }, '←'), h('b', {}, `Reviewing: ${s.title}`)),
      s.alloc ? h('table', { class: 'dn-table' }, s.alloc.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v)))) : null,
      s.file ? h('button', { class: 'btn', onclick: () => launch('lens', { path: s.file }) }, `📎 Open ${s.file.split('/').pop()}`) : null,
      s.text ? h('blockquote', { class: 'qv-quote' }, s.text) : null,
      h('button', { class: 'btn ghost', onclick: () => launch('code', { path: s.path }) }, 'Open the saved file'),
      h('h3', {}, 'Rubric'), ...rows, comment,
      h('button', { class: 'btn primary', onclick: () => {
        s.status = 'reviewed'; s.scores = [...scores]; s.comment = comment.value.trim(); s.pct = Math.round((scores.reduce((a, b) => a + b, 0) / (RUBRIC.length * 4)) * 100);
        const r = rec(s.mission); r.reviewed = true; r.best = Math.max(r.best, s.pct); save(); sfx('ok'); checkTier(); desk();
      } }, 'Save the review')));
  }

  home();
  return stop;
}
