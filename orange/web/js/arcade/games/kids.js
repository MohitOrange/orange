// Games and toys for little ones: popping, drumming, colouring, counting, sorting, a pet and a farm.
// Everything is DOM based (no frame loop) and the pet and farm remember their progress inside the box.
import { h, notify } from '../../core.js';
import { api } from '../../api.js';
import { rand, pick, shuffle } from '../engine.js';
import { quiz, choices, WORDS, stopAll as stopQuiz } from './brain.js';
import { tone, audio, NOTES } from './kit.js';

const timers = new Set();
const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
const stopAll = () => { timers.forEach(clearTimeout); timers.clear(); stopQuiz(); try { speechSynthesis.cancel(); } catch { /* none */ } };
const grid = (n, cls) => h('div', { class: `bd-grid ${cls}`, style: { gridTemplateColumns: `repeat(${n}, 1fr)` } });
const shake = el => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };
const RAINBOW = ['#ff5252', '#ff9800', '#ffeb3b', '#66bb6a', '#29b6f6', '#7e57c2'];
export function say(text, lang = 'en-IN') {
  try {
    const voices = speechSynthesis.getVoices(), u = new SpeechSynthesisUtterance(text);
    const v = voices.find(x => x.lang === lang) || voices.find(x => x.lang.startsWith(lang.slice(0, 2)));
    if (!v && lang.startsWith('ta')) return false;
    u.lang = lang; if (v) u.voice = v; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); return true;
  } catch { return false; }
}
const bigOpts = (el, cls = 'emo') => el.querySelector('.qz-opts')?.classList.add(cls);

// ================================================================ Pop It (fidget toy)
export const popit = {
  kind: 'dom', how: 'Pop every bubble! When they are all popped the toy flips over, so you can pop them again and again.',
  start(G, el) {
    const n = 6, g = grid(n, 'pi'), cells = []; let flips = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const b = h('button', { class: 'pi-b', style: { '--c': RAINBOW[r] }, 'aria-label': 'bubble', onclick: () => pop(b, r) }); cells.push(b); g.append(b); }
    const pop = (b, r) => {
      if (b.classList.contains('down')) return;
      b.classList.add('down'); tone(NOTES[7 - r], 0.12, 'sine', 0.12); G.add(1);
      if (cells.every(x => x.classList.contains('down'))) {
        flips++; G.sound('ok'); G.status(`flipped ${flips} time${flips === 1 ? '' : 's'}`); g.classList.add('flip');
        later(() => { cells.forEach(x => x.classList.remove('down')); g.classList.remove('flip'); }, 650);
      }
    };
    el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Drum Kit
export const drums = {
  kind: 'dom', usesLetters: true, how: 'Tap the pads (or press Q W E R A S D F) to play the drums. Press "Play a beat" and drum along!',
  start(G, el) {
    const ac = audio(), noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const out = (node, vol, dur, t) => { const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); node.connect(g).connect(ac.destination); return g; };
    const nz = (type, freq, vol, dur, t) => { const s = ac.createBufferSource(); s.buffer = noise; const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; s.connect(f); out(f, vol, dur, t); s.start(t); s.stop(t + dur + 0.05); };
    const osc = (type, f0, f1, vol, dur, t) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); out(o, vol, dur, t); o.start(t); o.stop(t + dur + 0.05); };
    const SOUND = {
      kick: t => osc('sine', 150, 40, 0.9, 0.3, t), snare: t => { nz('highpass', 1200, 0.45, 0.2, t); osc('triangle', 190, 120, 0.3, 0.1, t); },
      hihat: t => nz('highpass', 7000, 0.25, 0.06, t), clap: t => { for (const d of [0, 0.012, 0.024]) nz('bandpass', 1500, 0.5, 0.12, t + d); },
      tom: t => osc('sine', 220, 100, 0.7, 0.3, t), cymbal: t => nz('highpass', 5200, 0.25, 0.9, t),
      cowbell: t => { osc('square', 560, 555, 0.12, 0.25, t); osc('square', 845, 840, 0.12, 0.25, t); }, shaker: t => nz('bandpass', 6000, 0.3, 0.08, t),
    };
    const PADS = [['kick', 'Kick', '🥁', 'q'], ['snare', 'Snare', '🪘', 'w'], ['hihat', 'Hi-hat', '🎩', 'e'], ['clap', 'Clap', '👏', 'r'], ['tom', 'Tom', '🛢️', 'a'], ['cymbal', 'Cymbal', '📀', 's'], ['cowbell', 'Cowbell', '🔔', 'd'], ['shaker', 'Shaker', '🧂', 'f']];
    const pads = PADS.map(([id, name, e, k], i) => h('button', { class: 'dr-pad', style: { '--c': RAINBOW[i % 6] }, onpointerdown: () => play(id) }, h('span', {}, e), h('b', {}, name), h('small', {}, k.toUpperCase())));
    const play = (id, auto) => { if (ac.state === 'suspended') ac.resume(); SOUND[id](ac.currentTime); const p = pads[PADS.findIndex(x => x[0] === id)]; p.classList.add('hit'); later(() => p.classList.remove('hit'), 110); if (!auto) G.add(1); };
    let beatOn = false, step = 0;
    const PATTERN = { kick: [0, 3, 8, 10], snare: [4, 12], hihat: [0, 2, 4, 6, 8, 10, 12, 14], clap: [12] };
    const tick = () => { if (!beatOn) return; for (const [id, steps] of Object.entries(PATTERN)) if (steps.includes(step % 16)) play(id, true); step++; later(tick, 136); };
    const beatB = h('button', { class: 'btn primary', onclick: () => { beatOn = !beatOn; beatB.textContent = beatOn ? '⏹ Stop the beat' : '▶ Play a beat'; if (beatOn) { step = 0; tick(); } } }, '▶ Play a beat');
    this.key = (G2, k) => { const p = PADS.find(x => x[3] === k.toLowerCase()); if (p) play(p[0]); };
    el.append(h('div', { class: 'qz' }, h('div', { class: 'dr' }, pads), beatB));
  },
  stop: stopAll,
};

// ================================================================ Colouring book
const PICTURES = {
  house: [['rect', { x: 0, y: 0, width: 200, height: 140 }], ['rect', { x: 0, y: 140, width: 200, height: 60 }], ['circle', { cx: 165, cy: 35, r: 18 }], ['ellipse', { cx: 45, cy: 32, rx: 24, ry: 11 }],
    ['rect', { x: 45, y: 88, width: 92, height: 70 }], ['polygon', { points: '35,90 91,46 147,90' }], ['rect', { x: 80, y: 118, width: 22, height: 40 }], ['rect', { x: 54, y: 100, width: 20, height: 18 }], ['rect', { x: 108, y: 100, width: 20, height: 18 }],
    ['rect', { x: 166, y: 112, width: 10, height: 40 }], ['circle', { cx: 171, cy: 100, r: 20 }], ['path', { d: 'M10 170 q8 -14 16 0 z' }], ['path', { d: 'M150 175 q8 -14 16 0 z' }]],
  fish: [['rect', { x: 0, y: 0, width: 200, height: 175 }], ['rect', { x: 0, y: 175, width: 200, height: 25 }], ['polygon', { points: '140,100 185,68 185,132' }], ['ellipse', { cx: 95, cy: 100, rx: 56, ry: 36 }],
    ['polygon', { points: '80,67 108,42 116,70' }], ['polygon', { points: '92,66 104,66 112,134 100,134' }], ['circle', { cx: 64, cy: 92, r: 8 }], ['circle', { cx: 40, cy: 50, r: 6 }], ['circle', { cx: 28, cy: 30, r: 4 }],
    ['path', { d: 'M20 175 Q8 150 25 128 Q36 150 30 175 Z' }], ['path', { d: 'M168 175 Q158 146 176 124 Q188 150 180 175 Z' }]],
  rocket: [['rect', { x: 0, y: 0, width: 200, height: 200 }], ['circle', { cx: 160, cy: 45, r: 22 }], ['polygon', { points: '30,40 34,50 44,50 36,56 39,66 30,60 21,66 24,56 16,50 26,50' }],
    ['rect', { x: 82, y: 70, width: 36, height: 80 }], ['polygon', { points: '82,70 100,30 118,70' }], ['circle', { cx: 100, cy: 92, r: 10 }], ['polygon', { points: '82,120 62,155 82,150' }], ['polygon', { points: '118,120 138,155 118,150' }],
    ['polygon', { points: '88,150 100,185 112,150' }], ['circle', { cx: 40, cy: 160, r: 14 }]],
  flower: [['rect', { x: 0, y: 0, width: 200, height: 200 }], ['rect', { x: 96, y: 100, width: 8, height: 70 }], ['ellipse', { cx: 80, cy: 140, rx: 16, ry: 7 }], ['ellipse', { cx: 120, cy: 128, rx: 16, ry: 7 }],
    ...[0, 72, 144, 216, 288].map(a => ['ellipse', { cx: 100 + Math.cos((a * Math.PI) / 180) * 26, cy: 72 + Math.sin((a * Math.PI) / 180) * 26, rx: 18, ry: 12, transform: `rotate(${a} ${100 + Math.cos((a * Math.PI) / 180) * 26} ${72 + Math.sin((a * Math.PI) / 180) * 26})` }]),
    ['circle', { cx: 100, cy: 72, r: 16 }], ['polygon', { points: '70,168 130,168 122,198 78,198' }], ['circle', { cx: 170, cy: 30, r: 14 }]],
  car: [['rect', { x: 0, y: 0, width: 200, height: 150 }], ['rect', { x: 0, y: 150, width: 200, height: 50 }], ['rect', { x: 25, y: 95, width: 150, height: 40, rx: 10 }], ['polygon', { points: '55,95 75,62 130,62 150,95' }],
    ['polygon', { points: '80,90 88,68 102,68 102,90' }], ['polygon', { points: '108,90 108,68 126,68 140,90' }], ['circle', { cx: 60, cy: 138, r: 17 }], ['circle', { cx: 142, cy: 138, r: 17 }], ['circle', { cx: 60, cy: 138, r: 7 }], ['circle', { cx: 142, cy: 138, r: 7 }], ['circle', { cx: 168, cy: 108, r: 6 }]],
};
const INKS = ['#e53935', '#ff9800', '#ffeb3b', '#8bc34a', '#43a047', '#29b6f6', '#1e88e5', '#7e57c2', '#ec407a', '#8d6e63', '#212121', '#ffffff', '#ffcc80', '#b3e5fc'];
export const colouring = {
  kind: 'dom', how: 'Pick a colour, then tap a part of the picture to colour it in. Save it to your Pictures when you are done!',
  start(G, el) {
    const name = G.params.pic || 'house', NS = 'http://www.w3.org/2000/svg';
    let ink = INKS[0];
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 200 200'); svg.setAttribute('class', 'cl-svg');
    const filled = new Set();
    PICTURES[name].forEach(([tag, attrs], i) => {
      const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]);
      e.setAttribute('fill', '#fff'); e.setAttribute('stroke', '#222'); e.setAttribute('stroke-width', '1.6'); e.setAttribute('stroke-linejoin', 'round');
      e.addEventListener('click', () => { e.setAttribute('fill', ink); if (!filled.has(i)) { filled.add(i); G.add(1); } tone(NOTES[i % 12], 0.15, 'sine', 0.08); });
      svg.append(e);
    });
    const sw = h('div', { class: 'cl-inks' }, INKS.map(c => h('button', { class: 'cl-ink' + (c === ink ? ' on' : ''), style: { '--c': c }, 'aria-label': c, onclick: e => { ink = c; sw.querySelectorAll('.cl-ink').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } })));
    const save = () => {
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })), img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 800; cv.getContext('2d').drawImage(img, 0, 0, 800, 800); URL.revokeObjectURL(url);
        cv.toBlob(async b => { try { const r = await api.upload(`/Pictures/Colouring ${name}.png`, b); G.sound('ok'); notify({ title: 'Saved to Pictures', body: r.path, icon: 'image', tone: 'good' }); } catch (e) { notify({ title: 'Could not save', body: e.message, tone: 'bad' }); } }, 'image/png');
      };
      img.src = url;
    };
    el.append(h('div', { class: 'cl' }, svg, h('div', { class: 'cl-side' }, sw, h('button', { class: 'btn', onclick: save }, '💾 Save to Pictures'), h('button', { class: 'btn primary', onclick: () => G.win('What a beautiful picture!') }, '✨ I\'m done'))));
  },
  stop: stopAll,
};

// ================================================================ Dot to Dot
const starPts = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 19 : 44; return [50 + Math.cos(a) * r, 54 + Math.sin(a) * r]; });
const heartPts = Array.from({ length: 14 }, (_, i) => { const t = (i / 14) * Math.PI * 2; return [50 + 2.6 * 16 * Math.sin(t) ** 3, 46 - 2.6 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]; });
const SHAPES = [
  ['⭐', 'star', starPts, '#ffd23f'], ['❤️', 'heart', heartPts, '#ff4f6d'],
  ['🏠', 'house', [[20, 90], [20, 50], [50, 22], [62, 33], [62, 24], [72, 24], [72, 42], [80, 50], [80, 90]], '#ff8a65'],
  ['🐟', 'fish', [[10, 50], [28, 32], [55, 26], [78, 40], [94, 24], [94, 76], [78, 60], [55, 74], [28, 68]], '#4fc3f7'],
  ['🪁', 'kite', [[50, 8], [80, 42], [50, 92], [20, 42]], '#ba68c8'],
  ['🌲', 'tree', [[50, 8], [74, 40], [62, 40], [82, 70], [56, 70], [56, 92], [44, 92], [44, 70], [18, 70], [38, 40], [26, 40]], '#66bb6a'],
  ['🚀', 'rocket', [[50, 6], [64, 28], [64, 66], [78, 86], [60, 80], [40, 80], [22, 86], [36, 66], [36, 28]], '#90a4ae'],
  ['⛵', 'boat', [[10, 62], [90, 62], [76, 84], [24, 84], [10, 62], [48, 62], [48, 8], [82, 56], [52, 56]], '#ffb74d'],
];
export const dot2dot = {
  kind: 'dom', how: 'Tap the dots in order: 1, 2, 3… to draw a picture. What will it be?',
  start(G, el) {
    const NS = 'http://www.w3.org/2000/svg', order = shuffle(SHAPES).slice(0, G.params.count || 5); let k = 0;
    const box = h('div', { class: 'pz' }), label = h('div', { class: 'qz-big sm' });
    const draw = () => {
      if (k >= order.length) return G.win(`You drew ${order.length} pictures!`);
      const [e, name, pts, col] = order[k]; let next = 0;
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '-6 -6 112 112'); svg.setAttribute('class', 'dd-svg');
      const add = (tag, a) => { const n = document.createElementNS(NS, tag); for (const x in a) n.setAttribute(x, a[x]); svg.append(n); return n; };
      const path = add('polyline', { points: '', fill: 'none', stroke: '#ff8a1f', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      const dotsEl = pts.map(([x, y], i) => { const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'dd-dot'); g.innerHTML = `<circle cx="${x}" cy="${y}" r="3.2"/><text x="${x}" y="${y - 4.6}">${i + 1}</text>`; g.addEventListener('click', () => tap(i)); svg.append(g); return g; });
      const tap = i => {
        if (i !== next) { G.sound('error'); return; }
        dotsEl[i].classList.add('done'); next++; tone(NOTES[Math.min(11, next)], 0.15, 'sine', 0.1);
        path.setAttribute('points', pts.slice(0, next).map(p => p.join(',')).join(' '));
        if (next === pts.length) {
          path.setAttribute('points', [...pts, pts[0]].map(p => p.join(',')).join(' ')); path.setAttribute('fill', col); path.setAttribute('fill-opacity', 0.75);
          G.add(10); G.sound('ok'); label.textContent = `It's a ${name}! ${e}`; say(`It's a ${name}!`); k++; later(draw, 1800);
        }
      };
      label.textContent = 'Join the dots…'; box.replaceChildren(label, svg); G.status(`picture ${k + 1} of ${order.length}`);
    };
    draw(); el.append(box);
  },
  stop: stopAll,
};

// ================================================================ Feed the Monster (counting)
export const feed = {
  kind: 'dom', how: 'The monster is hungry! Feed it exactly the number of treats it asks for, then press "Yum!".',
  start(G, el) {
    const max = G.params.max || 5, R = 10; let round = 0, want = 0, given = 0, food = '';
    const mon = h('div', { class: 'fd-m' }, '🦖'), ask = h('div', { class: 'qz-big sm' }), plate = h('div', { class: 'fd-plate' }), tree = h('div', { class: 'fd-tree' });
    const reset = () => { given = 0; plate.replaceChildren(); tree.querySelectorAll('button').forEach(b => { b.disabled = false; }); mon.textContent = '🦖'; };
    const next = () => {
      round++; if (round > R) return G.win(`You fed the monster ${R} times!`);
      want = 1 + (rand(max) | 0); food = pick(['🍎', '🍌', '🍓', '🍪', '🥕', '🍇', '🧁', '🍉']); ask.textContent = `Feed me ${want} ${food}`; say(`Feed me ${want}!`);
      tree.replaceChildren(...Array.from({ length: max + 3 }, () => h('button', { class: 'fd-f', onclick: e => give(e.currentTarget) }, food))); reset(); G.status(`${round} / ${R}`);
    };
    const give = b => { if (b.disabled) return; b.disabled = true; given++; plate.append(h('span', {}, food)); tone(NOTES[Math.min(11, given)], 0.12, 'sine', 0.1); };
    const yum = () => {
      if (!want) return;
      if (given === want) { G.add(10); G.sound('ok'); mon.textContent = '😋'; ask.textContent = 'Yum yum! Thank you!'; want = 0; later(next, 1000); }
      else { G.sound('error'); mon.textContent = given < want ? '😢' : '🤢'; ask.textContent = given < want ? `More please! I want ${want}.` : `Too many! I only want ${want}.`; later(reset, 1300); }
    };
    next();
    el.append(h('div', { class: 'qz' }, mon, ask, plate, tree, h('div', { class: 'nm-btns' }, h('button', { class: 'btn ghost', onclick: reset }, '↩ Start again'), h('button', { class: 'btn primary', onclick: yum }, 'Yum! 😋'))));
  },
  stop: stopAll,
};

// ================================================================ Make Ten
export const maketen = {
  kind: 'dom', how: 'Find two cards that add up to the target number. Tap one card, then another. Clear the whole board!',
  start(G, el) {
    const T = G.params.target || 10, nums = shuffle(Array.from({ length: 6 }, () => { const a = 1 + (rand(T - 1) | 0); return [a, T - a]; }).flat());
    let sel = null, left = nums.length;
    const g = grid(4, 'mt'), cells = nums.map((v, i) => h('button', { class: 'mt-c', style: { '--c': RAINBOW[v % 6] }, onclick: () => tap(i) }, h('b', {}, v), T <= 10 ? h('small', {}, '●'.repeat(v)) : null)); g.append(...cells);
    const tap = i => {
      if (cells[i].disabled) return;
      if (sel === null || sel === i) { sel = sel === i ? null : i; cells.forEach((c, j) => c.classList.toggle('sel', j === sel)); return G.sound('tick'); }
      const a = sel; sel = null; cells[a].classList.remove('sel');
      if (nums[a] + nums[i] === T) { [a, i].forEach(j => { cells[j].disabled = true; cells[j].classList.add('gone'); }); left -= 2; G.add(10); G.sound('ok'); if (!left) later(() => G.win(`You made ${T} six times!`), 400); }
      else { G.sound('error'); shake(cells[a]); shake(cells[i]); }
    };
    G.status(`make ${T}`); el.append(h('div', { class: 'qz' }, h('div', { class: 'qz-big sm' }, `Make ${T}`), g));
  },
  stop: stopAll,
};

// ================================================================ Quizzes with pictures
const SHADOW_POOL = ['🐘', '🦒', '🐇', '🐢', '🦀', '🐙', '🦋', '🐌', '🦕', '🐈', '🐓', '🦉', '🚲', '✈️', '🚁', '⛵', '🎸', '☂️', '🔑', '✂️', '🍐', '🍌', '🍄', '🌵', '⭐', '🏠', '🎈', '🪁', '⚓', '🦷'];
export const shadow = {
  kind: 'dom', how: 'Look at the shadow. Which picture made it? Tap the right one!',
  start(G, el) {
    quiz(G, el, { rounds: 10, columns: 4, make: () => { const opts = shuffle(SHADOW_POOL).slice(0, 4), ans = pick(opts); return { q: h('div', { class: 'kd-shadow' }, ans), answers: opts, correct: ans }; } });
    bigOpts(el);
  },
  stop: stopAll,
};
export const coins = {
  kind: 'dom', how: 'Add up the money. How many rupees is it altogether?',
  start(G, el) {
    const vals = G.params.notes ? [1, 2, 5, 10, 20, 50] : [1, 2, 5, 10], n = G.params.notes ? 4 : 3;
    quiz(G, el, { rounds: 10, columns: 2, make: () => {
      const cs = Array.from({ length: 2 + (rand(n) | 0) }, () => pick(vals)).sort((a, b) => b - a), total = cs.reduce((a, b) => a + b, 0);
      return { q: h('div', { class: 'kd-coins' }, cs.map(v => h('span', { class: 'kd-coin' + (v >= 20 ? ' note' : '') + ` v${v}` }, `₹${v}`))), answers: choices(total, () => Math.max(1, total + (rand(-6, 7) | 0))).map(x => `₹${x}`), correct: `₹${total}` };
    } });
  },
  stop: stopAll,
};
export const compare = {
  kind: 'dom', how: 'Which side has more? Look carefully, then tap your answer.',
  start(G, el) {
    const signs = G.params.signs;
    quiz(G, el, { rounds: 10, columns: 3, make: () => {
      const max = signs ? 50 : 9, a = 1 + (rand(max) | 0), b = Math.random() < 0.2 ? a : 1 + (rand(max) | 0), e = pick(['🍎', '⭐', '🐟', '🌸', '🚗', '🍪']);
      const side = v => h('div', { class: 'kd-side' }, signs ? h('b', {}, v) : h('span', {}, e.repeat(v)));
      const ans = signs ? (a > b ? '>' : a < b ? '<' : '=') : (a > b ? '👈 This side' : a < b ? 'This side 👉' : 'The same');
      return { q: h('div', { class: 'kd-compare' }, side(a), signs ? h('i', {}, '?') : h('i', {}, 'or'), side(b)), answers: signs ? ['<', '=', '>'] : ['👈 This side', 'The same', 'This side 👉'], correct: ans };
    } });
    if (signs) bigOpts(el);
  },
  stop: stopAll,
};
const RIDDLES = [['🧈', '🪰', 'Butterfly'], ['🌧️', '🎀', 'Rainbow'], ['☀️', '🌸', 'Sunflower'], ['⭐', '🐟', 'Starfish'], ['🦶', '⚽', 'Football'], ['❄️', '👨', 'Snowman'], ['☕', '🍰', 'Cupcake'],
  ['🦷', '🖌️', 'Toothbrush'], ['🔥', '🪰', 'Firefly'], ['🍮', '🐟', 'Jellyfish'], ['🌙', '💡', 'Moonlight'], ['🐶', '🏠', 'Doghouse'], ['🌊', '🐴', 'Seahorse'], ['📖', '🪱', 'Bookworm'],
  ['🏖️', '🏰', 'Sandcastle'], ['🍯', '🐝', 'Honeybee'], ['🐄', '👦', 'Cowboy'], ['🐉', '🪰', 'Dragonfly'], ['🥇', '🐟', 'Goldfish'], ['🌲', '🍎', 'Pineapple'], ['✉️', '📦', 'Mailbox'], ['👂', '💍', 'Earring']];
export const emojiriddle = {
  kind: 'dom', how: 'Put the two pictures together to make one word! Tap the answer.',
  start(G, el) { quiz(G, el, { rounds: 10, columns: 2, make: () => { const [a, b, w] = pick(RIDDLES); return { q: h('div', { class: 'qz-emoji' }, `${a} + ${b}`), answers: choices(w, () => pick(RIDDLES)[2]), correct: w }; } }); },
  stop: stopAll,
};
const OPP = [['hot', '🔥', 'cold', '❄️'], ['big', '🐘', 'small', '🐜'], ['happy', '😀', 'sad', '😢'], ['day', '☀️', 'night', '🌙'], ['up', '⬆️', 'down', '⬇️'], ['fast', '🚀', 'slow', '🐢'],
  ['open', '📖', 'closed', '📕'], ['wet', '💧', 'dry', '🏜️'], ['loud', '📢', 'quiet', '🤫'], ['old', '👴', 'young', '👶'], ['tall', '🦒', 'short', '🐁'], ['full', '🍕', 'empty', '🍽️'], ['in', '📥', 'out', '📤'], ['awake', '😃', 'asleep', '😴']];
export const opposites = {
  kind: 'dom', how: 'Find the opposite word! Hot ↔ cold, big ↔ small…',
  start(G, el) {
    quiz(G, el, { rounds: 10, columns: 2, make: () => {
      const p = pick(OPP), flip = Math.random() < 0.5, [w, e, o, oe] = flip ? [p[2], p[3], p[0], p[1]] : p;
      return { q: [h('div', { class: 'qz-emoji sm' }, e), h('div', { class: 'qz-big sm' }, `The opposite of ${w.toUpperCase()} is…`)], answers: choices(`${oe} ${o}`, () => { const x = pick(OPP), s = Math.random() < 0.5; return s ? `${x[1]} ${x[0]}` : `${x[3]} ${x[2]}`; }).filter(Boolean), correct: `${oe} ${o}` };
    } });
  },
  stop: stopAll,
};
const CAPS = {
  world: [['🇮🇳 India', 'New Delhi'], ['🇯🇵 Japan', 'Tokyo'], ['🇫🇷 France', 'Paris'], ['🇬🇧 United Kingdom', 'London'], ['🇺🇸 United States', 'Washington, D.C.'], ['🇨🇳 China', 'Beijing'], ['🇮🇹 Italy', 'Rome'],
    ['🇪🇸 Spain', 'Madrid'], ['🇩🇪 Germany', 'Berlin'], ['🇪🇬 Egypt', 'Cairo'], ['🇷🇺 Russia', 'Moscow'], ['🇧🇷 Brazil', 'Brasília'], ['🇨🇦 Canada', 'Ottawa'], ['🇦🇺 Australia', 'Canberra'], ['🇱🇰 Sri Lanka', 'Colombo'],
    ['🇳🇵 Nepal', 'Kathmandu'], ['🇰🇪 Kenya', 'Nairobi'], ['🇲🇽 Mexico', 'Mexico City'], ['🇰🇷 South Korea', 'Seoul'], ['🇹🇭 Thailand', 'Bangkok'], ['🇧🇩 Bangladesh', 'Dhaka'], ['🇦🇪 UAE', 'Abu Dhabi'],
    ['🇸🇦 Saudi Arabia', 'Riyadh'], ['🇮🇩 Indonesia', 'Jakarta'], ['🇲🇾 Malaysia', 'Kuala Lumpur'], ['🇬🇷 Greece', 'Athens'], ['🇵🇹 Portugal', 'Lisbon'], ['🇦🇷 Argentina', 'Buenos Aires']],
  india: [['Tamil Nadu', 'Chennai'], ['Kerala', 'Thiruvananthapuram'], ['Karnataka', 'Bengaluru'], ['Andhra Pradesh', 'Amaravati'], ['Telangana', 'Hyderabad'], ['Maharashtra', 'Mumbai'], ['Gujarat', 'Gandhinagar'],
    ['Rajasthan', 'Jaipur'], ['West Bengal', 'Kolkata'], ['Bihar', 'Patna'], ['Uttar Pradesh', 'Lucknow'], ['Punjab', 'Chandigarh'], ['Odisha', 'Bhubaneswar'], ['Madhya Pradesh', 'Bhopal'], ['Assam', 'Dispur'], ['Goa', 'Panaji'], ['Puducherry', 'Puducherry'], ['Himachal Pradesh', 'Shimla']],
};
export const capitals = {
  kind: 'dom', how: 'What is the capital city? Tap the right answer.',
  start(G, el) { const list = CAPS[G.params.set || 'world']; quiz(G, el, { rounds: 10, columns: 2, make: () => { const [p, c] = pick(list); return { q: h('div', { class: 'qz-big sm' }, p), answers: choices(c, () => pick(list)[1]), correct: c }; } }); },
  stop: stopAll,
};
const SOUNDS = [['🐄', 'Moo'], ['🐶', 'Woof woof'], ['🐱', 'Meow'], ['🦆', 'Quack'], ['🐑', 'Baa'], ['🐷', 'Oink'], ['🐓', 'Cock-a-doodle-doo'], ['🦁', 'Roar'], ['🐍', 'Hiss'], ['🐝', 'Buzz'], ['🐸', 'Ribbit'], ['🐴', 'Neigh'], ['🦉', 'Hoot hoot'], ['🐭', 'Squeak'], ['🐺', 'Howl'], ['🐘', 'Toot']];
export const animalsounds = {
  kind: 'dom', how: 'Listen to the sound. Which animal says it? Tap the animal!',
  start(G, el) {
    let cur = '';
    quiz(G, el, { rounds: 10, columns: 4, speak: () => say(cur), make: () => {
      const opts = shuffle(SOUNDS).slice(0, 4), [e, s] = pick(opts); cur = s;
      return { q: [h('div', { class: 'qz-big sm' }, `Who says “${s}”?`), h('button', { class: 'btn', onclick: () => say(s) }, '🔊 Hear it')], answers: opts.map(o => o[0]), correct: e };
    } });
    bigOpts(el);
  },
  stop: stopAll,
};
const RHYMES = [['cat', '🐱', ['hat', 'bat', 'mat']], ['dog', '🐶', ['log', 'frog', 'fog']], ['sun', '☀️', ['bun', 'run', 'fun']], ['star', '⭐', ['car', 'jar']], ['cake', '🎂', ['snake', 'lake', 'rake']],
  ['bee', '🐝', ['tree', 'key', 'sea']], ['mouse', '🐭', ['house']], ['goat', '🐐', ['boat', 'coat']], ['fish', '🐟', ['dish', 'wish']], ['bear', '🐻', ['chair', 'pear', 'hair']], ['ball', '⚽', ['wall', 'tall']],
  ['moon', '🌙', ['spoon', 'balloon']], ['king', '🤴', ['ring', 'swing', 'sing']], ['bed', '🛏️', ['red', 'bread']], ['clock', '⏰', ['sock', 'rock', 'lock']], ['night', '🌙', ['light', 'kite']], ['pen', '🖊️', ['hen', 'ten']]];
export const rhyme = {
  kind: 'dom', how: 'Which word rhymes? Words that rhyme sound the same at the end, like cat and hat.',
  start(G, el) {
    quiz(G, el, { rounds: 10, columns: 2, make: () => {
      const [w, e, rs] = pick(RHYMES), ans = pick(rs), bad = RHYMES.filter(r => r[0] !== w).flatMap(r => [r[0], ...r[2]]).filter(x => !rs.includes(x) && x !== w);
      return { q: [h('div', { class: 'qz-emoji sm' }, e), h('div', { class: 'qz-big sm' }, `What rhymes with “${w}”?`)], answers: shuffle([ans, ...shuffle(bad).slice(0, 3)]), correct: ans };
    } });
  },
  stop: stopAll,
};
const TA_WORDS = [['பூனை', '🐱'], ['நாய்', '🐶'], ['மாடு', '🐄'], ['குதிரை', '🐴'], ['பறவை', '🐦'], ['மீன்', '🐟'], ['ஆப்பிள்', '🍎'], ['வாழைப்பழம்', '🍌'], ['மாம்பழம்', '🥭'], ['பூ', '🌸'],
  ['மரம்', '🌳'], ['வீடு', '🏠'], ['சூரியன்', '☀️'], ['நிலா', '🌙'], ['நட்சத்திரம்', '⭐'], ['மழை', '🌧️'], ['கார்', '🚗'], ['பேருந்து', '🚌'], ['புத்தகம்', '📖'], ['பந்து', '⚽'],
  ['கண்', '👁️'], ['கை', '✋'], ['பால்', '🥛'], ['தண்ணீர்', '💧'], ['யானை', '🐘'], ['சிங்கம்', '🦁'], ['குரங்கு', '🐒'], ['முயல்', '🐰'], ['ஆமை', '🐢'], ['பாம்பு', '🐍'], ['கப்பல்', '🚢'], ['ரயில்', '🚂']];
export const tamilwords = {
  kind: 'dom', how: 'Tamil words! Read (or listen to) the word and tap the right picture. Switch the level to pick the Tamil word for a picture instead.',
  start(G, el) {
    const toWord = G.params.reverse; let cur = '';
    quiz(G, el, { rounds: 10, columns: toWord ? 2 : 4, speak: () => say(cur, 'ta-IN'), make: () => {
      const opts = shuffle(TA_WORDS).slice(0, 4), [w, e] = pick(opts); cur = w;
      return toWord ? { q: h('div', { class: 'qz-emoji' }, e), answers: opts.map(o => o[0]), correct: w } : { q: [h('div', { class: 'qz-big ta' }, w), h('button', { class: 'btn', onclick: () => say(w, 'ta-IN') || notify({ title: 'No Tamil voice installed', body: 'Windows: Settings → Time & language → Speech → Add voices → Tamil' }) }, '🔊 கேள்')], answers: opts.map(o => o[1]), correct: e };
    } });
    bigOpts(el, toWord ? 'ta' : 'emo');
  },
  stop: stopAll,
};

// ================================================================ Listen & Spell
export const spell = {
  kind: 'dom', usesLetters: true, how: 'Listen to the word (press 🔊) and look at the picture, then type the word with the keyboard or the letter buttons.',
  start(G, el) {
    const list = Object.values(WORDS).flat().filter(([w]) => (G.params.long ? w.length >= 5 && w.length <= 8 : w.length <= 4) && /^[A-Z]+$/.test(w));
    let round = 0, word = '', typed = '', busy = false;
    const pic = h('div', { class: 'qz-emoji' }), slots = h('div', { class: 'sc-ans' }), msg = h('div', { class: 'nm-info' });
    const keys = h('div', { class: 'hm-keys' }, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => h('button', { class: 'hm-k', onclick: () => type(l) }, l)));
    const show = () => (slots.textContent = typed.padEnd(word.length, '_').split('').join(' '));
    const next = () => { round++; if (round > 10) return G.win(`${G.score / 10} words spelled`); const [w, e] = pick(list); word = w; typed = ''; busy = false; pic.textContent = e; msg.textContent = `Word ${round} of 10`; show(); say(w.toLowerCase()); };
    const type = l => {
      if (busy || typed.length >= word.length) return; typed += l; G.sound('tick'); show();
      if (typed.length === word.length) {
        busy = true;
        if (typed === word) { G.add(10); G.sound('ok'); msg.textContent = `✓ ${word}!`; later(next, 900); }
        else { G.sound('error'); msg.textContent = `It's spelled ${word}`; slots.textContent = word.split('').join(' '); later(next, 1600); }
      }
    };
    this.key = (G2, k) => { if (/^[a-z]$/i.test(k)) type(k.toUpperCase()); if (k === 'Backspace' && !busy) { typed = typed.slice(0, -1); show(); } };
    next();
    el.append(h('div', { class: 'qz' }, pic, h('button', { class: 'btn', onclick: () => say(word.toLowerCase()) }, '🔊 Hear the word'), slots, msg, keys,
      h('button', { class: 'btn ghost', onclick: () => { if (!busy) { typed = typed.slice(0, -1); show(); } } }, '⌫ Back')));
  },
  stop: stopAll,
};

// ================================================================ Sort It
const SORTS = {
  food: [['Fruit 🍎', ['🍎', '🍌', '🍇', '🍓', '🍊', '🍍', '🥭', '🍉', '🍐', '🍒']], ['Vegetable 🥕', ['🥕', '🥦', '🌽', '🥔', '🍆', '🥒', '🧅', '🫑', '🥬', '🧄']]],
  animals: [['On land 🌳', ['🐘', '🦁', '🐄', '🐑', '🐕', '🐒', '🦒', '🐎', '🐇', '🐿️']], ['In water 🌊', ['🐟', '🐬', '🐳', '🦈', '🐙', '🦀', '🐠', '🦭', '🐋', '🦞']]],
  weather: [['Hot ☀️', ['🔥', '☀️', '🌶️', '☕', '🍲', '🌋', '🏜️', '🥵']], ['Cold ❄️', ['🧊', '⛄', '🍦', '🥶', '🐧', '🏔️', '❄️', '🧣']]],
};
export const sortit = {
  kind: 'dom', how: 'Where does it go? Tap the left or right basket (or press ← →).',
  start(G, el) {
    const kind = G.params.set || 'food';
    const sides = kind === 'numbers' ? [['Odd 1 3 5', []], ['Even 2 4 6', []]] : SORTS[kind];
    let round = 0, item = null, ans = 0;
    const big = h('div', { class: 'so-item' }), msg = h('div', { class: 'nm-info' });
    const btns = sides.map(([label], i) => h('button', { class: 'so-bin', style: { '--c': i ? '#2fb8ff' : '#ff8a1f' }, onclick: () => choose(i) }, label));
    const next = () => {
      round++; if (round > 12) return G.win(`${G.score / 10} of 12 right`);
      if (kind === 'numbers') { const n = 1 + (rand(30) | 0); item = String(n); ans = n % 2 ? 0 : 1; } else { ans = rand(2) | 0; item = pick(sides[ans][1]); }
      big.textContent = item; big.classList.remove('go-l', 'go-r'); G.status(`${round} / 12`);
    };
    const choose = i => {
      if (!item) return;
      const ok = i === ans; big.classList.add(i ? 'go-r' : 'go-l'); item = null;
      if (ok) { G.add(10); G.sound('ok'); msg.textContent = 'Yes!'; } else { G.sound('error'); msg.textContent = `That goes in “${sides[ans][0]}”`; shake(btns[ans]); }
      later(next, ok ? 500 : 1100);
    };
    this.key = (G2, k) => { if (k === 'ArrowLeft') choose(0); if (k === 'ArrowRight') choose(1); };
    next(); el.append(h('div', { class: 'qz so' }, big, msg, h('div', { class: 'so-bins' }, btns)));
  },
  stop: stopAll,
};

// ================================================================ Put in Order
const SEQS = {
  numbers: () => shuffle([...Array(20)].map((_, i) => i + 1)).slice(0, 5).sort((a, b) => a - b).map(String),
  letters: () => shuffle('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')).slice(0, 5).sort(),
  days: () => { const d = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], s = rand(3) | 0; return d.slice(s, s + 5); },
  months: () => { const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], s = rand(8) | 0; return m.slice(s, s + 5); },
  sizes: () => ['🐜', '🐭', '🐱', '🐕', '🐎', '🐘'],
  tamil: () => { const t = ['அ', 'ஆ', 'இ', 'ஈ', 'உ', 'ஊ', 'எ', 'ஏ', 'ஐ', 'ஒ', 'ஓ', 'ஔ'], s = rand(8) | 0; return t.slice(s, s + 5); },
};
const SEQ_Q = { numbers: 'Smallest to biggest', letters: 'In ABC order', days: 'Days of the week in order', months: 'Months in order', sizes: 'Smallest animal to biggest', tamil: 'உயிர் எழுத்துக்கள் வரிசையில் (in order)' };
export const order = {
  kind: 'dom', how: 'Tap the cards in the right order. Numbers, letters, days, months, sizes and Tamil letters!',
  start(G, el) {
    let round = 0;
    const box = h('div', { class: 'qz' });
    const next = () => {
      round++; if (round > 8) return G.win(`${G.score / 10} of 8 in order`);
      const kind = G.params.set && G.params.set !== 'mix' ? G.params.set : pick(Object.keys(SEQS)), seq = SEQS[kind]();
      let pos = 0, mistakes = 0;
      const done = h('div', { class: 'or-done' }), tiles = h('div', { class: 'or-tiles' + (kind === 'tamil' ? ' ta' : '') });
      shuffle(seq.map((v, i) => [v, i])).forEach(([v, i]) => tiles.append(h('button', { class: 'or-t', style: { '--c': RAINBOW[i % 6] }, onclick: e => tap(i, v, e.currentTarget) }, v)));
      const tap = (i, v, b) => {
        if (i !== pos) { mistakes++; G.sound('error'); return shake(b); }
        b.remove(); done.append(h('span', { class: 'or-t on' + (kind === 'tamil' ? ' ta' : '') }, v)); pos++; tone(NOTES[pos + 2], 0.15, 'sine', 0.1);
        if (pos === seq.length) { if (!mistakes) G.add(10); else G.add(5); G.sound('ok'); later(next, 900); }
      };
      box.replaceChildren(h('div', { class: 'qz-big sm' + (kind === 'tamil' ? ' ta' : '') }, SEQ_Q[kind]), done, tiles); G.status(`${round} / 8`);
    };
    next(); el.append(box);
  },
  stop: stopAll,
};

// ================================================================ Juicy, the pet orange (remembers you)
export const pet = {
  kind: 'dom', how: 'Look after Juicy the orange! Feed, play, wash and put Juicy to bed. Juicy remembers you and gets hungry while you are away.',
  start(G, el) {
    const d = G.data; d.stats ||= { food: 70, fun: 70, clean: 70, sleep: 70 }; d.care ||= 0; d.last ||= Date.now();
    const away = Math.min(45, (Date.now() - d.last) / 360000); for (const k in d.stats) d.stats[k] = Math.max(5, d.stats[k] - away);
    const face = h('span', { class: 'pet-face' }), body = h('div', { class: 'pet' }, face), bubble = h('div', { class: 'pet-say' }), bars = h('div', { class: 'pet-bars' });
    const LAB = { food: '🍎 Food', fun: '⚽ Fun', clean: '🫧 Clean', sleep: '💤 Sleep' };
    let napping = 0;
    const mood = () => { const s = d.stats, avg = (s.food + s.fun + s.clean + s.sleep) / 4; return napping ? '😴' : avg > 75 ? '😄' : avg > 55 ? '🙂' : avg > 35 ? '😐' : '😢'; };
    const paint = () => {
      face.textContent = mood();
      bars.replaceChildren(...Object.entries(d.stats).map(([k, v]) => h('div', { class: 'pet-bar' }, h('small', {}, LAB[k]), h('i', { style: { width: `${v}%`, background: v > 50 ? '#66bb6a' : v > 25 ? '#ffb300' : '#ef5350' } }))));
      const low = Object.entries(d.stats).sort((a, b) => a[1] - b[1])[0];
      if (!napping) bubble.textContent = low[1] > 70 ? 'I love you! 🧡' : { food: 'I\'m hungry!', fun: 'Let\'s play!', clean: 'I need a bath!', sleep: 'I\'m sleepy…' }[low[0]];
      G.setScore(d.care);
    };
    const act = (k, amt, side, e, sound) => {
      if (napping && k !== 'sleep') return;
      d.stats[k] = Math.min(100, d.stats[k] + amt); for (const [s, v] of Object.entries(side || {})) d.stats[s] = Math.max(0, d.stats[s] + v);
      d.care++; d.last = Date.now(); G.save(); tone(sound, 0.2, 'sine', 0.1);
      body.classList.remove('bounce'); void body.offsetWidth; body.classList.add('bounce');
      const fx = h('span', { class: 'pet-fx' }, e); body.append(fx); later(() => fx.remove(), 900);
      if (k === 'sleep') { napping = 1; bubble.textContent = 'Zzz…'; later(() => { napping = 0; paint(); }, 2200); }
      paint();
    };
    const tick = () => { for (const k in d.stats) d.stats[k] = Math.max(0, d.stats[k] - (napping ? 0.2 : 0.5)); d.last = Date.now(); G.save(); paint(); later(tick, 4000); };
    const btn = (label, fn) => h('button', { class: 'btn primary pet-b', onclick: fn }, label);
    paint(); later(tick, 4000);
    el.append(h('div', { class: 'qz' }, bubble, body, bars, h('div', { class: 'nm-btns' },
      btn('🍎 Feed', () => act('food', 25, { clean: -4 }, '🍎', 523)), btn('⚽ Play', () => act('fun', 25, { food: -6, clean: -6, sleep: -5 }, '⚽', 659)),
      btn('🛁 Wash', () => act('clean', 35, {}, '🫧', 784)), btn('💤 Sleep', () => act('sleep', 40, {}, '💤', 330)))));
  },
  stop: stopAll,
};

// ================================================================ Orange Farm (idle clicker, remembers your farm)
const SHOP = [['basket', '🧺', 'Bigger basket', '+1 per tap', 15, 1.5, 0, 1], ['tree', '🌳', 'Orange tree', '+1 every second', 25, 1.5, 1, 0], ['farmer', '👩‍🌾', 'Farmer', '+5 every second', 150, 1.55, 5, 0],
  ['truck', '🚚', 'Truck', '+25 every second', 1000, 1.6, 25, 0], ['factory', '🏭', 'Juice factory', '+120 every second', 7000, 1.65, 120, 0], ['rocket', '🚀', 'Space farm', '+800 every second', 60000, 1.7, 800, 0]];
export const farm = {
  kind: 'dom', how: 'Tap the big orange to pick oranges. Spend them on trees, farmers and trucks that pick oranges for you. Your farm keeps growing, even while you are away!',
  start(G, el) {
    const d = G.data; d.n ||= 0; d.total ||= 0; d.own ||= {}; d.last ||= Date.now();
    const rate = () => SHOP.reduce((s, x) => s + (d.own[x[0]] || 0) * x[6], 0), per = () => 1 + (d.own.basket || 0);
    const cost = x => Math.ceil(x[4] * x[5] ** (d.own[x[0]] || 0));
    const awaySec = Math.min(7200, (Date.now() - d.last) / 1000), earned = Math.floor(awaySec * rate() * 0.5);
    const fmt = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.floor(n).toLocaleString());
    const count = h('div', { class: 'fm-n' }), rateEl = h('small', { class: 'fm-rate' }), shop = h('div', { class: 'fm-shop' });
    const big = h('button', { class: 'fm-big', 'aria-label': 'pick oranges', onclick: () => { d.n += per(); d.total += per(); tone(NOTES[(rand(5) | 0) + 4], 0.08, 'sine', 0.06); const f = h('span', { class: 'fm-plus' }, `+${per()}`); big.append(f); later(() => f.remove(), 700); paint(); } }, '🍊');
    const paint = () => {
      count.textContent = `🍊 ${fmt(d.n)}`; rateEl.textContent = `${fmt(rate())} per second · ${per()} per tap`; G.setScore(Math.floor(d.total));
      shop.replaceChildren(...SHOP.map(x => h('button', { class: 'fm-item', disabled: d.n < cost(x), onclick: () => buy(x) }, h('span', {}, x[1]), h('b', {}, x[2]), h('small', {}, x[3]), h('em', {}, `🍊 ${fmt(cost(x))}`), h('i', {}, d.own[x[0]] || 0))));
    };
    const buy = x => { const c = cost(x); if (d.n < c) return; d.n -= c; d.own[x[0]] = (d.own[x[0]] || 0) + 1; G.sound('ok'); G.save(); paint(); };
    let t = 0;
    const tick = () => { const r = rate() / 4; d.n += r; d.total += r; d.last = Date.now(); if (++t % 20 === 0) G.save(); if (r) paint(); later(tick, 250); };
    if (earned > 0) { d.n += earned; d.total += earned; later(() => notify({ title: `Your farm picked ${fmt(earned)} oranges while you were away!`, icon: 'sparkle', tone: 'good' }), 600); }
    paint(); later(tick, 250);
    el.append(h('div', { class: 'fm' }, h('div', { class: 'fm-left' }, count, rateEl, big), shop));
  },
  stop() { stopAll(); },
};
