// Board, card and logic games. All DOM: no animation loop, so they cost almost nothing while you think.
import { h } from '../../core.js';
import { rand, pick, shuffle, clamp } from '../engine.js';
import { WORDS } from './brain.js';

const timers = new Set();
const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
const stopAll = () => { timers.forEach(clearTimeout); timers.clear(); };
const COLS6 = ['#ff4f9a', '#ffd23f', '#2fb8ff', '#9be15d', '#b18cff', '#ff8a1f'];
const grid = (n, cls) => h('div', { class: `bd-grid ${cls}`, style: { gridTemplateColumns: `repeat(${n}, 1fr)` } });
const nb4 = (i, W, H) => { const x = i % W, y = (i / W) | 0, o = []; if (x) o.push(i - 1); if (x < W - 1) o.push(i + 1); if (y) o.push(i - W); if (y < H - 1) o.push(i + W); return o; };
const shake = el => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };
const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ================================================================ Ball Sort
export const ballsort = {
  kind: 'dom', lowerIsBetter: true, how: 'Tap a tube to lift its top ball, then tap another tube to drop it on the same colour (or an empty tube). Sort every colour into its own tube!',
  start(G, el) {
    const n = G.params.colors || 4, cap = 4;
    const balls = shuffle([...Array(n)].flatMap((_, i) => Array(cap).fill(i)));
    const tubes = [...Array(n)].map((_, i) => balls.slice(i * cap, i * cap + cap)).concat([[], []]);
    let sel = null, moves = 0;
    const wrap = h('div', { class: 'bs' });
    const done = t => !t.length || (t.length === cap && t.every(x => x === t[0]));
    const paint = () => wrap.replaceChildren(...tubes.map((t, i) => h('button', { class: 'bs-tube' + (sel === i ? ' sel' : '') + (t.length === cap && done(t) ? ' full' : ''), onclick: () => tap(i) }, t.map(c => h('i', { style: { '--c': COLS6[c] } })))));
    const tap = i => {
      if (sel === null) { if (tubes[i].length) { sel = i; G.sound('tick'); } }
      else if (sel === i) sel = null;
      else {
        const a = tubes[sel], b = tubes[i];
        if (b.length < cap && (!b.length || b.at(-1) === a.at(-1))) { b.push(a.pop()); moves++; G.setScore(moves); G.sound('pop'); } else G.sound('error');
        sel = null;
      }
      paint();
      if (tubes.every(done)) later(() => G.win(`Sorted in ${moves} moves`), 300);
    };
    paint(); el.append(h('div', { class: 'pz' }, wrap));
  },
  stop: stopAll,
};

// ================================================================ Flood It
export const flood = {
  kind: 'dom', how: 'Start in the top-left corner. Pick a colour to flood your area and grab its neighbours. Fill the whole board before you run out of moves!',
  start(G, el) {
    const n = G.params.size || 10, limit = Math.round(n * 2.1), b = Array.from({ length: n * n }, () => rand(6) | 0);
    let moves = 0;
    const g = grid(n, 'fl'), cells = b.map(() => h('div', { class: 'fl-c' })); g.append(...cells);
    const paint = () => cells.forEach((c, i) => (c.style.background = COLS6[b[i]]));
    const go = col => {
      const from = b[0]; if (col === from) return;
      const seen = new Set([0]), st = [0];
      while (st.length) { const i = st.pop(); b[i] = col; for (const j of nb4(i, n, n)) if (!seen.has(j) && b[j] === from) { seen.add(j); st.push(j); } }
      moves++; G.status(`${moves} / ${limit} moves`); paint(); G.sound('pop');
      if (b.every(x => x === col)) { G.setScore((limit - moves + 1) * 10); G.win(`Filled in ${moves} moves`); }
      else if (moves >= limit) G.lose('Out of moves');
    };
    G.status(`0 / ${limit} moves`); paint();
    el.append(h('div', { class: 'pz' }, g, h('div', { class: 'fl-pick' }, COLS6.map((c, i) => h('button', { style: { '--c': c }, 'aria-label': `colour ${i + 1}`, onclick: () => go(i) })))));
  },
};

// ================================================================ Picture Logic (nonogram)
const PICS5 = {
  heart: ['01010', '11111', '11111', '01110', '00100'], house: ['00100', '01110', '11111', '01010', '01110'], smile: ['01010', '01010', '00000', '10001', '01110'],
  cat: ['10001', '11111', '10101', '11111', '01110'], tree: ['00100', '01110', '11111', '00100', '00100'], boat: ['00100', '00110', '00100', '11111', '01110'],
  star: ['00100', '11111', '01110', '01010', '10001'], key: ['01110', '01010', '01110', '00100', '00110'], duck: ['01100', '11100', '01111', '01110', '00000'],
};
export const nonogram = {
  kind: 'dom', how: 'Each number says how many filled squares sit together in that row or column. Tap squares to fill them and draw the hidden picture! (Right-click marks ✖.)',
  start(G, el) {
    const n = G.params.size || 5;
    let name = '', sol;
    if (n === 5) { const [k, p] = pick(Object.entries(PICS5)); name = k; sol = p.map(r => [...r].map(Number)); }
    else sol = Array.from({ length: n }, () => Array.from({ length: n }, () => (Math.random() < 0.6 ? 1 : 0)));
    const runs = a => { const o = []; let k = 0; for (const v of a) { if (v) k++; else if (k) { o.push(k); k = 0; } } if (k) o.push(k); return o.length ? o : [0]; };
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    const rowC = sol.map(runs), colC = sol[0].map((_, c) => runs(sol.map(r => r[c])));
    const cur = sol.map(r => r.map(() => 0)), cells = [];
    const g = h('div', { class: 'ng', style: { gridTemplateColumns: `auto repeat(${n}, minmax(0, 1fr))` } }, h('div'));
    colC.forEach(cl => g.append(h('div', { class: 'ng-clue col' }, cl.map(v => h('span', {}, v)))));
    sol.forEach((row, r) => {
      g.append(h('div', { class: 'ng-clue row' }, rowC[r].map(v => h('span', {}, v))));
      row.forEach((_, c) => { const b = h('button', { class: 'ng-c' + ((c + 1) % 5 === 0 && c < n - 1 ? ' br' : '') + ((r + 1) % 5 === 0 && r < n - 1 ? ' bb' : ''), onclick: () => set(r, c, cur[r][c] === 1 ? 0 : 1), oncontextmenu: e => { e.preventDefault(); set(r, c, cur[r][c] === 2 ? 0 : 2); } }); cells.push(b); g.append(b); });
    });
    let solved = false;
    const set = (r, c, v) => {
      if (solved) return;
      cur[r][c] = v; const b = cells[r * n + c]; b.classList.toggle('on', v === 1); b.classList.toggle('x', v === 2); G.sound('tick');
      const f = cur.map(row => row.map(x => (x === 1 ? 1 : 0)));
      if (f.every((row, i) => same(runs(row), rowC[i])) && f[0].every((_, j) => same(runs(f.map(rw => rw[j])), colC[j]))) {
        solved = true; G.setScore(n * 10); g.classList.add('done'); later(() => G.win(name ? `It's a ${name}!` : 'Solved!'), 500);
      }
    };
    el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Block Pop (same-colour groups)
export const samegame = {
  kind: 'dom', how: 'Tap a group of 2 or more touching blocks of the same colour to pop them. Bigger groups score much more. Clear the board for a big bonus!',
  start(G, el) {
    const W = 10, H = 8, n = G.params.colors || 4;
    const cols = Array.from({ length: W }, () => Array.from({ length: H }, () => rand(n) | 0));   // each column bottom-up
    const g = grid(W, 'sg');
    const group = (x, k) => {
      const col = cols[x]?.[k]; if (col === undefined) return [];
      const seen = new Set([`${x},${k}`]), q = [[x, k]];
      while (q.length) { const [a, b] = q.pop(); for (const [dx, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = a + dx, nk = b + dk, key = `${nx},${nk}`; if (!seen.has(key) && cols[nx]?.[nk] === col) { seen.add(key); q.push([nx, nk]); } } }
      return [...seen].map(s => s.split(',').map(Number));
    };
    const paint = () => { g.replaceChildren(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = H - 1 - y, v = cols[x]?.[k]; g.append(h('button', { class: 'sg-c' + (v === undefined ? ' e' : ''), style: v === undefined ? null : { '--c': COLS6[v] }, onclick: () => tap(x, k) })); } };
    let over = false;
    const tap = (x, k) => {
      if (over) return;
      const gr = group(x, k); if (gr.length < 2) { G.sound('error'); return; }
      const by = {}; for (const [a, b] of gr) (by[a] ||= []).push(b);
      for (const a in by) by[a].sort((p, q) => q - p).forEach(b => cols[a].splice(b, 1));
      for (let i = cols.length - 1; i >= 0; i--) if (!cols[i].length) cols.splice(i, 1);
      G.add((gr.length - 1) ** 2); G.sound('pop'); paint();
      const left = cols.reduce((s, c) => s + c.length, 0);
      if (!left) { over = true; G.add(500); return later(() => G.win('Board cleared! +500'), 300); }
      if (!cols.some((c, a) => c.some((_, b) => group(a, b).length > 1))) { over = true; later(() => G.win(`No more groups: ${left} blocks left`), 400); }
    };
    paint(); el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Fruit Swap (match three)
const GEMS = ['🍓', '🍋', '🍇', '🍏', '🫐', '🍊'];
export const match3 = {
  kind: 'dom', how: 'Tap a fruit, then a fruit next to it, to swap them. Make lines of 3 or more of the same fruit! You have 25 moves.',
  start(G, el) {
    const N = 8, K = G.params.kinds || 6, b = []; let sel = null, moves = G.params.moves || 25, busy = false;
    for (let i = 0; i < N * N; i++) { let v; do { v = rand(K) | 0; } while ((i % N >= 2 && b[i - 1] === v && b[i - 2] === v) || (i >= 2 * N && b[i - N] === v && b[i - 2 * N] === v)); b.push(v); }
    const g = grid(N, 'm3'), cells = b.map((_, i) => h('button', { class: 'm3-c', onclick: () => tap(i) })); g.append(...cells);
    const paint = (pop = new Set()) => cells.forEach((c, i) => { c.textContent = b[i] < 0 ? '' : GEMS[b[i]]; c.classList.toggle('sel', sel === i); c.classList.toggle('pop', pop.has(i)); });
    const find = () => {
      const m = new Set();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x, v = b[i]; if (v < 0) continue;
        if (x <= N - 3 && b[i + 1] === v && b[i + 2] === v) for (let k = x; k < N && b[y * N + k] === v; k++) m.add(y * N + k);
        if (y <= N - 3 && b[i + N] === v && b[i + 2 * N] === v) for (let k = y; k < N && b[k * N + x] === v; k++) m.add(k * N + x);
      }
      return m;
    };
    const settle = (chain = 1) => {
      const m = find();
      if (!m.size) { busy = false; if (moves <= 0) G.win(`${G.score} points`); return; }
      G.add(m.size * 10 * chain); G.sound(chain > 1 ? 'ok' : 'pop'); paint(m);
      later(() => {
        m.forEach(i => (b[i] = -1));
        for (let x = 0; x < N; x++) { const col = []; for (let y = N - 1; y >= 0; y--) if (b[y * N + x] >= 0) col.push(b[y * N + x]); for (let y = N - 1, k = 0; y >= 0; y--, k++) b[y * N + x] = k < col.length ? col[k] : rand(K) | 0; }
        paint(); later(() => settle(chain + 1), 200);
      }, 260);
    };
    const tap = i => {
      if (busy) return;
      if (sel === null || sel === i) { sel = sel === i ? null : i; G.sound('tick'); return paint(); }
      const a = sel; sel = null;
      const adj = Math.abs(a - i) === N || (Math.abs(a - i) === 1 && Math.floor(a / N) === Math.floor(i / N));
      if (!adj) { sel = i; return paint(); }
      [b[a], b[i]] = [b[i], b[a]];
      if (!find().size) { [b[a], b[i]] = [b[i], b[a]]; G.sound('error'); shake(cells[i]); return paint(); }
      moves--; G.status(`${moves} moves left`); busy = true; settle();
    };
    G.status(`${moves} moves left`); paint(); el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Peg Solitaire
export const pegs = {
  kind: 'dom', how: 'Jump a peg over its neighbour into an empty hole; the jumped peg is removed. Try to finish with just one peg!',
  start(G, el) {
    const on = (r, c) => !((r < 2 || r > 4) && (c < 2 || c > 4));
    const b = Array.from({ length: 49 }, (_, i) => (on((i / 7) | 0, i % 7) ? 1 : -1)); b[24] = 0;
    let sel = null, over = false;
    const g = grid(7, 'pg'), cells = b.map((v, i) => h('button', { class: 'pg-c' + (v < 0 ? ' off' : ''), disabled: v < 0, onclick: () => tap(i) })); g.append(...cells);
    const paint = () => cells.forEach((c, i) => { c.classList.toggle('peg', b[i] === 1); c.classList.toggle('sel', sel === i); });
    const mid = (a, z) => { const ar = (a / 7) | 0, ac = a % 7, zr = (z / 7) | 0, zc = z % 7; return (Math.abs(ar - zr) === 2 && ac === zc) || (Math.abs(ac - zc) === 2 && ar === zr) ? ((ar + zr) / 2) * 7 + (ac + zc) / 2 : -1; };
    const canMove = () => b.some((v, i) => v === 1 && [-14, 14, -2, 2].some(d => { const z = i + d; if (z < 0 || z > 48 || b[z] !== 0) return false; const m = mid(i, z); return m >= 0 && b[m] === 1; }));
    const tap = i => {
      if (over) return;
      if (b[i] === 1) { sel = sel === i ? null : i; G.sound('tick'); return paint(); }
      if (b[i] !== 0 || sel === null) return;
      const m = mid(sel, i);
      if (m < 0 || b[m] !== 1) { G.sound('error'); return; }
      b[sel] = 0; b[m] = 0; b[i] = 1; sel = i; G.add(1); G.sound('pop'); paint();
      const left = b.filter(v => v === 1).length;
      if (!canMove()) { over = true; later(() => (left <= 3 ? G.win(left === 1 ? 'Perfect: one peg left!' : `${left} pegs left`) : G.lose(`No more jumps: ${left} pegs left`)), 400); }
    };
    paint(); el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Tower of Hanoi
export const hanoi = {
  kind: 'dom', lowerIsBetter: true, how: 'Move the whole tower to the right-hand peg. Tap a peg to lift its top ring, then tap another peg. A ring can never sit on a smaller one.',
  start(G, el) {
    const n = G.params.discs || 4, t = [[...Array(n)].map((_, i) => n - i), [], []]; let sel = null, moves = 0;
    const wrap = h('div', { class: 'hn' });
    const paint = () => wrap.replaceChildren(...t.map((p, i) => h('button', { class: 'hn-peg' + (sel === i ? ' sel' : ''), 'aria-label': `peg ${i + 1}`, onclick: () => tap(i) }, h('i', { class: 'hn-pole' }), p.map(d => h('b', { style: { width: `${28 + d * (64 / n)}%`, '--c': COLS6[d % 6] } })))));
    const tap = i => {
      if (sel === null) { if (t[i].length) sel = i; }
      else {
        if (i !== sel) { const d = t[sel].at(-1); if (!t[i].length || t[i].at(-1) > d) { t[i].push(t[sel].pop()); moves++; G.setScore(moves); G.sound('pop'); } else G.sound('error'); }
        sel = null;
      }
      paint();
      if (t[2].length === n) later(() => G.win(moves === 2 ** n - 1 ? `Perfect! ${moves} moves` : `${moves} moves (the best is ${2 ** n - 1})`), 300);
    };
    G.status(`best possible: ${2 ** n - 1} moves`); paint(); el.append(h('div', { class: 'pz' }, wrap));
  },
  stop: stopAll,
};

// ================================================================ Checkers vs computer
export const checkers = {
  kind: 'dom', how: 'You are orange and move up the board. Move diagonally; jump over a blue piece to capture it (you must capture when you can). Reach the far side to become a king 👑.',
  start(G, el) {
    const B = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => ((r + c) % 2 && r < 3 ? { side: 'cpu' } : (r + c) % 2 && r > 4 ? { side: 'me' } : null)));
    let sel = null, forced = null, turn = 'me', over = false;
    const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
    const dirs = p => (p.king ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : p.side === 'me' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
    const movesFor = (r, c) => {
      const p = B[r][c], out = [];
      for (const [dr, dc] of dirs(p)) {
        const r1 = r + dr, c1 = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc;
        if (inB(r2, c2) && B[r1][c1] && B[r1][c1].side !== p.side && !B[r2][c2]) out.push({ r, c, tr: r2, tc: c2, cap: [r1, c1] });
        else if (inB(r1, c1) && !B[r1][c1]) out.push({ r, c, tr: r1, tc: c1 });
      }
      return out;
    };
    const legal = side => {
      if (forced) return movesFor(...forced).filter(m => m.cap);
      const all = []; B.forEach((row, r) => row.forEach((p, c) => p && p.side === side && all.push(...movesFor(r, c))));
      const caps = all.filter(m => m.cap); return caps.length ? caps : all;
    };
    const apply = m => {
      const p = B[m.r][m.c]; B[m.tr][m.tc] = p; B[m.r][m.c] = null; let crowned = false;
      if (m.cap) { B[m.cap[0]][m.cap[1]] = null; G.sound('pop'); } else G.sound('tick');
      if (!p.king && ((p.side === 'me' && m.tr === 0) || (p.side === 'cpu' && m.tr === 7))) { p.king = crowned = true; G.sound('ok'); }
      if (m.cap && !crowned && movesFor(m.tr, m.tc).some(x => x.cap)) { forced = [m.tr, m.tc]; return true; }
      forced = null; return false;
    };
    const count = side => B.flat().filter(p => p && p.side === side).length;
    const end = () => {
      const mine = count('me'), theirs = count('cpu'); G.setScore((12 - theirs) * 10); G.status(`you ${mine} · computer ${theirs}`);
      if (!theirs || (turn === 'cpu' && !legal('cpu').length)) { over = true; G.win('You won!'); return true; }
      if (!mine || (turn === 'me' && !legal('me').length)) { over = true; G.lose('The computer won'); return true; }
      return false;
    };
    const danger = m => {
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const er = m.tr + dr, ec = m.tc + dc, lr = m.tr - dr, lc = m.tc - dc; if (!inB(er, ec) || !inB(lr, lc)) continue;
        const e = B[er][ec]; if (e && e.side === 'me' && (e.king || dr > 0) && (!B[lr][lc] || (lr === m.r && lc === m.c))) return true;
      }
      return false;
    };
    const cpu = () => {
      if (over) return;
      const ms = legal('cpu'); if (!ms.length) return end();
      const caps = ms.filter(x => x.cap), safe = ms.filter(x => !danger(x));
      const m = caps.length ? pick(caps) : Math.random() < (G.params.smart ?? 0.85) && safe.length ? pick(safe) : pick(ms);
      const again = apply(m); paint();
      if (again) return later(cpu, 450);
      turn = 'me'; paint(); end();
    };
    const g = grid(8, 'ck');
    const paint = () => {
      const opts = turn === 'me' && !over ? legal('me') : [], targets = sel ? opts.filter(m => m.r === sel[0] && m.c === sel[1]) : [];
      g.replaceChildren(...B.flatMap((row, r) => row.map((p, c) => h('button', {
        class: 'ck-c' + ((r + c) % 2 ? ' dark' : '') + (sel && sel[0] === r && sel[1] === c ? ' sel' : '') + (targets.some(m => m.tr === r && m.tc === c) ? ' to' : '') + (!sel && opts.some(m => m.r === r && m.c === c) ? ' can' : ''),
        onclick: () => tap(r, c),
      }, p ? h('i', { class: `ck-p ${p.side}` }, p.king ? '👑' : '') : null))));
    };
    const tap = (r, c) => {
      if (turn !== 'me' || over) return;
      const opts = legal('me');
      if (!forced && B[r][c]?.side === 'me' && opts.some(m => m.r === r && m.c === c)) { sel = [r, c]; G.sound('tick'); return paint(); }
      const m = sel && opts.find(x => x.r === sel[0] && x.c === sel[1] && x.tr === r && x.tc === c);
      if (!m) return;
      const again = apply(m); sel = again ? [m.tr, m.tc] : null; paint();
      if (again) return;
      turn = 'cpu'; paint(); if (end()) return; G.status('computer is thinking…'); later(cpu, 600);
    };
    paint(); end(); el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Flip Discs (reversi rules)
const RW = [100, -20, 10, 5, 5, 10, -20, 100, -20, -50, -2, -2, -2, -2, -50, -20, 10, -2, 1, 1, 1, 1, -2, 10, 5, -2, 1, 0, 0, 1, -2, 5, 5, -2, 1, 0, 0, 1, -2, 5, 10, -2, 1, 1, 1, 1, -2, 10, -20, -50, -2, -2, -2, -2, -50, -20, 100, -20, 10, 5, 5, 10, -20, 100];
export const reversi = {
  kind: 'dom', how: 'Put a disc where it traps the other colour in a straight line between your discs: the trapped discs flip to orange. The most discs at the end wins!',
  start(G, el) {
    const B = Array(64).fill(0); B[27] = B[36] = 2; B[28] = B[35] = 1;   // 1 = you, 2 = computer
    const D = [-9, -8, -7, -1, 1, 7, 8, 9]; let turn = 1, over = false;
    const ok = (j, d) => j >= 0 && j < 64 && Math.abs((j % 8) - ((j - d) % 8)) <= 1;
    const flips = (i, p) => {
      if (B[i]) return [];
      const out = [];
      for (const d of D) { const ln = []; let j = i + d; while (ok(j, d) && B[j] === 3 - p) { ln.push(j); j += d; } if (ln.length && ok(j, d) && B[j] === p) out.push(...ln); }
      return out;
    };
    const movesOf = p => B.map((_, i) => i).filter(i => flips(i, p).length);
    const g = grid(8, 'rv'), cells = B.map((_, i) => h('button', { class: 'rv-c', onclick: () => tap(i) })); g.append(...cells);
    const counts = () => [B.filter(v => v === 1).length, B.filter(v => v === 2).length];
    const paint = () => {
      const hint = turn === 1 && !over ? new Set(movesOf(1)) : new Set();
      cells.forEach((c, i) => c.replaceChildren(B[i] ? h('i', { class: 'rv-d ' + (B[i] === 1 ? 'me' : 'cpu') }) : hint.has(i) ? h('i', { class: 'rv-hint' }) : ''));
      const [me, them] = counts(); G.setScore(me); G.status(`you ${me} · computer ${them}`);
    };
    const place = (i, p) => { for (const j of flips(i, p)) B[j] = p; B[i] = p; G.sound(p === 1 ? 'pop' : 'tick'); };
    const finish = () => { over = true; paint(); const [me, them] = counts(); me > them ? G.win(`${me} to ${them}`) : G.lose(me === them ? `A draw, ${me} each` : `${me} to ${them}`); };
    const cpu = () => {
      if (over) return;
      const ms = movesOf(2);
      if (ms.length) { const smart = G.params.smart ?? 1; place(ms.map(i => [i, RW[i] * smart + flips(i, 2).length + Math.random() * 3]).sort((a, b) => b[1] - a[1])[0][0], 2); }
      turn = 1; paint();
      if (!movesOf(1).length) { if (!movesOf(2).length) return finish(); turn = 2; G.status('You have no move: the computer goes again'); later(cpu, 800); }
    };
    const tap = i => {
      if (turn !== 1 || over || !flips(i, 1).length) return;
      place(i, 1); turn = 2; paint();
      if (!movesOf(2).length) { if (!movesOf(1).length) return finish(); turn = 1; paint(); G.status('The computer has no move: your turn again'); return; }
      later(cpu, 650);
    };
    paint(); el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Dots & Boxes
export const dots = {
  kind: 'dom', how: 'Take turns drawing a line between two dots. Finish the fourth side of a box to win it, then go again. The most boxes wins!',
  start(G, el) {
    const N = G.params.size || 4, S = 2 * N + 1, lines = new Set(), cells = {};
    let turn = 'me', mine = 0, theirs = 0, over = false;
    const tpl = Array.from({ length: S }, (_, i) => (i % 2 ? '1fr' : '14px')).join(' ');
    const g = h('div', { class: 'db', style: { gridTemplateColumns: tpl, gridTemplateRows: tpl } });
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
      const kind = r % 2 === 0 && c % 2 === 0 ? 'dot' : r % 2 === 0 || c % 2 === 0 ? 'line' : 'box';
      const e = h(kind === 'line' ? 'button' : 'div', { class: `db-${kind}` + (kind === 'line' ? (r % 2 === 0 ? ' h' : ' v') : ''), onclick: kind === 'line' ? () => turn === 'me' && !over && play(r, c) : null });
      cells[`${r},${c}`] = e; g.append(e);
    }
    const sides = (r, c) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => lines.has(`${a},${b}`)).length;
    const boxesOf = (r, c) => (r % 2 === 0 ? [[r - 1, c], [r + 1, c]] : [[r, c - 1], [r, c + 1]]).filter(([a, b]) => a > 0 && b > 0 && a < S - 1 && b < S - 1);
    const play = (r, c) => {
      const k = `${r},${c}`; if (lines.has(k)) return;
      lines.add(k); cells[k].classList.add('on', turn); G.sound('tick');
      let closed = 0;
      for (const [a, b] of boxesOf(r, c)) if (sides(a, b) === 4) { const bx = cells[`${a},${b}`]; bx.classList.add(turn); bx.textContent = turn === 'me' ? '🍊' : '🤖'; closed++; turn === 'me' ? mine++ : theirs++; }
      if (closed) G.sound('pop');
      G.setScore(mine); G.status(`you ${mine} · computer ${theirs}`);
      if (mine + theirs === N * N) { over = true; return later(() => (mine > theirs ? G.win(`${mine} boxes to ${theirs}`) : G.lose(mine === theirs ? 'A draw!' : `${mine} boxes to ${theirs}`)), 400); }
      if (!closed) turn = turn === 'me' ? 'cpu' : 'me';
      if (turn === 'cpu') later(cpu, 500);
    };
    const free = () => Object.keys(cells).filter(k => cells[k].classList.contains('db-line') && !lines.has(k)).map(k => k.split(',').map(Number));
    const cpu = () => {
      if (over) return;
      const f = free(); if (!f.length) return;
      const smart = Math.random() < (G.params.smart ?? 0.9);
      const completes = f.find(([r, c]) => boxesOf(r, c).some(([a, b]) => sides(a, b) === 3));
      if (completes && smart) return play(...completes);
      const safe = f.filter(([r, c]) => boxesOf(r, c).every(([a, b]) => sides(a, b) < 2));
      play(...pick(safe.length && smart ? safe : f));
    };
    G.status('you 0 · computer 0'); el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Last Lollipop (Nim)
export const nim = {
  kind: 'dom', how: 'Take 1, 2 or 3 lollipops on your turn, then the computer takes some. Whoever takes the LAST lollipop wins! (There is a secret trick…)',
  start(G, el) {
    let n = G.params.count || 15, turn = 'me', over = false;
    const pile = h('div', { class: 'nm-pile' }), info = h('div', { class: 'nm-info' }, 'Your turn');
    const btns = h('div', { class: 'nm-btns' }, [1, 2, 3].map(k => h('button', { class: 'btn primary', onclick: () => take(k, 'me') }, `Take ${k}`)));
    const paint = () => { pile.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', { class: 'nm-l', style: { '--i': i } }, '🍭'))); btns.querySelectorAll('button').forEach((b, i) => (b.disabled = over || i + 1 > n || turn !== 'me')); };
    const take = (k, who) => {
      if (over || who !== turn || k > n) return;
      n -= k; G.sound('pop'); info.textContent = `${who === 'me' ? 'You' : 'The computer'} took ${k}. ${n} left.`;
      if (!n) { over = true; paint(); return later(() => (who === 'me' ? (G.setScore(10), G.win('You took the last lollipop!')) : G.lose('The computer took the last one')), 500); }
      turn = who === 'me' ? 'cpu' : 'me'; paint();
      if (turn === 'cpu') later(() => take(n % 4 && Math.random() < (G.params.smart ?? 0.8) ? n % 4 : Math.min(n, 1 + (rand(3) | 0)), 'cpu'), 900);
      else info.textContent += ' Your turn!';
    };
    paint(); el.append(h('div', { class: 'qz' }, pile, info, btns));
  },
  stop: stopAll,
};

// ================================================================ Word Search
export const wordsearch = {
  kind: 'dom', how: 'Find the hidden words! Tap the first letter of a word, then its last letter. Words go across, down or diagonally.',
  start(G, el) {
    const N = G.params.size || 8, want = G.params.count || 6, set = WORDS[G.params.set || 'animals'].filter(([w]) => w.length <= N);
    const B = Array(N * N).fill(''), placed = [];
    for (const [w, e] of shuffle(set)) {
      if (placed.length >= want) break;
      for (let t = 0; t < 80; t++) {
        const [dx, dy] = pick([[1, 0], [0, 1], [1, 1]]), x = rand(N - dx * (w.length - 1)) | 0, y = rand(N - dy * (w.length - 1)) | 0;
        const cells = [...w].map((_, k) => (y + dy * k) * N + x + dx * k);
        if (cells.every((i, k) => !B[i] || B[i] === w[k])) { cells.forEach((i, k) => (B[i] = w[k])); placed.push({ w, e, cells, found: false }); break; }
      }
    }
    B.forEach((v, i) => { if (!v) B[i] = String.fromCharCode(65 + (rand(26) | 0)); });
    let first = null, hue = 0;
    const g = grid(N, 'ws'), cells = B.map((ch, i) => h('button', { class: 'ws-c', onclick: () => tap(i) }, ch)); g.append(...cells);
    const list = h('div', { class: 'ws-list' }, placed.map(p => (p.tag = h('span', { class: 'ws-w' }, `${p.e} ${p.w}`))));
    const tap = i => {
      if (first === null) { first = i; cells[i].classList.add('sel'); G.sound('tick'); return; }
      const a = first; first = null; cells[a].classList.remove('sel');
      const ax = a % N, ay = (a / N) | 0, bx = i % N, by = (i / N) | 0, dx = Math.sign(bx - ax), dy = Math.sign(by - ay), len = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) + 1;
      if (!(ax === bx || ay === by || Math.abs(bx - ax) === Math.abs(by - ay))) return G.sound('error');
      const path = Array.from({ length: len }, (_, k) => (ay + dy * k) * N + ax + dx * k), key = path.join(), rev = [...path].reverse().join();
      const p = placed.find(q => !q.found && (q.cells.join() === key || q.cells.join() === rev));
      if (!p) { G.sound('error'); return shake(g); }
      p.found = true; hue += 67; path.forEach(j => { cells[j].classList.add('found'); cells[j].style.setProperty('--c', `hsl(${hue % 360},80%,62%)`); }); p.tag.classList.add('got');
      G.add(10); G.sound('ok');
      if (placed.every(q => q.found)) later(() => G.win('You found every word!'), 400);
    };
    el.append(h('div', { class: 'pz' }, list, g));
  },
  stop: stopAll,
};

// ================================================================ Spot the Difference
export const spotdiff = {
  kind: 'dom', how: 'The two pictures look the same, but some things are different. Tap the differences on either side!',
  start(G, el) {
    const n = G.params.size || 5, k = G.params.diffs || 3;
    const pool = pick([['🍎', '🍌', '🍇', '🍓', '🍊', '🍍', '🥝', '🍒'], ['🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐸'], ['🚗', '🚕', '🚌', '🚓', '🚑', '🚒', '🚜', '🛵'], ['⭐', '🌙', '☀️', '☁️', '⚡', '❄️', '🌈', '🔥'], ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎱', '🏓']]);
    const left = Array.from({ length: n * n }, () => pick(pool)), right = [...left], diff = new Set(shuffle([...Array(n * n).keys()]).slice(0, k));
    for (const i of diff) { let e; do { e = pick(pool); } while (e === left[i]); right[i] = e; }
    const found = new Set(); let over = false;
    const side = arr => { const g = grid(n, 'sd'); arr.forEach((e, i) => g.append(h('button', { class: 'sd-c', dataset: { i }, onclick: ev => tap(i, ev.currentTarget) }, e))); return g; };
    const L = side(left), R = side(right);
    const tap = (i, btn) => {
      if (over) return;
      if (diff.has(i) && !found.has(i)) { found.add(i); [L, R].forEach(g => g.querySelector(`[data-i="${i}"]`).classList.add('found')); G.add(10); G.sound('ok'); G.status(`${found.size} of ${k} found`); if (found.size === k) { over = true; later(() => G.win('You found them all!'), 400); } }
      else if (!diff.has(i)) { G.sound('error'); shake(btn); }
    };
    G.status(`0 of ${k} found`); el.append(h('div', { class: 'pz sd-wrap' }, L, R));
  },
  stop: stopAll,
};

// ================================================================ Picture Swap (jigsaw)
function scene(S) {
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
  const kind = pick(['day', 'night', 'sea', 'farm']);
  const sky = c.createLinearGradient(0, 0, 0, S);
  const cols = { day: ['#4fc3f7', '#e1f5fe'], night: ['#1a237e', '#7e57c2'], sea: ['#81d4fa', '#0277bd'], farm: ['#ffb74d', '#fff3e0'] }[kind];
  sky.addColorStop(0, cols[0]); sky.addColorStop(1, cols[1]); c.fillStyle = sky; c.fillRect(0, 0, S, S);
  const em = (e, x, y, s) => { c.font = `${s}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, x, y); };
  c.fillStyle = kind === 'sea' ? '#f9e0a8' : '#66bb6a'; c.beginPath(); c.ellipse(S * 0.3, S * 1.05, S * 0.7, S * 0.35, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = kind === 'sea' ? '#ffe082' : '#43a047'; c.beginPath(); c.ellipse(S * 0.85, S * 1.1, S * 0.6, S * 0.4, 0, 0, Math.PI * 2); c.fill();
  em(kind === 'night' ? '🌙' : '☀️', S * 0.8, S * 0.18, S * 0.16);
  const things = { day: ['🏠', '🌳', '🐶', '🌷', '🦋'], night: ['🏰', '⭐', '🦉', '🌲', '✨'], sea: ['⛵', '🐬', '🐚', '🦀', '🌴'], farm: ['🚜', '🐄', '🐔', '🌻', '🐷'] }[kind];
  em(things[0], S * 0.32, S * 0.62, S * 0.26); em(things[1], S * 0.72, S * 0.55, S * 0.2); em(things[2], S * 0.55, S * 0.82, S * 0.16);
  em(things[3], S * 0.14, S * 0.85, S * 0.13); em(things[4], S * 0.2, S * 0.25, S * 0.12); em(things[4], S * 0.5, S * 0.12, S * 0.08);
  return cv.toDataURL('image/png');
}
export const jigsaw = {
  kind: 'dom', lowerIsBetter: true, how: 'The picture is all mixed up! Tap two pieces to swap them. Put it back together in as few swaps as you can.',
  start(G, el) {
    const n = G.params.size || 3, url = scene(360);
    let order = shuffle([...Array(n * n).keys()]); while (order.every((v, i) => v === i)) order = shuffle(order);
    let sel = null, swaps = 0, over = false;
    const g = h('div', { class: 'jg', style: { gridTemplateColumns: `repeat(${n}, 1fr)` } });
    const paint = () => g.replaceChildren(...order.map((piece, i) => h('button', {
      class: 'jg-p' + (sel === i ? ' sel' : '') + (piece === i ? ' ok' : ''), 'aria-label': `piece ${i + 1}`, onclick: () => tap(i),
      style: { backgroundImage: `url(${url})`, backgroundSize: `${n * 100}%`, backgroundPosition: `${((piece % n) / (n - 1)) * 100}% ${(Math.floor(piece / n) / (n - 1)) * 100}%` },
    })));
    const tap = i => {
      if (over) return;
      if (sel === null) { sel = i; G.sound('tick'); return paint(); }
      if (sel !== i) { [order[sel], order[i]] = [order[i], order[sel]]; swaps++; G.setScore(swaps); G.sound('pop'); }
      sel = null; paint();
      if (order.every((v, k) => v === k)) { over = true; g.classList.add('done'); later(() => G.win(`Done in ${swaps} swaps`), 500); }
    };
    paint();
    el.append(h('div', { class: 'pz jg-wrap' }, g, h('div', { class: 'jg-peek' }, h('small', {}, 'Picture'), h('img', { src: url, alt: 'the finished picture' }))));
  },
  stop: stopAll,
};

// ================================================================ Code Breaker
const PEGS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];
export const mastermind = {
  kind: 'dom', how: 'The computer hid a secret code of colours. Guess it in 10 tries! ⚫ = right colour in the right place, ⚪ = right colour in the wrong place.',
  start(G, el) {
    const L = G.params.len || 4, tries = 10, secret = Array.from({ length: L }, () => rand(6) | 0), rows = [];
    let cur = [], over = false;
    const board = h('div', { class: 'mm-board' }), slots = h('div', { class: 'mm-row cur' });
    const paint = () => {
      board.replaceChildren(...rows.map(r => h('div', { class: 'mm-row' }, r.g.map(c => h('span', {}, PEGS[c])), h('em', {}, '⚫'.repeat(r.b) + '⚪'.repeat(r.w) || '–'))));
      slots.replaceChildren(...Array.from({ length: L }, (_, i) => h('span', { class: i < cur.length ? '' : 'empty' }, i < cur.length ? PEGS[cur[i]] : '·')));
      G.status(`try ${Math.min(rows.length + 1, tries)} of ${tries}`);
    };
    const check = () => {
      if (cur.length < L || over) return;
      const b = cur.filter((c, i) => c === secret[i]).length;
      const w = [...Array(6).keys()].reduce((s, col) => s + Math.min(cur.filter(x => x === col).length, secret.filter(x => x === col).length), 0) - b;
      rows.push({ g: cur, b, w }); cur = []; G.sound(b === L ? 'ok' : 'pop'); paint();
      if (b === L) { over = true; G.setScore((tries - rows.length + 1) * 10); later(() => G.win(`Cracked in ${rows.length} tries!`), 400); }
      else if (rows.length >= tries) { over = true; later(() => G.lose(`The code was ${secret.map(c => PEGS[c]).join('')}`), 400); }
    };
    const pad = h('div', { class: 'mm-pad' }, PEGS.map((p, i) => h('button', { class: 'btn', onclick: () => { if (cur.length < L && !over) { cur.push(i); G.sound('tick'); paint(); } } }, p)),
      h('button', { class: 'btn ghost', onclick: () => { cur.pop(); paint(); } }, '⌫'), h('button', { class: 'btn primary', onclick: check }, 'Check'));
    paint(); el.append(h('div', { class: 'qz' }, board, slots, pad));
  },
  stop: stopAll,
};

// ================================================================ Sea Hunt (find the ships)
export const battleship = {
  kind: 'dom', how: 'Ships are hiding in the sea. Tap a square to fire. 💥 is a hit, 💧 is a miss. Sink all 4 ships before you run out of shots!',
  start(G, el) {
    const N = 8, ships = [4, 3, 3, 2], B = Array(N * N).fill(-1), hits = ships.map(() => 0);
    ships.forEach((len, s) => { for (let t = 0; t < 300; t++) { const hz = Math.random() < 0.5, x = rand(N - (hz ? len - 1 : 0)) | 0, y = rand(N - (hz ? 0 : len - 1)) | 0, cells = Array.from({ length: len }, (_, k) => (y + (hz ? 0 : k)) * N + x + (hz ? k : 0)); if (cells.every(i => B[i] < 0)) { cells.forEach(i => (B[i] = s)); break; } } });
    let shots = G.params.shots || 40, sunk = 0, over = false;
    const g = grid(N, 'bt'), cells = B.map((_, i) => h('button', { class: 'bt-c', onclick: () => fire(i) })); g.append(...cells);
    const status = () => G.status(`${shots} shots · ${sunk}/4 ships sunk`);
    const fire = i => {
      const c = cells[i]; if (over || c.dataset.done) return; c.dataset.done = 1; shots--;
      const s = B[i];
      if (s >= 0) {
        hits[s]++; c.textContent = '💥'; c.classList.add('hit'); G.add(5); G.sound('pop');
        if (hits[s] === ships[s]) { sunk++; G.add(20); G.sound('ok'); B.forEach((v, j) => { if (v === s) { cells[j].textContent = '🚢'; cells[j].classList.add('sunk'); } }); }
      } else { c.textContent = '💧'; c.classList.add('miss'); G.sound('tick'); }
      status();
      if (sunk === ships.length) { over = true; later(() => G.win(`All ships found with ${shots} shots to spare`), 400); }
      else if (shots <= 0) { over = true; B.forEach((v, j) => { if (v >= 0 && !cells[j].dataset.done) { cells[j].textContent = '🚢'; cells[j].classList.add('reveal'); } }); later(() => G.lose('Out of shots'), 600); }
    };
    status(); el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Snakes & Ladders
const LADDERS = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 }, SNAKES = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 99: 41 };
export const snakes = {
  kind: 'dom', how: 'Roll the dice and race the computer to square 100. Ladders carry you up, snakes slide you down!',
  start(G, el) {
    const pos = { me: 1, cpu: 1 }; let busy = false, over = false;
    const xy = n => { const r = Math.floor((n - 1) / 10), c = r % 2 ? 9 - ((n - 1) % 10) : (n - 1) % 10; return [c + 0.5, 9 - r + 0.5]; };
    const board = h('div', { class: 'sl' });
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { const r = 9 - y, n = r * 10 + (r % 2 ? 10 - x : x + 1); board.append(h('div', { class: 'sl-c' + ((x + y) % 2 ? ' alt' : '') + (n === 100 ? ' end' : '') }, h('small', {}, n))); }
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 10 10'); svg.setAttribute('class', 'sl-svg');
    const add = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
    for (const [a, b] of Object.entries(LADDERS)) {
      const [x1, y1] = xy(+a), [x2, y2] = xy(b), dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy), ox = (-dy / l) * 0.16, oy = (dx / l) * 0.16;
      for (const s of [1, -1]) add('line', { x1: x1 + ox * s, y1: y1 + oy * s, x2: x2 + ox * s, y2: y2 + oy * s, stroke: '#8d6e63', 'stroke-width': 0.09, 'stroke-linecap': 'round' });
      for (let k = 1; k < l * 2.5; k++) { const t = k / (l * 2.5); add('line', { x1: x1 + dx * t + ox, y1: y1 + dy * t + oy, x2: x1 + dx * t - ox, y2: y1 + dy * t - oy, stroke: '#a1887f', 'stroke-width': 0.07 }); }
    }
    for (const [a, b] of Object.entries(SNAKES)) {
      const [x1, y1] = xy(+a), [x2, y2] = xy(b), mx = (x1 + x2) / 2 + (y2 - y1) * 0.25, my = (y1 + y2) / 2 - (x2 - x1) * 0.25;
      add('path', { d: `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`, stroke: '#43a047', 'stroke-width': 0.26, fill: 'none', 'stroke-linecap': 'round', opacity: 0.85 });
      add('circle', { cx: x1, cy: y1, r: 0.22, fill: '#2e7d32' });
    }
    board.append(svg);
    const tok = { me: h('span', { class: 'sl-t' }, '🍊'), cpu: h('span', { class: 'sl-t cpu' }, '🤖') }; board.append(tok.me, tok.cpu);
    const place = () => { for (const k of ['me', 'cpu']) { const [x, y] = xy(pos[k]); tok[k].style.left = `${x * 10}%`; tok[k].style.top = `${y * 10}%`; } };
    const die = h('div', { class: 'sl-die' }, '🎲'), info = h('div', { class: 'nm-info' }, 'Your turn: roll the dice!');
    const rollBtn = h('button', { class: 'btn primary', onclick: () => !busy && !over && roll('me') }, 'Roll 🎲');
    const roll = who => {
      busy = true; rollBtn.disabled = true;
      const d = 1 + (rand(6) | 0); die.textContent = DIE[d - 1]; G.sound('tick');
      let left = d;
      const step = () => {
        if (left > 0 && pos[who] < 100) { pos[who]++; left--; place(); G.sound('tick'); return later(step, 170); }
        const to = LADDERS[pos[who]] || SNAKES[pos[who]];
        if (to) { info.textContent = `${who === 'me' ? 'You' : 'The computer'} ${to > pos[who] ? 'climbed a ladder! 🪜' : 'slid down a snake! 🐍'}`; G.sound(to > pos[who] ? 'ok' : 'error'); pos[who] = to; later(place, 250); }
        else info.textContent = `${who === 'me' ? 'You' : 'The computer'} rolled ${d}.`;
        if (who === 'me') G.setScore(pos.me);
        if (pos[who] >= 100) { over = true; return later(() => (who === 'me' ? G.win('You reached 100 first!') : G.lose('The computer reached 100 first')), 600); }
        if (who === 'me') later(() => roll('cpu'), 900); else later(() => { busy = false; rollBtn.disabled = false; info.textContent += ' Your turn!'; }, 500);
      };
      later(step, 350);
    };
    place(); el.append(h('div', { class: 'pz sl-wrap' }, board, h('div', { class: 'sl-side' }, die, rollBtn, info)));
  },
  stop: stopAll,
};

// ================================================================ Dice Race (pig)
export const pig = {
  kind: 'dom', how: 'Roll as many times as you like and add up the points, but roll a ⚀ and you lose this turn\'s points! Press Keep to bank them. First to 50 wins.',
  start(G, el) {
    const goal = G.params.goal || 50, score = { me: 0, cpu: 0 }; let pts = 0, turn = 'me', over = false, busy = false;
    const die = h('div', { class: 'pig-die' }, '🎲'), info = h('div', { class: 'nm-info' }, 'Your turn');
    const bar = who => h('div', { class: 'pig-bar ' + who }, h('b', {}, who === 'me' ? 'You 🍊' : 'Computer 🤖'), h('i', { style: { width: `${Math.min(100, (score[who] / goal) * 100)}%` } }), h('span', {}, score[who]));
    const bars = h('div', { class: 'pig-bars' }), turnEl = h('div', { class: 'qz-big sm' });
    const rollB = h('button', { class: 'btn primary', onclick: () => turn === 'me' && !busy && roll() }, 'Roll 🎲'), keepB = h('button', { class: 'btn', onclick: () => turn === 'me' && !busy && keep() }, 'Keep ✋');
    const paint = () => { bars.replaceChildren(bar('me'), bar('cpu')); turnEl.textContent = `This turn: ${pts}`; rollB.disabled = keepB.disabled = turn !== 'me' || over || busy; G.setScore(score.me); };
    const swap = () => { pts = 0; turn = turn === 'me' ? 'cpu' : 'me'; info.textContent = turn === 'me' ? 'Your turn' : 'Computer\'s turn…'; paint(); if (turn === 'cpu') later(cpuStep, 800); };
    const roll = () => {
      busy = true; paint(); let spins = 6;
      const spin = () => {
        if (spins-- > 0) { die.textContent = DIE[rand(6) | 0]; G.sound('tick'); return later(spin, 70); }
        const d = 1 + (rand(6) | 0); die.textContent = DIE[d - 1]; busy = false;
        if (d === 1) { G.sound('error'); info.textContent = `${turn === 'me' ? 'You' : 'The computer'} rolled a 1 and lost ${pts} points!`; return later(swap, 900); }
        pts += d; G.sound('pop'); paint();
        if (score[turn] + pts >= goal) return keep();
        if (turn === 'cpu') later(cpuStep, 600);
      };
      spin();
    };
    const keep = () => {
      score[turn] += pts; G.sound('ok'); paint();
      if (score[turn] >= goal) { over = true; paint(); return later(() => (turn === 'me' ? G.win(`You won ${score.me} to ${score.cpu}`) : G.lose(`The computer won ${score.cpu} to ${score.me}`)), 500); }
      swap();
    };
    const cpuStep = () => { if (over) return; if (pts >= (G.params.risk || 15)) keep(); else roll(); };
    paint(); el.append(h('div', { class: 'qz' }, bars, die, turnEl, info, h('div', { class: 'nm-btns' }, rollB, keepB)));
  },
  stop: stopAll,
};

// ================================================================ Cards: Twenty-One and Higher or Lower
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const deck = () => shuffle(SUITS.flatMap(s => RANKS.map((r, i) => ({ r, s, v: i + 1 }))));
const card = (c, hidden) => h('div', { class: 'cd' + (hidden ? ' back' : '') + (!hidden && '♥♦'.includes(c.s) ? ' red' : '') }, hidden ? '' : [h('b', {}, c.r), h('span', {}, c.s)]);
export const twentyone = {
  kind: 'dom', how: 'Get closer to 21 than the dealer without going over. J, Q, K are 10 and A is 1 or 11. Hit = take a card, Stand = stop. First to win 3 rounds!',
  start(G, el) {
    let dk = deck(), me = [], dl = [], wins = 0, losses = 0, phase = 'play';
    const val = hand => { let t = 0, a = 0; for (const c of hand) { if (c.r === 'A') { a++; t += 11; } else t += c.v > 10 ? 10 : c.v; } while (t > 21 && a-- > 0) t -= 10; return t; };
    const take = () => { if (dk.length < 10) dk = deck(); return dk.pop(); };
    const dRow = h('div', { class: 'cd-row' }), mRow = h('div', { class: 'cd-row' }), msg = h('div', { class: 'nm-info' }), dT = h('small'), mT = h('small');
    const hitB = h('button', { class: 'btn primary', onclick: () => hit() }, 'Hit ➕'), standB = h('button', { class: 'btn', onclick: () => stand() }, 'Stand ✋'), nextB = h('button', { class: 'btn primary', onclick: () => deal() }, 'Next round');
    const paint = () => {
      dRow.replaceChildren(...dl.map((c, i) => card(c, phase === 'play' && i === 1))); mRow.replaceChildren(...me.map(c => card(c)));
      dT.textContent = phase === 'play' ? 'Dealer' : `Dealer: ${val(dl)}`; mT.textContent = `You: ${val(me)}`;
      hitB.hidden = standB.hidden = phase !== 'play'; nextB.hidden = phase !== 'done' || wins >= 3 || losses >= 3;
      G.status(`won ${wins} · lost ${losses}`); G.setScore(wins);
    };
    const result = (text, won) => {
      phase = 'done'; if (won === true) { wins++; G.sound('ok'); } else if (won === false) { losses++; G.sound('error'); } else G.sound('pop');
      msg.textContent = text; paint();
      if (wins >= 3) later(() => G.win(`You beat the dealer ${wins}–${losses}`), 700); else if (losses >= 3) later(() => G.lose(`The dealer won ${losses}–${wins}`), 700);
    };
    const deal = () => { me = [take(), take()]; dl = [take(), take()]; phase = 'play'; msg.textContent = 'Hit or Stand?'; paint(); if (val(me) === 21) stand(); };
    const hit = () => { if (phase !== 'play') return; me.push(take()); G.sound('tick'); paint(); if (val(me) > 21) result(`Bust! You have ${val(me)}.`, false); else if (val(me) === 21) stand(); };
    const stand = () => {
      if (phase !== 'play') return; phase = 'dealer'; paint();
      const draw = () => {
        if (val(dl) < 17) { dl.push(take()); G.sound('tick'); paint(); return later(draw, 500); }
        const a = val(me), b = val(dl);
        result(b > 21 ? `Dealer bust with ${b}! You win.` : a > b ? `${a} beats ${b}. You win!` : a < b ? `${b} beats ${a}. Dealer wins.` : `${a} each: a tie.`, b > 21 || a > b ? true : a < b ? false : null);
      };
      later(draw, 500);
    };
    deal();
    el.append(h('div', { class: 'qz cd-table' }, dT, dRow, mRow, mT, msg, h('div', { class: 'nm-btns' }, hitB, standB, nextB)));
  },
  stop: stopAll,
};
export const highlow = {
  kind: 'dom', how: 'Will the next card be higher or lower? Same number counts as right. You can be wrong 3 times.',
  start(G, el) {
    let dk = deck(), cur = dk.pop(), lives = 3, streak = 0;
    const row = h('div', { class: 'cd-row' }), msg = h('div', { class: 'nm-info' }, 'Higher or lower?');
    const paint = (next) => { row.replaceChildren(card(cur), next ? card(next) : card(cur, true)); G.status(`${'❤️'.repeat(lives)} · streak ${streak}`); };
    const guess = up => {
      if (lives <= 0) return;
      if (dk.length < 2) dk = deck();
      const next = dk.pop(), right = up ? next.v >= cur.v : next.v <= cur.v; paint(next);
      if (right) { streak++; G.add(10 * Math.min(5, streak)); G.sound('ok'); msg.textContent = `Yes! Streak ${streak}`; }
      else { lives--; streak = 0; G.sound('error'); msg.textContent = 'Oh no!'; }
      cur = next;
      if (lives <= 0) return later(() => G.win(`${G.score} points`), 800);
      later(() => paint(), 900);
    };
    paint(); el.append(h('div', { class: 'qz cd-table' }, row, msg, h('div', { class: 'nm-btns' }, h('button', { class: 'btn primary', onclick: () => guess(true) }, 'Higher ⬆'), h('button', { class: 'btn primary', onclick: () => guess(false) }, 'Lower ⬇'))));
  },
  stop: stopAll,
};

// ================================================================ Number Tap (Schulte table)
export const schulte = {
  kind: 'dom', lowerIsBetter: true, how: 'Tap the numbers in order: 1, 2, 3… as fast as you can! The clock starts at 1.',
  start(G, el) {
    const n = G.params.size || 4, N = n * n, nums = shuffle([...Array(N)].map((_, i) => i + 1)); let next = 1, t0 = 0;
    const g = grid(n, 'sc'), tick = () => { if (next > 1 && next <= N) { G.status(`${((performance.now() - t0) / 1000).toFixed(1)} s`); later(tick, 100); } };
    nums.forEach(v => g.append(h('button', { class: 'sc-c', style: { '--c': `hsl(${(v * 47) % 360},75%,62%)` }, onclick: e => tap(v, e.currentTarget) }, v)));
    const tap = (v, b) => {
      if (v !== next) { G.sound('error'); return shake(b); }
      b.classList.add('done'); G.sound('pop');
      if (next === 1) { t0 = performance.now(); later(tick, 100); }
      next++;
      if (next > N) { const s = (performance.now() - t0) / 1000; G.setScore(Math.round(s * 10) / 10); G.win(`${s.toFixed(1)} seconds`); }
    };
    el.append(h('div', { class: 'pz' }, g));
  },
  stop: stopAll,
};

// ================================================================ Colour Eye
export const coloreye = {
  kind: 'dom', how: 'One square is a slightly different colour. Find it! It gets harder every level. Wrong taps cost 3 seconds. 60 seconds.',
  start(G, el) {
    let level = 0, time = 60, over = false;
    const box = h('div', { class: 'pz' });
    const next = () => {
      level++; G.setScore(level - 1);
      const n = Math.min(8, 2 + Math.floor(level / 3)), hue = rand(360) | 0, d = Math.max(4, 26 - level * 1.3), odd = rand(n * n) | 0, g = grid(n, 'ce');
      for (let i = 0; i < n * n; i++) g.append(h('button', { class: 'ce-c', style: { background: `hsl(${hue},70%,${i === odd ? 52 + d : 52}%)` }, onclick: e => { if (over) return; if (i === odd) { G.sound('pop'); next(); } else { time -= 3; G.sound('error'); shake(e.currentTarget); } } }));
      box.replaceChildren(g);
    };
    const tick = () => { time -= 0.1; G.status(`level ${level} · ${Math.ceil(Math.max(0, time))}s`); if (time <= 0) { over = true; return G.win(`You reached level ${level}`); } later(tick, 100); };
    next(); later(tick, 100); el.append(box);
  },
  stop: stopAll,
};

// ================================================================ Grid Memory
export const gridmem = {
  kind: 'dom', how: 'Some squares light up. Remember them! When they hide, tap the same squares. Each level adds one more. You have 3 lives.',
  start(G, el) {
    let level = 0, lives = 3;
    const box = h('div', { class: 'pz' });
    const round = () => {
      level++; G.status(`level ${level} · ${'❤️'.repeat(lives)}`);
      const n = Math.min(7, 3 + Math.floor(level / 3)), k = Math.min(n * n - 2, 2 + level), lit = new Set(shuffle([...Array(n * n).keys()]).slice(0, k));
      let found = 0, showing = true, done = false;
      const g = grid(n, 'mg'), cells = [...Array(n * n)].map((_, i) => h('button', { class: 'mg-c' + (lit.has(i) ? ' lit' : ''), onclick: () => tap(i) }));
      g.append(...cells); box.replaceChildren(g);
      later(() => { cells.forEach(c => c.classList.remove('lit')); showing = false; }, 900 + k * 160);
      const tap = i => {
        if (showing || done || cells[i].classList.contains('ok')) return;
        if (lit.has(i)) { cells[i].classList.add('ok'); G.sound('pop'); if (++found === k) { done = true; G.add(level * 10); G.sound('ok'); later(round, 600); } }
        else {
          cells[i].classList.add('bad'); G.sound('error'); lives--; G.status(`level ${level} · ${'❤️'.repeat(lives)}`);
          if (lives <= 0) { done = true; lit.forEach(j => cells[j].classList.add('lit')); later(() => (level > 3 ? G.win(`You reached level ${level}`) : G.lose(`You reached level ${level}`)), 900); }
        }
      };
    };
    round(); el.append(box);
  },
  stop: stopAll,
};

// ================================================================ Box Pusher
const SOKO = [
  ['#######', '#     #', '# @$ .#', '#     #', '#######'],
  ['########', '#      #', '# $  . #', '#  @   #', '# $  . #', '#      #', '########'],
  ['#######', '#.    #', '#     #', '# $   #', '#  @  #', '#######'],
  ['#########', '#   .   #', '#   $   #', '# .$@$. #', '#       #', '#########'],
  ['#######', '#     #', '#.$ $.#', '#  @  #', '#  $  #', '#  .  #', '#######'],
];
export const sokoban = {
  kind: 'dom', how: 'Push every box 📦 onto a star ⭐. Use the arrow keys (or tap a square next to the worker). You can only push, never pull! Backspace or ↩ undoes a move.',
  start(G, el) {
    let lvl = 0, W, walls, goals, boxes, P, hist, moves;
    const box = h('div', { class: 'pz' });
    const load = () => {
      const rows = SOKO[lvl]; W = Math.max(...rows.map(r => r.length)); walls = new Set(); goals = new Set(); boxes = new Set(); hist = []; moves = 0;
      rows.forEach((r, y) => [...r.padEnd(W)].forEach((ch, x) => { const i = y * W + x; if (ch === '#') walls.add(i); if ('.*+'.includes(ch)) goals.add(i); if ('$*'.includes(ch)) boxes.add(i); if ('@+'.includes(ch)) P = i; }));
      G.status(`puzzle ${lvl + 1} of ${SOKO.length}`); paint();
    };
    const paint = () => {
      const H = SOKO[lvl].length, g = grid(W, 'sk');
      for (let i = 0; i < W * H; i++) g.append(h('button', { class: 'sk-c' + (walls.has(i) ? ' wall' : '') + (goals.has(i) ? ' goal' : ''), onclick: () => tapCell(i) },
        i === P ? '👷' : boxes.has(i) ? (goals.has(i) ? '✅' : '📦') : goals.has(i) ? '⭐' : ''));
      box.replaceChildren(g, h('div', { class: 'nm-btns' }, h('button', { class: 'btn', onclick: undo }, '↩ Undo'), h('button', { class: 'btn ghost', onclick: load }, 'Start again')));
    };
    const move = d => {
      const np = P + d; if (walls.has(np)) return;
      if (boxes.has(np)) { const nb = np + d; if (walls.has(nb) || boxes.has(nb)) return G.sound('error'); hist.push([P, new Set(boxes)]); boxes.delete(np); boxes.add(nb); G.sound('drop'); }
      else { hist.push([P, new Set(boxes)]); G.sound('tick'); }
      P = np; moves++; paint();
      if ([...boxes].every(b => goals.has(b))) {
        G.add(100); G.sound('ok'); lvl++;
        if (lvl >= SOKO.length) return later(() => G.win('Every puzzle solved!'), 400);
        later(load, 700);
      }
    };
    const undo = () => { const last = hist.pop(); if (last) { [P, boxes] = last; moves--; paint(); } };
    const tapCell = i => { const d = i - P; if ([1, -1, W, -W].includes(d)) move(d); };
    this.key = (G2, k) => { const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -W, ArrowDown: W }[k]; if (d) move(d); if (k === 'Backspace') undo(); };
    load(); el.append(box);
  },
  stop: stopAll,
};
