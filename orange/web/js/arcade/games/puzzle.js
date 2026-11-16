// Puzzle & board games. DOM based (no animation loop at all) except Blocks, which uses the canvas loop.
import { h } from '../../core.js';
import { rand, pick, shuffle, clamp, PALETTE } from '../engine.js';

const grid = (n, cls = '') => h('div', { class: `pz-grid ${cls}`, style: { gridTemplateColumns: `repeat(${n}, 1fr)` } });
const timers = new Set();
const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
const stopAll = () => { timers.forEach(clearTimeout); timers.clear(); };

// ================================================================ Memory match
export const THEMES = {
  animals: ['🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷'],
  fruits: ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🍍', '🥝', '🥭'],
  vehicles: ['🚗', '🚕', '🚌', '🚓', '🚑', '🚒', '🚜', '🚲', '✈️', '🚀', '🚂', '⛵'],
  sea: ['🐟', '🐠', '🐡', '🦈', '🐙', '🦀', '🐬', '🐳', '🦑', '🐚', '🦭', '🐢'],
  shapes: ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪'],
  numbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  english: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
  tamil: ['அ', 'ஆ', 'இ', 'ஈ', 'உ', 'ஊ', 'எ', 'ஏ', 'ஐ', 'ஒ', 'ஓ', 'ஔ'],
  space: ['🌍', '🌙', '⭐', '☀️', '🪐', '☄️', '🚀', '👽', '🛸', '🌌', '🔭', '👩‍🚀'],
  food: ['🍕', '🍔', '🍟', '🌭', '🍿', '🧁', '🍩', '🍪', '🍦', '🥞', '🍫', '🥪'],
  sports: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏓', '🏸', '🥊', '⛳', '🏏', '🎳'],
};
export const memory = {
  kind: 'dom', how: 'Flip two cards at a time and find all the matching pairs.',
  start(G, el) {
    const pairs = G.params.pairs || 8, set = shuffle(THEMES[G.params.theme || 'animals']).slice(0, pairs);
    const cards = shuffle([...set, ...set]);
    const cols = pairs <= 6 ? 4 : pairs <= 8 ? 4 : 6;
    const g = grid(cols, 'pz-mem');
    let open = [], found = 0, moves = 0, lock = false;
    cards.forEach(v => {
      const card = h('button', { class: 'pz-card' }, h('span', { class: 'pz-face' }, v), h('span', { class: 'pz-back' }, '?'));
      card.onclick = () => {
        if (lock || card.classList.contains('up')) return;
        card.classList.add('up'); open.push([card, v]); G.sound('tick');
        if (open.length === 2) {
          moves++; G.status(`${moves} moves`);
          const [[a, va], [b, vb]] = open; open = [];
          if (va === vb) { found++; G.add(10); G.sound('pop'); a.classList.add('done'); b.classList.add('done'); if (found === pairs) later(() => G.win(`${moves} moves`), 400); }
          else { lock = true; later(() => { a.classList.remove('up'); b.classList.remove('up'); lock = false; }, 750); }
        }
      };
      g.append(card);
    });
    el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ 2048
export const g2048 = {
  kind: 'dom', how: 'Arrow keys (or swipe) slide all tiles. Equal tiles merge. Reach the big number!',
  start(G, el) {
    const n = G.params.size || 4, goal = G.params.goal || 2048;
    let b = Array(n * n).fill(0);
    const g = grid(n, 'pz-2048');
    const add = () => { const e = b.map((v, i) => (v ? -1 : i)).filter(i => i >= 0); if (e.length) b[pick(e)] = Math.random() < 0.9 ? 2 : 4; };
    const paint = () => g.replaceChildren(...b.map(v => h('div', { class: 'pz-t', style: { '--c': v ? `hsl(${30 + Math.log2(v) * 22},85%,${62 - Math.min(Math.log2(v), 11) * 2}%)` : 'rgba(255,255,255,.07)' } }, v || '')));
    const line = row => { const f = row.filter(x => x); for (let i = 0; i < f.length - 1; i++) if (f[i] === f[i + 1]) { f[i] *= 2; G.add(f[i]); f.splice(i + 1, 1); } while (f.length < n) f.push(0); return f; };
    const move = dir => {
      const before = b.join();
      for (let k = 0; k < n; k++) {
        const idx = Array.from({ length: n }, (_, i) => dir === 'L' ? k * n + i : dir === 'R' ? k * n + (n - 1 - i) : dir === 'U' ? i * n + k : (n - 1 - i) * n + k);
        const res = line(idx.map(i => b[i])); idx.forEach((i, j) => (b[i] = res[j]));
      }
      if (b.join() === before) return;
      G.sound('tick'); add(); paint();
      if (b.includes(goal)) G.win(`You made ${goal}!`);
      else if (!b.includes(0) && !b.some((v, i) => (i % n < n - 1 && v === b[i + 1]) || (i + n < n * n && v === b[i + n]))) G.lose('No moves left');
    };
    this.key = (G2, k) => ({ ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' }[k] && move({ ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' }[k]));
    let sx, sy;
    g.onpointerdown = e => { sx = e.clientX; sy = e.clientY; };
    g.onpointerup = e => { const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.hypot(dx, dy) > 25) move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')); };
    add(); add(); paint();
    G.status(`goal ${goal}`);
    el.append(h('div', { class: 'pz' }, g));
  },
};

// ================================================================ Minesweeper
export const mines = {
  kind: 'dom', how: 'Click to open. Right-click (or long-press) to flag. Numbers count nearby mines.',
  start(G, el) {
    const [W, H, M] = G.params.size || [9, 9, 10];
    let cells = Array.from({ length: W * H }, () => ({ m: false, o: false, f: false, n: 0 })), first = true, opened = 0;
    const g = grid(W, 'pz-mines');
    const nb = i => { const x = i % W, y = Math.floor(i / W), out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < W && Y < H) out.push(Y * W + X); } return out; };
    const plant = safe => { let k = 0; while (k < M) { const i = rand(W * H); if (!cells[i].m && i !== safe && !nb(safe).includes(i)) { cells[i].m = true; k++; } } cells.forEach((c, i) => (c.n = nb(i).filter(j => cells[j].m).length)); };
    const btns = cells.map((_, i) => h('button', { class: 'pz-m', onclick: () => open(i), oncontextmenu: e => { e.preventDefault(); e.stopPropagation(); flag(i); } }));
    btns.forEach((b, i) => { let t; b.onpointerdown = () => (t = setTimeout(() => { flag(i); b.dataset.long = 1; }, 450)); b.onpointerup = () => clearTimeout(t); });
    const paint = i => { const c = cells[i], b = btns[i]; b.className = 'pz-m' + (c.o ? ' o' : '') + (c.f ? ' f' : ''); b.textContent = c.o ? (c.m ? '💣' : c.n || '') : c.f ? '🚩' : ''; if (c.o && c.n) b.style.color = PALETTE[(c.n + 2) % 8]; };
    const flag = i => { if (cells[i].o) return; cells[i].f = !cells[i].f; paint(i); G.status(`🚩 ${cells.filter(c => c.f).length}/${M}`); };
    const open = i => {
      if (btns[i].dataset.long) { delete btns[i].dataset.long; return; }
      const c = cells[i]; if (c.o || c.f) return;
      if (first) { first = false; plant(i); }
      if (c.m) { cells.forEach((x, j) => { if (x.m) { x.o = true; paint(j); } }); return G.lose('Boom!'); }
      const q = [i];
      while (q.length) { const k = q.pop(), x = cells[k]; if (x.o || x.f) continue; x.o = true; opened++; paint(k); if (!x.n) q.push(...nb(k)); }
      G.setScore(opened); G.sound('tick');
      if (opened === W * H - M) G.win('All clear!');
    };
    g.append(...btns);
    G.status(`🚩 0/${M}`);
    el.append(h('div', { class: 'pz' }, g));
  },
};

// ================================================================ Sliding puzzle
export const slide = {
  kind: 'dom', lowerIsBetter: true, how: 'Slide the tiles to put the numbers in order. Fewer moves = better.',
  start(G, el) {
    const n = G.params.size || 3;
    let b = [...Array(n * n - 1).keys()].map(x => x + 1).concat(0);
    for (let k = 0; k < n * n * 40; k++) { const z = b.indexOf(0), opts = [z - 1, z + 1, z - n, z + n].filter(i => i >= 0 && i < n * n && (Math.abs((i % n) - (z % n)) + Math.abs(Math.floor(i / n) - Math.floor(z / n)) === 1)); const i = pick(opts); [b[z], b[i]] = [b[i], b[z]]; }
    const g = grid(n, 'pz-slide');
    let moves = 0;
    const paint = () => g.replaceChildren(...b.map((v, i) => h('button', { class: 'pz-s' + (v ? '' : ' z'), style: { '--c': `hsl(${(v * 360) / (n * n)},75%,60%)` }, onclick: () => tap(i) }, v || '')));
    const tap = i => {
      const z = b.indexOf(0);
      if (Math.abs((i % n) - (z % n)) + Math.abs(Math.floor(i / n) - Math.floor(z / n)) !== 1) return;
      [b[z], b[i]] = [b[i], b[z]]; moves++; G.setScore(moves); G.sound('tick'); paint();
      if (b.slice(0, -1).every((v, k) => v === k + 1)) G.win(`${moves} moves`);
    };
    this.key = (G2, k) => { const z = b.indexOf(0), m = { ArrowLeft: z + 1, ArrowRight: z - 1, ArrowUp: z + n, ArrowDown: z - n }[k]; if (m !== undefined && m >= 0 && m < n * n) tap(m); };
    paint();
    el.append(h('div', { class: 'pz' }, g));
  },
};

// ================================================================ Lights out
export const lights = {
  kind: 'dom', lowerIsBetter: true, how: 'Tap a light to flip it and its neighbours. Turn every light OFF.',
  start(G, el) {
    const n = G.params.size || 5, on = Array(n * n).fill(false);
    const flip = i => [i, i - n, i + n, i % n ? i - 1 : -1, (i + 1) % n ? i + 1 : -1].forEach(j => { if (j >= 0 && j < n * n) on[j] = !on[j]; });
    for (let k = 0; k < n * 2; k++) flip(rand(n * n));
    if (!on.includes(true)) flip(0);
    let moves = 0;
    const g = grid(n, 'pz-lights');
    const paint = () => g.replaceChildren(...on.map((v, i) => h('button', { class: 'pz-l' + (v ? ' on' : ''), onclick: () => { flip(i); moves++; G.setScore(moves); G.sound('tick'); paint(); if (!on.includes(true)) G.win(`${moves} moves`); } })));
    paint();
    el.append(h('div', { class: 'pz' }, g));
  },
};

// ================================================================ Maze
export const maze = {
  kind: 'dom', how: 'Guide the orange to the star with the arrow keys or by tapping next to it.',
  start(G, el) {
    const n = G.params.size || 9;
    const wall = Array(n * n).fill(0).map(() => [1, 1, 1, 1]); // top right bottom left
    const seen = new Set([0]), st = [0];
    while (st.length) {
      const c = st[st.length - 1], x = c % n, y = Math.floor(c / n);
      const opts = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]].filter(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < n && Y < n && !seen.has(Y * n + X); });
      if (!opts.length) { st.pop(); continue; }
      const [dx, dy, a, b2] = pick(opts), nx = (y + dy) * n + (x + dx);
      wall[c][a] = 0; wall[nx][b2] = 0; seen.add(nx); st.push(nx);
    }
    let pos = 0, steps = 0;
    const g = grid(n, 'pz-maze');
    const cells = wall.map((w, i) => h('div', { class: 'pz-z', style: { borderTopWidth: w[0] ? '3px' : '0', borderRightWidth: w[1] ? '3px' : '0', borderBottomWidth: w[2] ? '3px' : '0', borderLeftWidth: w[3] ? '3px' : '0' }, onclick: () => tapTo(i) }));
    const paint = () => cells.forEach((c, i) => (c.textContent = i === pos ? '🍊' : i === n * n - 1 ? '⭐' : ''));
    const go = d => {
      const x = pos % n, y = Math.floor(pos / n), [dx, dy, side] = { L: [-1, 0, 3], R: [1, 0, 1], U: [0, -1, 0], D: [0, 1, 2] }[d];
      if (wall[pos][side]) return;
      pos = (y + dy) * n + x + dx; steps++; G.setScore(steps); paint();
      if (pos === n * n - 1) G.win(`${steps} steps`);
    };
    const tapTo = i => { const dx = (i % n) - (pos % n), dy = Math.floor(i / n) - Math.floor(pos / n); if (Math.abs(dx) + Math.abs(dy) === 1) go(dx > 0 ? 'R' : dx < 0 ? 'L' : dy > 0 ? 'D' : 'U'); };
    this.key = (G2, k) => ({ ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' }[k] && go({ ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' }[k]));
    g.append(...cells); paint();
    el.append(h('div', { class: 'pz' }, g));
  },
};

// ================================================================ Kids sudoku (4x4, 6x6, 9x9)
export const sudoku = {
  kind: 'dom', how: 'Fill the grid so every row, column and box has each number once.',
  start(G, el) {
    const n = G.params.size || 4, [bw, bh] = { 4: [2, 2], 6: [3, 2], 9: [3, 3] }[n];
    // solved grid from a pattern, then shuffled digits/rows/cols within bands
    const base = (r, c) => (bw * (r % bh) + Math.floor(r / bh) + c) % n;
    const digits = shuffle([...Array(n).keys()].map(x => x + 1));
    let sol = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => digits[base(r, c)]));
    const bandRows = shuffle([...Array(n / bh).keys()]).flatMap(b => shuffle([...Array(bh).keys()]).map(r => b * bh + r));
    sol = bandRows.map(r => sol[r]);
    const holes = Math.round(n * n * (G.params.holes || 0.5));
    const puzzle = sol.map(r => [...r]);
    shuffle([...Array(n * n).keys()]).slice(0, holes).forEach(i => (puzzle[Math.floor(i / n)][i % n] = 0));
    let sel = null;
    const g = grid(n, `pz-sudoku s${n}`);
    const cells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const fixed = puzzle[r][c] !== 0;
      const cell = h('button', { class: 'pz-su' + (fixed ? ' fx' : '') + ((c + 1) % bw === 0 && c < n - 1 ? ' br' : '') + ((r + 1) % bh === 0 && r < n - 1 ? ' bb' : ''),
        onclick: () => { if (fixed) return; cells.forEach(x => x.classList.remove('sel')); cell.classList.add('sel'); sel = [r, c, cell]; } }, fixed ? puzzle[r][c] : '');
      cells.push(cell); g.append(cell);
    }
    const put = v => {
      if (!sel) return;
      const [r, c, cell] = sel;
      puzzle[r][c] = v; cell.textContent = v || ''; cell.classList.toggle('bad', !!v && v !== sol[r][c]);
      G.sound('tick');
      if (puzzle.every((row, i) => row.every((x, j) => x === sol[i][j]))) { G.setScore(n * 10); G.win('Solved!'); }
    };
    const pad = h('div', { class: 'pz-pad' }, [...Array(n).keys()].map(i => h('button', { class: 'btn', onclick: () => put(i + 1) }, i + 1)), h('button', { class: 'btn ghost', onclick: () => put(0) }, '⌫'));
    this.key = (G2, k) => { if (/^[1-9]$/.test(k) && +k <= n) put(+k); if (k === 'Backspace' || k === 'Delete') put(0); };
    el.append(h('div', { class: 'pz' }, g, pad));
  },
};

// ================================================================ Tic-tac-toe
export const ttt = {
  kind: 'dom', how: 'Get three in a row. You are ✖, the other player is ⭕.',
  start(G, el) {
    const ai = G.params.ai, b = Array(9).fill('');
    const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const winner = s => lines.find(l => l.every(i => s[i] && s[i] === s[l[0]]));
    let turn = '✖', done = false;
    const g = grid(3, 'pz-ttt');
    const best = (s, me) => { // minimax
      const w = winner(s); if (w) return { v: s[w[0]] === '⭕' ? 1 : -1 };
      if (s.every(Boolean)) return { v: 0 };
      let bestM = null;
      for (let i = 0; i < 9; i++) if (!s[i]) { s[i] = me; const r = best(s, me === '⭕' ? '✖' : '⭕'); s[i] = ''; if (!bestM || (me === '⭕' ? r.v > bestM.v : r.v < bestM.v)) bestM = { v: r.v, i }; }
      return bestM;
    };
    const paint = () => g.replaceChildren(...b.map((v, i) => h('button', { class: 'pz-x', onclick: () => play(i) }, v)));
    const end = () => {
      const w = winner(b);
      if (w) { done = true; const me = b[w[0]] === '✖'; if (me) G.add(10); return later(() => (ai || me ? (me ? G.win('Three in a row!') : G.lose('The computer won')) : G.win(`${b[w[0]]} wins!`)), 300); }
      if (b.every(Boolean)) { done = true; later(() => G.win('A draw'), 300); }
    };
    const play = i => {
      if (done || b[i] || (ai && turn !== '✖')) return;
      b[i] = turn; G.sound('tick'); paint(); end(); if (done) return;
      turn = turn === '✖' ? '⭕' : '✖'; G.status(`${turn} to play`);
      if (ai && turn === '⭕') later(() => {
        const free = b.map((v, k) => (v ? -1 : k)).filter(k => k >= 0);
        const k = ai === 'hard' || Math.random() < 0.4 ? best([...b], '⭕').i : pick(free);
        b[k] = '⭕'; paint(); end(); turn = '✖'; G.status('✖ to play');
      }, 380);
    };
    paint(); G.status('✖ to play');
    el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Connect four
export const connect4 = {
  kind: 'dom', how: 'Drop discs. Four in a row (any direction) wins. You are 🟠.',
  start(G, el) {
    const W = 7, H = 6, ai = G.params.ai, b = Array(W * H).fill(0);
    let turn = 1, done = false;
    const g = grid(W, 'pz-c4');
    const win4 = p => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { let k = 0; while (k < 4 && b[(y + dy * k) * W + x + dx * k] === p && x + dx * k < W && y + dy * k >= 0 && y + dy * k < H) k++; if (k === 4) return true; } return false; };
    const drop = (x, p) => { for (let y = H - 1; y >= 0; y--) if (!b[y * W + x]) { b[y * W + x] = p; return y; } return -1; };
    const undo = x => { for (let y = 0; y < H; y++) if (b[y * W + x]) { b[y * W + x] = 0; return; } };
    const paint = () => g.replaceChildren(...b.map((v, i) => h('button', { class: 'pz-c' + (v === 1 ? ' p1' : v === 2 ? ' p2' : ''), onclick: () => play(i % W) })));
    const aiMove = () => {
      const cols = [...Array(W).keys()].filter(x => !b[x]);
      for (const p of [2, 1]) for (const x of cols) { drop(x, p); const w = win4(p); undo(x); if (w) return x; }
      return ai === 'easy' ? pick(cols) : pick(cols.filter(x => Math.abs(x - 3) <= 2).length ? cols.filter(x => Math.abs(x - 3) <= 2) : cols);
    };
    const play = x => {
      if (done || (ai && turn === 2) || drop(x, turn) < 0) return;
      G.sound('tick'); paint();
      if (win4(turn)) { done = true; return later(() => (turn === 1 ? G.win('Four in a row!') : G.win('🟣 wins!')), 300); }
      if (b.every(Boolean)) { done = true; return later(() => G.win('A draw'), 300); }
      turn = 3 - turn; G.status(turn === 1 ? '🟠 to play' : '🟣 to play');
      if (ai && turn === 2) later(() => { drop(aiMove(), 2); paint(); if (win4(2)) { done = true; return later(() => G.lose('The computer connected four'), 300); } turn = 1; G.status('🟠 to play'); }, 420);
    };
    paint(); G.status('🟠 to play');
    el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Simon says (colours + notes)
export const simon = {
  kind: 'dom', how: 'Watch the colours light up, then repeat the pattern.',
  start(G, el) {
    const fast = G.params.fast, seq = [];
    let pos = 0, busy = true;
    const notes = [261, 329, 392, 523], ac = new (window.AudioContext || window.webkitAudioContext)();
    const beep = i => { try { const o = ac.createOscillator(), g2 = ac.createGain(); o.frequency.value = notes[i]; g2.gain.setValueAtTime(0.12, ac.currentTime); g2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35); o.connect(g2).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.36); } catch { /* ignore */ } };
    const pads = ['#43a047', '#e53935', '#fdd835', '#1e88e5'].map((c, i) => h('button', { class: 'pz-simon', style: { '--c': c }, onclick: () => press(i) }));
    const flash = i => { pads[i].classList.add('lit'); beep(i); later(() => pads[i].classList.remove('lit'), fast ? 200 : 330); };
    const round = () => { busy = true; seq.push(rand(4)); pos = 0; G.status(`round ${seq.length}`); seq.forEach((v, k) => later(() => flash(v), 500 + k * (fast ? 320 : 520))); later(() => (busy = false), 500 + seq.length * (fast ? 320 : 520)); };
    const press = i => { if (busy) return; flash(i); if (i !== seq[pos]) return G.lose(`You remembered ${seq.length - 1}`); pos++; if (pos === seq.length) { G.add(10); later(round, 700); } };
    this.stop = () => { stopAll(); ac.close?.(); };
    el.append(h('div', { class: 'pz' }, h('div', { class: 'pz-simon-wrap' }, pads)));
    later(round, 600);
  },
};

// ================================================================ Blocks (falling blocks, canvas)
const SHAPES = [[[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[1, 1, 0], [0, 1, 1]], [[0, 1, 1], [1, 1, 0]]];
export const blocks = {
  w: 300, h: 600, how: '←/→ move, ↑ rotate, ↓ drop faster, Space hard-drop. Tap sides to move, tap top to rotate.',
  start(G) { G.k = { b: Array.from({ length: 20 }, () => Array(10).fill(0)), t: 0, speed: G.params.slow ? 0.9 : 0.6 }; this.spawn(G); },
  spawn(G) { const s = rand(SHAPES.length); G.k.p = { s: SHAPES[s].map(r => [...r]), x: 3, y: 0, c: PALETTE[s] }; if (this.coll(G, G.k.p.s, 3, 0)) G.lose('The stack reached the top'); },
  coll(G, s, x, y) { return s.some((r, i) => r.some((v, j) => v && (x + j < 0 || x + j > 9 || y + i > 19 || G.k.b[y + i]?.[x + j]))); },
  lock(G) {
    const k = G.k, p = k.p;
    p.s.forEach((r, i) => r.forEach((v, j) => { if (v) k.b[p.y + i][p.x + j] = p.c; }));
    const full = k.b.filter(r => r.every(Boolean)).length;
    k.b = k.b.filter(r => !r.every(Boolean)); while (k.b.length < 20) k.b.unshift(Array(10).fill(0));
    if (full) { G.add([0, 40, 100, 300, 1200][full]); G.sound('ok'); } else G.sound('tick');
    k.speed = Math.max(0.12, k.speed - full * 0.015);
    this.spawn(G);
  },
  key(G, key) {
    const p = G.k.p;
    if (key === 'ArrowLeft' && !this.coll(G, p.s, p.x - 1, p.y)) p.x--;
    if (key === 'ArrowRight' && !this.coll(G, p.s, p.x + 1, p.y)) p.x++;
    if (key === 'ArrowDown' && !this.coll(G, p.s, p.x, p.y + 1)) p.y++;
    if (key === 'ArrowUp') { const r = p.s[0].map((_, i) => p.s.map(row => row[i]).reverse()); if (!this.coll(G, r, p.x, p.y)) p.s = r; else if (!this.coll(G, r, p.x - 1, p.y)) { p.s = r; p.x--; } }
    if (key === ' ') { while (!this.coll(G, p.s, p.x, p.y + 1)) p.y++; this.lock(G); }
  },
  tap(G, x, y) { this.key(G, y < 200 ? 'ArrowUp' : x < 100 ? 'ArrowLeft' : x > 200 ? 'ArrowRight' : 'ArrowDown'); },
  update(G, dt) {
    const k = G.k; k.t += dt;
    if (k.t > k.speed) { k.t = 0; if (!this.coll(G, k.p.s, k.p.x, k.p.y + 1)) k.p.y++; else this.lock(G); }
  },
  draw(G, c) {
    const k = G.k;
    c.fillStyle = '#1a1446'; c.fillRect(0, 0, 300, 600);
    c.fillStyle = 'rgba(255,255,255,.04)'; for (let x = 0; x < 10; x++) for (let y = 0; y < 20; y++) if ((x + y) % 2) c.fillRect(x * 30, y * 30, 30, 30);
    const cell = (x, y, col) => { c.fillStyle = col; c.beginPath(); c.roundRect(x * 30 + 1, y * 30 + 1, 28, 28, 6); c.fill(); };
    k.b.forEach((r, y) => r.forEach((v, x) => v && cell(x, y, v)));
    if (k.p) k.p.s.forEach((r, i) => r.forEach((v, j) => v && cell(k.p.x + j, k.p.y + i, k.p.c)));
  },
};
