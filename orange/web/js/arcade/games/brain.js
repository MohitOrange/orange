// Brain & learning games for kids and families. All DOM based: no animation loop, almost no CPU.
import { h } from '../../core.js';
import { rand, pick, shuffle, PALETTE } from '../engine.js';

const timers = new Set();
const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
const stopAll = () => { timers.forEach(clearTimeout); timers.clear(); };

export const WORDS = {
  animals: [['CAT', '🐱'], ['DOG', '🐶'], ['COW', '🐮'], ['PIG', '🐷'], ['FOX', '🦊'], ['LION', '🦁'], ['BEAR', '🐻'], ['FROG', '🐸'], ['DUCK', '🦆'], ['FISH', '🐟'], ['GOAT', '🐐'], ['HORSE', '🐴'], ['TIGER', '🐯'], ['ZEBRA', '🦓'], ['MONKEY', '🐵'], ['RABBIT', '🐰'], ['TURTLE', '🐢'], ['PARROT', '🦜'], ['ELEPHANT', '🐘'], ['GIRAFFE', '🦒']],
  fruits: [['APPLE', '🍎'], ['MANGO', '🥭'], ['GRAPES', '🍇'], ['BANANA', '🍌'], ['ORANGE', '🍊'], ['LEMON', '🍋'], ['CHERRY', '🍒'], ['PEACH', '🍑'], ['MELON', '🍈'], ['KIWI', '🥝'], ['PEAR', '🍐'], ['COCONUT', '🥥'], ['PINEAPPLE', '🍍'], ['STRAWBERRY', '🍓'], ['WATERMELON', '🍉']],
  things: [['BALL', '⚽'], ['BOOK', '📘'], ['CAR', '🚗'], ['BUS', '🚌'], ['SUN', '☀️'], ['MOON', '🌙'], ['STAR', '⭐'], ['TREE', '🌳'], ['HOUSE', '🏠'], ['CLOCK', '⏰'], ['CAKE', '🎂'], ['KITE', '🪁'], ['BOAT', '⛵'], ['TRAIN', '🚂'], ['ROBOT', '🤖'], ['PENCIL', '✏️'], ['GUITAR', '🎸'], ['ROCKET', '🚀'], ['UMBRELLA', '☂️'], ['COMPUTER', '💻']],
  countries: [['INDIA', '🇮🇳'], ['JAPAN', '🇯🇵'], ['CHINA', '🇨🇳'], ['BRAZIL', '🇧🇷'], ['FRANCE', '🇫🇷'], ['CANADA', '🇨🇦'], ['EGYPT', '🇪🇬'], ['ITALY', '🇮🇹'], ['SPAIN', '🇸🇵'], ['NEPAL', '🇳🇵'], ['KENYA', '🇰🇪'], ['MEXICO', '🇲🇽']],
};

// Generic multiple-choice quiz screen used by many learning games
function quiz(G, el, { rounds = 10, make, columns = 2, speak }) {
  let n = 0, right = 0;
  const qEl = h('div', { class: 'qz-q' }), opts = h('div', { class: 'qz-opts', style: { gridTemplateColumns: `repeat(${columns},1fr)` } });
  const prog = h('div', { class: 'qz-prog' }, h('i'));
  el.append(h('div', { class: 'qz' }, prog, qEl, opts));
  const next = () => {
    if (n >= rounds) return G.win(`${right} of ${rounds} right`);
    n++; prog.firstChild.style.width = `${((n - 1) / rounds) * 100}%`;
    const { q, answers, correct } = make(n);
    qEl.replaceChildren(...(Array.isArray(q) ? q : [q]));
    if (speak) speak(n);
    opts.replaceChildren(...answers.map(a => {
      const b = h('button', { class: 'qz-a', onclick: () => {
        if (opts.dataset.lock) return; opts.dataset.lock = 1;
        const ok = String(a) === String(correct);
        b.classList.add(ok ? 'good' : 'bad');
        if (!ok) [...opts.children].find(x => x.dataset.v === String(correct))?.classList.add('good');
        if (ok) { right++; G.add(10); G.sound('ok'); } else G.sound('error');
        G.status(`${right}/${rounds}`);
        later(() => { delete opts.dataset.lock; next(); }, ok ? 650 : 1300);
      } }, a);
      b.dataset.v = String(a);
      return b;
    }));
  };
  next();
}
const choices = (correct, wrongGen, k = 4) => { const s = new Set([correct]); let guard = 0; while (s.size < k && guard++ < 200) s.add(wrongGen()); return shuffle([...s]); };

// ================================================================ Maths
export const math = {
  kind: 'dom', how: 'Pick the right answer. 10 questions.',
  start(G, el) {
    const op = G.params.op || '+', max = G.params.max || 10;
    quiz(G, el, { make: () => {
      const o = op === 'mix' ? pick(['+', '−', '×', '÷']) : op;
      let a = rand(1, max + 1) | 0, b = rand(1, max + 1) | 0, ans;
      if (o === '+') ans = a + b;
      if (o === '−') { if (b > a) [a, b] = [b, a]; ans = a - b; }
      if (o === '×') { a = rand(1, Math.min(max, 12) + 1) | 0; b = rand(1, 11) | 0; ans = a * b; }
      if (o === '÷') { b = rand(1, 10) | 0; ans = rand(1, 11) | 0; a = ans * b; }
      return { q: h('div', { class: 'qz-big' }, `${a} ${o} ${b} = ?`), answers: choices(ans, () => Math.max(0, ans + rand(-5, 6) | 0)), correct: ans };
    } });
  },
  stop: stopAll,
};

// ================================================================ Counting
export const count = {
  kind: 'dom', how: 'Count the pictures and choose the number.',
  start(G, el) {
    const items = ['🍎', '⭐', '🐟', '🎈', '🦋', '🍪', '🚗', '🌸'];
    quiz(G, el, { make: () => { const n = rand(1, G.params.max || 10) | 0 || 1, e = pick(items); return { q: h('div', { class: 'qz-pics' }, e.repeat(n)), answers: choices(n, () => Math.max(1, n + rand(-3, 4) | 0)), correct: n }; } });
  },
  stop: stopAll,
};

// ================================================================ Picture → word (spelling choice)
export const picword = {
  kind: 'dom', how: 'Look at the picture. Which word is it?',
  start(G, el) {
    const list = WORDS[G.params.set || 'animals'];
    quiz(G, el, { make: () => { const [w, e] = pick(list); return { q: h('div', { class: 'qz-emoji' }, e), answers: choices(w, () => pick(list)[0]), correct: w }; } });
  },
  stop: stopAll,
};

// ================================================================ Missing letter
export const missing = {
  kind: 'dom', how: 'Which letter is missing from the word?',
  start(G, el) {
    const list = [...WORDS.animals, ...WORDS.fruits, ...WORDS.things];
    quiz(G, el, { make: () => { const [w, e] = pick(list.filter(x => x[0].length <= (G.params.max || 6))); const i = rand(w.length); return { q: [h('div', { class: 'qz-emoji sm' }, e), h('div', { class: 'qz-big' }, w.slice(0, i) + '_' + w.slice(i + 1))], answers: choices(w[i], () => String.fromCharCode(65 + rand(26))), correct: w[i] }; } });
  },
  stop: stopAll,
};

// ================================================================ Word scramble
export const scramble = {
  kind: 'dom', usesLetters: true, how: 'Tap the letters in the right order to spell the word.',
  start(G, el) {
    const list = [...WORDS.animals, ...WORDS.fruits, ...WORDS.things].filter(([w]) => (G.params.long ? w.length >= 5 : w.length <= 5));
    let round = 0, solved = 0;
    const box = h('div', { class: 'qz' });
    el.append(box);
    const next = () => {
      if (round >= 8) return G.win(`${solved} words`);
      round++;
      const [w, e] = pick(list);
      let typed = '';
      const ans = h('div', { class: 'sc-ans' }), tiles = h('div', { class: 'sc-tiles' });
      const letters = shuffle(w.split('').map((l, i) => ({ l, i })));
      tiles.append(...letters.map(({ l }) => { const b = h('button', { class: 'sc-t' }, l); b.onclick = () => { if (b.disabled) return; b.disabled = true; typed += l; ans.textContent = typed.padEnd(w.length, '·'); G.sound('tick'); if (typed.length === w.length) check(); }; return b; }));
      const check = () => { if (typed === w) { solved++; G.add(w.length * 5); G.sound('ok'); later(next, 700); } else { G.sound('error'); later(() => { typed = ''; ans.textContent = '·'.repeat(w.length); tiles.querySelectorAll('button').forEach(b => (b.disabled = false)); }, 600); } };
      ans.textContent = '·'.repeat(w.length);
      box.replaceChildren(h('div', { class: 'qz-emoji sm' }, e), ans, tiles, h('button', { class: 'btn ghost', onclick: () => { G.status(`it was ${w}`); later(next, 900); } }, 'Skip'));
      G.status(`word ${round}/8`);
    };
    next();
  },
  stop: stopAll,
};

// ================================================================ Hangman (kids version: a balloon flies away)
export const hangman = {
  kind: 'dom', usesLetters: true, how: 'Guess the word one letter at a time. 6 wrong guesses and the balloons fly away!',
  start(G, el) {
    const list = WORDS[G.params.set || 'animals'];
    const [w, e] = pick(list);
    const got = new Set(); let wrong = 0, done = false;
    const word = h('div', { class: 'hm-word' }), bal = h('div', { class: 'hm-bal' }), keys = h('div', { class: 'hm-keys' });
    const paint = () => { word.textContent = w.split('').map(l => (got.has(l) ? l : '_')).join(' '); bal.textContent = '🎈'.repeat(Math.max(0, 6 - wrong)) || '😢'; };
    const guess = (l, b) => {
      if (done || got.has(l) || b?.disabled) return; if (b) b.disabled = true;
      if (w.includes(l)) { got.add(l); G.add(5); G.sound('pop'); } else { wrong++; G.sound('error'); keys.querySelector(`[data-l="${l}"]`)?.classList.add('miss'); }
      if (!b) { const kb = keys.querySelector(`[data-l="${l}"]`); if (kb) kb.disabled = true; }
      paint();
      if (w.split('').every(x => got.has(x))) { done = true; later(() => G.win(`${e} ${w}`), 400); }
      else if (wrong >= 6) { done = true; later(() => G.lose(`It was ${e} ${w}`), 400); }
    };
    keys.append(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => { const b = h('button', { class: 'hm-k', dataset: { l } }, l); b.onclick = () => guess(l, b); return b; }));
    this.key = (G2, k) => { if (/^[a-z]$/i.test(k)) guess(k.toUpperCase()); };
    G.status(`${G.params.set || 'animals'}`);
    paint();
    el.append(h('div', { class: 'qz' }, bal, word, keys));
  },
  stop: stopAll,
};

// ================================================================ Typing
export const typing = {
  kind: 'dom', usesLetters: true, how: 'Type the letters (or words) you see as fast as you can. 60 seconds.',
  start(G, el) {
    const words = G.params.words;
    const pool = words ? [...WORDS.animals, ...WORDS.fruits, ...WORDS.things].map(x => x[0]) : 'ASDFJKLGHQWERTYUIOPZXCVBNM'.split('');
    let target = pick(pool), typed = '', left = 60, done = 0;
    const tEl = h('div', { class: 'ty-target' }), inEl = h('div', { class: 'ty-typed' });
    const paint = () => { tEl.replaceChildren(...target.split('').map((l, i) => h('span', { class: i < typed.length ? 'ok' : i === typed.length ? 'cur' : '' }, l))); inEl.textContent = `${done} done`; };
    this.key = (G2, k) => {
      if (k.length !== 1) return;
      if (k.toUpperCase() === target[typed.length]) { typed += k.toUpperCase(); G.sound('tick'); if (typed === target) { done++; G.add(target.length * 2); target = pick(pool); typed = ''; } }
      else G.sound('error');
      paint();
    };
    const tick = () => { left--; G.status(`${left}s`); if (left <= 0) return G.win(`${done} ${words ? 'words' : 'letters'} in 60s`); later(tick, 1000); };
    later(tick, 1000);
    paint(); G.status('60s');
    el.append(h('div', { class: 'qz' }, tEl, inEl, h('small', { class: 'muted' }, 'use your keyboard')));
  },
  stop: stopAll,
};

// ================================================================ Odd one out
const GROUPS = [['🐶', '🐱', '🐭', '🐰', '🍎'], ['🍎', '🍌', '🍇', '🍓', '🚗'], ['🚗', '🚌', '🚲', '✈️', '🐟'], ['⚽', '🏀', '🎾', '🏐', '🌳'], ['🌹', '🌻', '🌷', '🌸', '🍕'], ['🐟', '🐬', '🐳', '🐙', '🐘'], ['☀️', '🌙', '⭐', '☁️', '🥕'], ['🎸', '🥁', '🎺', '🎻', '🧦']];
export const oddone = {
  kind: 'dom', how: 'Which one does NOT belong with the others?',
  start(G, el) {
    quiz(G, el, { columns: 4, make: () => { const g = pick(GROUPS); const odd = g[4]; const set = shuffle([...shuffle(g.slice(0, 4)).slice(0, 3), odd]); return { q: h('div', { class: 'qz-big' }, 'Find the odd one'), answers: set, correct: odd }; } });
  },
  stop: stopAll,
};

// ================================================================ Colour challenge (Stroop)
export const stroop = {
  kind: 'dom', how: 'Tap the COLOUR of the word, not what the word says!',
  start(G, el) {
    const cols = [['RED', '#e53935'], ['BLUE', '#1e88e5'], ['GREEN', '#43a047'], ['YELLOW', '#fdd835'], ['PURPLE', '#8e24aa']];
    quiz(G, el, { rounds: 15, make: () => { const [word] = pick(cols), [name, hex] = pick(cols); return { q: h('div', { class: 'qz-big', style: { color: hex } }, word), answers: choices(name, () => pick(cols)[0]), correct: name }; } });
  },
  stop: stopAll,
};

// ================================================================ What comes next (patterns)
export const pattern = {
  kind: 'dom', how: 'Find what comes next in the pattern.',
  start(G, el) {
    const em = ['🔴', '🟢', '🔵', '🟡', '⭐', '🍎', '🐱'];
    quiz(G, el, { make: () => {
      if (Math.random() < 0.5) { const a = rand(1, 10) | 0, d = rand(1, 6) | 0, s = [a, a + d, a + 2 * d, a + 3 * d]; const ans = a + 4 * d; return { q: h('div', { class: 'qz-big' }, `${s.join(', ')}, ?`), answers: choices(ans, () => ans + rand(-6, 7) | 0), correct: ans }; }
      const unit = shuffle(em).slice(0, rand(2, 4) | 0), seq = Array.from({ length: 7 }, (_, i) => unit[i % unit.length]);
      const ans = unit[7 % unit.length];
      return { q: h('div', { class: 'qz-big' }, `${seq.join(' ')} ❓`), answers: choices(ans, () => pick(em)), correct: ans };
    } });
  },
  stop: stopAll,
};

// ================================================================ Tell the time
export const clock = {
  kind: 'dom', how: 'Read the clock. What time is it?',
  start(G, el) {
    const fmt = (hh, mm) => `${hh}:${String(mm).padStart(2, '0')}`;
    quiz(G, el, { make: () => {
      const hh = rand(1, 13) | 0, mm = G.params.half ? pick([0, 30]) : pick([0, 15, 30, 45, 5, 10, 20, 25, 35, 40, 50, 55]);
      const ha = ((hh % 12) + mm / 60) * 30, ma = mm * 6;
      const svg = `<svg viewBox="0 0 100 100" width="170" height="170"><circle cx="50" cy="50" r="46" fill="#fff8e1" stroke="#ff8a1f" stroke-width="4"/>${[...Array(12).keys()].map(i => `<text x="${50 + 36 * Math.sin((i + 1) * Math.PI / 6)}" y="${54 + -36 * Math.cos((i + 1) * Math.PI / 6)}" font-size="9" text-anchor="middle" fill="#5d4037" font-family="Sora">${i + 1}</text>`).join('')}<line x1="50" y1="50" x2="${50 + 22 * Math.sin(ha * Math.PI / 180)}" y2="${50 - 22 * Math.cos(ha * Math.PI / 180)}" stroke="#3e2723" stroke-width="5" stroke-linecap="round"/><line x1="50" y1="50" x2="${50 + 34 * Math.sin(ma * Math.PI / 180)}" y2="${50 - 34 * Math.cos(ma * Math.PI / 180)}" stroke="#ff5a3c" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="50" r="3" fill="#3e2723"/></svg>`;
      return { q: h('div', { class: 'qz-clock', html: svg }), answers: choices(fmt(hh, mm), () => fmt(rand(1, 13) | 0, pick([0, 15, 30, 45]))), correct: fmt(hh, mm) };
    } });
  },
  stop: stopAll,
};

// ================================================================ Shapes & colours
export const shapes = {
  kind: 'dom', how: 'What shape (or colour) is this?',
  start(G, el) {
    const S = [['Circle', '<circle cx="50" cy="50" r="38"/>'], ['Square', '<rect x="14" y="14" width="72" height="72"/>'], ['Triangle', '<polygon points="50,10 92,88 8,88"/>'], ['Star', '<polygon points="50,6 61,38 95,38 67,58 78,92 50,72 22,92 33,58 5,38 39,38"/>'], ['Heart', '<path d="M50 88 C10 60 5 30 28 18 C40 12 50 22 50 30 C50 22 60 12 72 18 C95 30 90 60 50 88Z"/>'], ['Diamond', '<polygon points="50,6 90,50 50,94 10,50"/>'], ['Hexagon', '<polygon points="27,10 73,10 95,50 73,90 27,90 5,50"/>'], ['Oval', '<ellipse cx="50" cy="50" rx="42" ry="28"/>']];
    const C = [['Red', '#e53935'], ['Blue', '#1e88e5'], ['Green', '#43a047'], ['Yellow', '#fdd835'], ['Orange', '#ff8a1f'], ['Purple', '#8e24aa'], ['Pink', '#ec407a']];
    quiz(G, el, { make: () => {
      const [sn, sv] = pick(S), [cn, cv] = pick(C), askColour = G.params.colours && Math.random() < 0.5;
      return { q: [h('div', { class: 'qz-big sm' }, askColour ? 'Which colour?' : 'Which shape?'), h('div', { html: `<svg viewBox="0 0 100 100" width="150" height="150" fill="${cv}">${sv}</svg>` })], answers: askColour ? choices(cn, () => pick(C)[0]) : choices(sn, () => pick(S)[0]), correct: askColour ? cn : sn };
    } });
  },
  stop: stopAll,
};

// ================================================================ Number guess
export const guess = {
  kind: 'dom', lowerIsBetter: true, usesLetters: true, how: 'I am thinking of a number. Guess it! I will say higher or lower.',
  start(G, el) {
    const max = G.params.max || 100, secret = (rand(max) | 0) + 1;
    let tries = 0;
    const msg = h('div', { class: 'qz-big sm' }, `1 to ${max}`), inp = h('input', { class: 'field gu-in', type: 'number', min: 1, max, placeholder: 'your guess' });
    const go = () => { const v = +inp.value; if (!v) return; tries++; G.setScore(tries); if (v === secret) return G.win(`${secret} in ${tries} tries`); msg.textContent = v < secret ? `${v} → higher ⬆️` : `${v} → lower ⬇️`; G.sound('tick'); inp.select(); };
    inp.onkeydown = e => { if (e.key === 'Enter') go(); e.stopPropagation(); };
    el.append(h('div', { class: 'qz' }, h('div', { class: 'qz-emoji sm' }, '🤔'), msg, inp, h('button', { class: 'btn primary', onclick: go }, 'Guess')));
    later(() => inp.focus(), 100);
  },
  stop: stopAll,
};

// ================================================================ Rock paper scissors
export const rps = {
  kind: 'dom', how: 'Pick rock, paper or scissors. First to 5 wins!',
  start(G, el) {
    const M = [['✊', 'Rock'], ['✋', 'Paper'], ['✌️', 'Scissors']];
    let me = 0, cpu = 0;
    const show = h('div', { class: 'rps-show' }, '🤜 vs 🤛');
    const play = i => {
      const c = rand(3); const r = (i - c + 3) % 3;
      show.textContent = `${M[i][0]}  vs  ${M[c][0]}`;
      if (r === 1) { me++; G.add(10); G.sound('ok'); } else if (r === 2) { cpu++; G.sound('error'); } else G.sound('tick');
      G.status(`you ${me} : ${cpu} cpu`);
      if (me >= 5) G.win('You won!'); if (cpu >= 5) G.lose('The computer won');
    };
    el.append(h('div', { class: 'qz' }, show, h('div', { class: 'rps-btns' }, M.map(([e, n], i) => h('button', { class: 'qz-a', onclick: () => play(i) }, `${e} ${n}`)))));
  },
  stop: stopAll,
};

// ================================================================ Piano (free play + songs)
export const piano = {
  kind: 'dom', usesLetters: true, how: 'Play with the mouse or keys A S D F G H J K. Try "Twinkle Twinkle": C C G G A A G',
  start(G, el) {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [['C', 261.6, 'a'], ['D', 293.7, 's'], ['E', 329.6, 'd'], ['F', 349.2, 'f'], ['G', 392, 'g'], ['A', 440, 'h'], ['B', 493.9, 'j'], ['C²', 523.3, 'k']];
    const play = (f, b) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.2, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.2);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 1.25);
      b.classList.add('down'); later(() => b.classList.remove('down'), 160); G.add(1);
    };
    const keys = notes.map(([n, f, k], i) => { const b = h('button', { class: 'pn-key', style: { '--c': PALETTE[i % 8] } }, h('b', {}, n), h('small', {}, k.toUpperCase())); b.onpointerdown = () => play(f, b); return b; });
    this.key = (G2, k) => { const i = notes.findIndex(n => n[2] === k.toLowerCase()); if (i >= 0) play(notes[i][1], keys[i]); };
    this.stop = () => { stopAll(); if (ac.state !== 'closed') ac.close?.().catch(() => {}); };
    el.append(h('div', { class: 'qz' }, h('div', { class: 'qz-emoji sm' }, '🎹'), h('div', { class: 'pn' }, keys)));
  },
};
