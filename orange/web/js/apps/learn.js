// Learn: English, Tamil and numbers for kids — listen, write, speak, read and picture puzzles.
// Progress (stars and levels) is stored encrypted in the box; writing practice is saved as pictures in /Learning.
import { api } from '../api.js';
import { h, icon, ico, sfx, notify, anim, EASE, debounce } from '../core.js';
import { register } from '../registry.js';
import { LANGS, READING } from '../learn/data.js';
import { shuffle, pick } from '../arcade/engine.js';

// ---------------------------------------------------------------- progress
let P = null;
async function loadP() {
  if (P) return P;
  try { P = await api.get('kv', { key: 'learn' }); } catch { P = {}; }
  P.stars ||= {}; P.level ||= { en: 1, ta: 1 }; P.minutes ||= 0;
  return P;
}
const saveP = debounce(async () => {
  try {
    await api.post('kv', { key: 'learn', value: P });
    const total = Object.values(P.stars).reduce((a, b) => a + b, 0);
    const lines = Object.entries(P.stars).sort().map(([k, v]) => `- ${k.replace(/:/g, ' · ')}: ${'★'.repeat(v)}${'☆'.repeat(3 - v)}`);
    await api.post('write', { path: '/Learning/My progress.md', text: `# My learning progress\n\nStars: **${total}** · English reading level ${P.level.en} · Tamil reading level ${P.level.ta}\n\nUpdated ${new Date().toLocaleString()}\n\n${lines.join('\n')}\n` });
  } catch { /* box locked */ }
}, 800);
function award(key, stars) {
  const prev = P.stars[key] || 0;
  if (stars > prev) { P.stars[key] = stars; saveP(); }
  return Math.max(prev, stars);
}
const starsOf = prefix => Object.entries(P.stars).filter(([k]) => k.startsWith(prefix)).reduce((a, [, v]) => a + v, 0);
const starRow = n => h('span', { class: 'ln-stars' }, '★'.repeat(n), h('i', {}, '☆'.repeat(3 - n)));

// ---------------------------------------------------------------- voice out (text to speech)
function voiceFor(lang) {
  const vs = speechSynthesis?.getVoices?.() || [];
  return vs.find(v => v.lang?.toLowerCase().replace('_', '-') === lang.toLowerCase()) || vs.find(v => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
}
function say(text, lang) {
  if (!('speechSynthesis' in window)) return false;
  const v = voiceFor(lang);
  if (!v && lang.startsWith('ta')) return false;
  const u = new SpeechSynthesisUtterance(text);
  if (v) u.voice = v;
  u.lang = lang; u.rate = 0.85; u.pitch = 1.1;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
  return true;
}
const noTamilVoice = () => notify({ title: 'No Tamil voice on this computer', body: 'Windows: Settings → Time & language → Speech → Add voices → Tamil', icon: 'sound' });
if ('speechSynthesis' in window) speechSynthesis.getVoices();

// ---------------------------------------------------------------- voice in (speech recognition)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen(lang) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('Speech recognition is not available in this browser'));
    const r = new SR();
    r.lang = lang; r.maxAlternatives = 5; r.interimResults = false;
    let done = false;
    r.onresult = e => { done = true; resolve([...e.results[0]].map(a => a.transcript)); };
    r.onerror = e => { done = true; reject(new Error(e.error === 'not-allowed' ? 'Microphone permission was denied' : e.error === 'network' ? 'Speech check needs internet' : 'I could not hear that')); };
    r.onend = () => { if (!done) reject(new Error('I could not hear that')); };
    r.start();
    setTimeout(() => { try { r.stop(); } catch { /* ignore */ } }, 7000);
  });
}
const clean = s => s.toLowerCase().normalize('NFC').replace(/[.,!?'"“”‘’-]/g, ' ').replace(/\s+/g, ' ').trim();
function similar(a, b) {
  a = clean(a); b = clean(b);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

// ---------------------------------------------------------------- the app
const ACTS = [
  ['cards', 'Learn', 'book', '📖', 'Tap each card to see and hear it'],
  ['listen', 'Listen', 'sound', '👂', 'Hear it, then find it'],
  ['write', 'Write', 'edit', '✏️', 'Trace the letters with your finger'],
  ['speak', 'Speak', 'mic', '🎤', 'Say the word out loud'],
  ['read', 'Read', 'text', '📚', 'Read words and sentences'],
  ['match', 'Picture Puzzle', 'image', '🧩', 'Match letters and pictures'],
];

function mount(win) {
  const root = h('div', { class: 'ln' });
  win.body.append(root);
  let cleanup = () => {};
  win.destroy = () => { cleanup(); speechSynthesis?.cancel?.(); };
  const t0 = Date.now();
  const timeT = setInterval(() => { if (P && win.state !== 'min') { P.minutes += 1; saveP(); } }, 60000);
  const prevDestroy = win.destroy;
  win.destroy = () => { clearInterval(timeT); prevDestroy(); };

  const head = (title, back) => h('header', { class: 'tb ln-head', 'data-drag': '' },
    back ? h('button', { class: 'tbtn', title: 'Back', html: icon('left'), onclick: back }) : h('span', { class: 'ln-logo' }, '🎓'),
    h('b', {}, title), h('div', { class: 'grow' }), h('span', { class: 'ln-total' }, '⭐ ', starsOf('')));
  const screen = (title, back, ...body) => {
    cleanup(); cleanup = () => {};
    root.replaceChildren(head(title, back), h('div', { class: 'ln-body' }, ...body));
    anim(root.lastChild, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE.out });
  };

  // ---- home
  async function home() {
    await loadP();
    win.setTitle('Learn');
    win.setStatus(`${starsOf('')} stars · ${P.minutes} minutes learning`);
    screen('Learn', null,
      h('div', { class: 'ln-hero' }, h('div', {}, h('h2', {}, 'Let’s learn! 🌈'), h('p', {}, 'English, தமிழ் and numbers. Every star is saved in your box.')), h('div', { class: 'ln-hero-e' }, '🦉')),
      h('div', { class: 'ln-langs' }, Object.entries(LANGS).map(([id, L], i) => h('button', { class: 'ln-lang', style: { '--c': ['#ff8a1f', '#e8457f', '#2fb8ff'][i] }, onclick: () => menu(id) },
        h('span', { class: 'ln-flag', style: { fontFamily: L.font } }, L.flag), h('b', {}, L.name), h('small', {}, `⭐ ${starsOf(id + ':')}`)))),
      h('div', { class: 'ln-tip' }, ico('info', 16), h('span', {}, 'Your writing pictures and a progress report are kept in the ', h('b', {}, 'Learning'), ' folder of your box.')));
  }

  // ---- activity menu for a language
  function menu(lang) {
    const L = LANGS[lang];
    win.setTitle(`Learn · ${L.name}`);
    const acts = ACTS.filter(([id]) => !(lang === 'num' && id === 'read'));
    screen(L.name, home, h('div', { class: 'ln-acts' }, acts.map(([id, name, , e, sub], i) => h('button', { class: 'ln-act', style: { '--c': ['#ff8a1f', '#7e57c2', '#43a047', '#e8457f', '#2fb8ff', '#ffb000'][i] }, onclick: () => ACT[id](lang) },
      h('span', { class: 'ln-act-e' }, e), h('b', {}, name), h('small', {}, sub), h('em', {}, `⭐ ${starsOf(`${lang}:${id}`)}`)))));
  }
  const items = lang => LANGS[lang].sets.flatMap(s => s[2]);
  const big = (lang, text, cls = '') => h('div', { class: `ln-big ${cls}`, style: { fontFamily: LANGS[lang].font } }, text);
  const speakItem = (lang, text) => { if (!say(text, LANGS[lang].speech) && lang === 'ta') noTamilVoice(); };

  // ---- shared round runner: n rounds, each returns true/false; stars at the end
  function rounds(lang, key, title, n, renderRound) {
    let i = 0, right = 0;
    const area = h('div', { class: 'ln-round' }), prog = h('div', { class: 'qz-prog' }, h('i'));
    screen(title, () => menu(lang), prog, area);
    const next = () => {
      if (i >= n) {
        const stars = right >= n * 0.9 ? 3 : right >= n * 0.7 ? 2 : right >= n * 0.5 ? 1 : 0;
        const best = award(`${lang}:${key}`, stars);
        sfx(stars ? 'ok' : 'error');
        area.replaceChildren(h('div', { class: 'ln-done' }, h('div', { class: 'ln-done-e' }, stars >= 2 ? '🏆' : stars ? '👍' : '💪'),
          h('h3', {}, `${right} of ${n} right!`), starRow(stars), h('small', {}, `best: ${'★'.repeat(best)}`),
          h('div', { class: 'empty-acts' }, h('button', { class: 'btn primary', onclick: () => rounds(lang, key, title, n, renderRound) }, 'Play again'), h('button', { class: 'btn', onclick: () => menu(lang) }, 'Back'))));
        return;
      }
      i++; prog.firstChild.style.width = `${((i - 1) / n) * 100}%`;
      renderRound(area, ok => { if (ok) { right++; sfx('ok'); } else sfx('error'); setTimeout(next, ok ? 700 : 1300); });
    };
    next();
  }

  const ACT = {
    // 1. cards
    cards(lang) {
      const list = items(lang);
      const grid = h('div', { class: 'ln-grid' }, list.map(([s, w, e], k) => h('button', { class: 'ln-cell', style: { fontFamily: LANGS[lang].font, '--c': `hsl(${k * 23 % 360},80%,60%)` }, onclick: () => card(k) }, s)));
      screen(`${LANGS[lang].name} · Learn`, () => menu(lang), grid);
      function card(k) {
        const [s, w, e, m] = list[k];
        award(`${lang}:cards`, 1);
        const box = h('div', { class: 'ln-card' }, big(lang, s), h('div', { class: 'ln-emoji' }, e), h('div', { class: 'ln-word', style: { fontFamily: LANGS[lang].font } }, w), m ? h('small', {}, m) : null,
          h('div', { class: 'empty-acts' },
            h('button', { class: 'btn', onclick: () => card((k - 1 + list.length) % list.length) }, ico('left', 16)),
            h('button', { class: 'btn primary', onclick: () => speakItem(lang, `${s}. ${w}`) }, ico('sound', 16), 'Hear it'),
            h('button', { class: 'btn', onclick: () => card((k + 1) % list.length) }, ico('right', 16))));
        screen(`${LANGS[lang].name} · ${s}`, () => ACT.cards(lang), box);
        speakItem(lang, `${s}. ${w}`);
      }
    },
    // 2. listen & find
    listen(lang) {
      const list = items(lang);
      rounds(lang, 'listen', 'Listen & find', 10, (area, done) => {
        const [s, w, e] = pick(list);
        const opts = shuffle([s, ...shuffle(list.filter(x => x[0] !== s)).slice(0, 3).map(x => x[0])]);
        const canSpeak = say(`${s}`, LANGS[lang].speech);
        area.replaceChildren(
          h('div', { class: 'ln-q' }, canSpeak ? h('button', { class: 'ln-speaker', onclick: () => say(`${s}`, LANGS[lang].speech) }, '🔊') : h('div', { class: 'ln-emoji' }, e),
            h('p', {}, canSpeak ? 'Which one did you hear?' : `Which letter does ${w} start with?`)),
          h('div', { class: 'ln-opts' }, opts.map(o => h('button', { class: 'ln-opt', style: { fontFamily: LANGS[lang].font }, onclick: ev => { ev.currentTarget.classList.add(o === s ? 'good' : 'bad'); done(o === s); } }, o))));
      });
    },
    // 3. write (trace)
    write(lang) {
      const list = items(lang);
      const grid = h('div', { class: 'ln-grid' }, list.map(([s], k) => h('button', { class: 'ln-cell', style: { fontFamily: LANGS[lang].font, '--c': `hsl(${k * 23 % 360},80%,60%)` }, onclick: () => trace(k) }, s, h('i', { class: 'ln-mini' }, '★'.repeat(P.stars[`${lang}:write:${s}`] || 0)))));
      screen('Write: pick a letter', () => menu(lang), grid);
      function trace(k) {
        const [s, w] = list[k];
        const W = 340, dpr = Math.min(1.5, devicePixelRatio || 1);
        const cv = h('canvas', { class: 'ln-canvas', width: W * dpr, height: W * dpr });
        const c = cv.getContext('2d'); c.scale(dpr, dpr);
        const font = LANGS[lang].font;
        const strokes = [];
        let cur = null;
        const fit = cx => { let size = 260; cx.font = `700 ${size}px ${font}`; const m = cx.measureText(s).width; if (m > W * 0.8) size *= (W * 0.8) / m; return size; };
        const guide = (cx, color, outline) => { const size = fit(cx); cx.font = `700 ${size}px ${font}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = color; cx.fillText(s, W / 2, W / 2 + size * 0.04); if (outline) { cx.lineWidth = outline; cx.strokeStyle = color; cx.lineJoin = 'round'; cx.strokeText(s, W / 2, W / 2 + size * 0.04); } };
        const paint = () => {
          c.fillStyle = '#fffaf2'; c.fillRect(0, 0, W, W);
          c.strokeStyle = 'rgba(255,138,31,.25)'; c.setLineDash([8, 8]); c.beginPath(); c.moveTo(0, W / 2); c.lineTo(W, W / 2); c.stroke(); c.setLineDash([]);
          guide(c, 'rgba(120,90,60,.18)');
          c.lineCap = c.lineJoin = 'round'; c.lineWidth = 20; c.strokeStyle = '#ff8a1f';
          for (const st of strokes) { c.beginPath(); st.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (st.length === 1) c.lineTo(st[0][0] + 0.1, st[0][1]); c.stroke(); }
        };
        const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * W / r.height]; };
        cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); cur = [pos(e)]; strokes.push(cur); paint(); };
        cv.onpointermove = e => { if (cur) { cur.push(pos(e)); paint(); } };
        cv.onpointerup = () => (cur = null);
        const result = h('div', { class: 'ln-result' }, 'Trace the letter, then press Check.');
        const check = async () => {
          if (!strokes.length) return;
          const off = new OffscreenCanvas(W, W), o = off.getContext('2d', { willReadFrequently: true });
          guide(o, '#000'); const mask = o.getImageData(0, 0, W, W).data;
          o.clearRect(0, 0, W, W); guide(o, '#000', 30); const near = o.getImageData(0, 0, W, W).data;
          o.clearRect(0, 0, W, W); o.lineCap = o.lineJoin = 'round'; o.lineWidth = 20; o.strokeStyle = '#000';
          for (const st of strokes) { o.beginPath(); st.forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y))); o.stroke(); }
          const ink = o.getImageData(0, 0, W, W).data;
          let m = 0, cov = 0, inkN = 0, out = 0;
          for (let i = 3; i < mask.length; i += 16) { const a = mask[i] > 128, b = ink[i] > 128; if (a) { m++; if (b) cov++; } if (b) { inkN++; if (near[i] < 128) out++; } }
          const score = Math.round(100 * (cov / Math.max(1, m)) - 70 * (out / Math.max(1, inkN)));
          const stars = score >= 62 ? 3 : score >= 45 ? 2 : score >= 28 ? 1 : 0;
          award(`${lang}:write:${s}`, stars);
          sfx(stars ? 'ok' : 'error');
          result.replaceChildren(starRow(stars), h('span', {}, stars === 3 ? ' Perfect writing!' : stars ? ' Good! Try again for more stars.' : ' Keep inside the letter and try again.'));
          if (stars) {
            cv.toBlob(b => api.upload(`/Learning/Writing/${LANGS[lang].name.split(' ')[0]} ${s}.png`, b, null, true).catch(() => {}), 'image/png');
          }
        };
        paint();
        screen(`Write ${s}`, () => ACT.write(lang), h('div', { class: 'ln-write' },
          h('div', { class: 'ln-wtop' }, big(lang, s, 'sm'), h('div', {}, h('b', { style: { fontFamily: font } }, w), h('small', {}, 'Follow the shape with your finger or mouse'))),
          cv, result,
          h('div', { class: 'empty-acts' },
            h('button', { class: 'btn', onclick: () => { strokes.length = 0; paint(); result.textContent = 'Trace the letter, then press Check.'; } }, ico('restore', 16), 'Clear'),
            h('button', { class: 'btn primary', onclick: check }, ico('check', 16), 'Check'),
            h('button', { class: 'btn', onclick: () => trace((k + 1) % list.length) }, 'Next', ico('right', 16)))));
        speakItem(lang, s);
      }
    },
    // 4. speak
    speak(lang) {
      const list = items(lang);
      if (!SR) notify({ title: 'Speech check not available', body: 'Use Microsoft Edge or Chrome with a microphone. You can still self-check.', icon: 'info' });
      rounds(lang, 'speak', 'Say it!', 8, (area, done) => {
        const [s, w, e] = pick(list);
        const word = lang === 'num' ? w : w;
        const msg = h('p', { class: 'ln-heard' }, SR ? 'Press the microphone and say the word' : 'Say the word out loud, then tick if you got it right');
        let tries = 0;
        const mic = h('button', { class: 'ln-mic', onclick: async () => {
          mic.classList.add('on'); msg.textContent = 'Listening… 👂';
          try {
            const alts = await listen(LANGS[lang].speech);
            const ok = alts.some(a => similar(a, word) >= 0.7);
            msg.textContent = `I heard: “${alts[0]}”`;
            mic.classList.remove('on');
            if (ok) done(true); else if (++tries >= 2) done(false); else { sfx('error'); msg.textContent += ' · try again!'; }
          } catch (err) { mic.classList.remove('on'); msg.textContent = err.message; }
        } }, '🎤');
        area.replaceChildren(h('div', { class: 'ln-q' }, h('div', { class: 'ln-emoji' }, e), h('div', { class: 'ln-word big', style: { fontFamily: LANGS[lang].font } }, word),
          h('button', { class: 'btn ghost', onclick: () => speakItem(lang, word) }, ico('sound', 16), 'Hear it first')),
          SR ? mic : h('div', { class: 'empty-acts' }, h('button', { class: 'btn primary', onclick: () => done(true) }, '✓ I said it'), h('button', { class: 'btn', onclick: () => done(false) }, 'Skip')), msg);
      });
    },
    // 5. read (levels)
    read(lang) {
      const levels = READING[lang];
      screen('Reading', () => menu(lang), h('div', { class: 'ln-levels' }, levels.map(L => {
        const open = L.level <= (P.level[lang] || 1);
        return h('button', { class: 'ln-level' + (open ? '' : ' locked'), disabled: !open, onclick: () => level(L) },
          h('span', { class: 'ln-lv' }, open ? L.level : '🔒'), h('b', { style: { fontFamily: LANGS[lang].font } }, L.name), starRow(P.stars[`${lang}:read:${L.level}`] || 0));
      })));
      function level(L) {
        let i = 0, right = 0;
        const list = shuffle(L.items).slice(0, Math.min(6, L.items.length));
        const area = h('div', { class: 'ln-round' }), prog = h('div', { class: 'qz-prog' }, h('i'));
        screen(`Read · level ${L.level}`, () => ACT.read(lang), prog, area);
        const next = () => {
          if (i >= list.length) {
            const stars = right === list.length ? 3 : right >= list.length - 1 ? 2 : right >= list.length / 2 ? 1 : 0;
            award(`${lang}:read:${L.level}`, stars);
            if (stars >= 2 && L.level === (P.level[lang] || 1) && L.level < levels.length) { P.level[lang] = L.level + 1; saveP(); notify({ title: `Level ${L.level + 1} unlocked! 🎉`, icon: 'star', tone: 'good' }); }
            award(`${lang}:read`, Math.max(...levels.map(x => P.stars[`${lang}:read:${x.level}`] || 0)));
            area.replaceChildren(h('div', { class: 'ln-done' }, h('div', { class: 'ln-done-e' }, stars >= 2 ? '📚' : '💪'), h('h3', {}, `You read ${right} of ${list.length}`), starRow(stars),
              h('div', { class: 'empty-acts' }, h('button', { class: 'btn primary', onclick: () => level(L) }, 'Again'), h('button', { class: 'btn', onclick: () => ACT.read(lang) }, 'Levels'))));
            return sfx(stars ? 'ok' : 'error');
          }
          const text = list[i++]; prog.firstChild.style.width = `${((i - 1) / list.length) * 100}%`;
          const msg = h('p', { class: 'ln-heard' }, SR ? 'Read it out loud, then press the microphone' : 'Read it out loud, then tick');
          const good = () => { right++; sfx('ok'); setTimeout(next, 700); };
          const mic = h('button', { class: 'ln-mic', onclick: async () => {
            mic.classList.add('on'); msg.textContent = 'Listening… 👂';
            try { const alts = await listen(LANGS[lang].speech); mic.classList.remove('on'); msg.textContent = `I heard: “${alts[0]}”`; if (alts.some(a => similar(a, text) >= 0.72)) good(); else { sfx('error'); msg.textContent += ' · try again or skip'; } }
            catch (err) { mic.classList.remove('on'); msg.textContent = err.message; }
          } }, '🎤');
          area.replaceChildren(h('div', { class: 'ln-q' }, h('div', { class: 'ln-read', style: { fontFamily: LANGS[lang].font } }, text),
            h('button', { class: 'btn ghost', onclick: () => speakItem(lang, text) }, ico('sound', 16), 'Hear it')),
            SR ? mic : null, msg,
            h('div', { class: 'empty-acts' }, SR ? null : h('button', { class: 'btn primary', onclick: good }, '✓ I read it'), h('button', { class: 'btn ghost', onclick: () => { sfx('tick'); next(); } }, 'Skip')));
        };
        next();
      }
    },
    // 6. picture puzzle
    match(lang) {
      const list = items(lang);
      rounds(lang, 'match', 'Picture puzzle', 10, (area, done) => {
        const [s, w, e] = pick(list);
        const opts = shuffle([e, ...shuffle(list.filter(x => x[2] !== e)).slice(0, 3).map(x => x[2])]);
        area.replaceChildren(h('div', { class: 'ln-q' }, big(lang, s, 'sm'), h('p', {}, lang === 'num' ? 'Which picture shows this number?' : 'Which picture starts with this letter?')),
          h('div', { class: 'ln-opts pics' }, opts.map(o => h('button', { class: 'ln-opt pic', onclick: ev => { ev.currentTarget.classList.add(o === e ? 'good' : 'bad'); if (o === e) speakItem(lang, w); done(o === e); } }, o))));
      });
    },
  };

  return home();
}

register({ id: 'learn', name: 'Learn', icon: 'learn', color: '#43a047', grad: 'linear-gradient(135deg,#9be15d,#00b894)', size: [880, 680], single: true, mount, blurb: 'English, Tamil தமிழ் & numbers: read, write, speak' });
