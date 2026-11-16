// Arcade games, part 2: space, gardens, caves, mazes and neon. Each is a small canvas game run by engine.js.
import { rand, pick, clamp, PALETTE } from '../engine.js';
import { sky, rr, dot, txt, emoji, poly, line, burst, stepSparks, drawSparks, tone, NOTES, TAU, wrap, hearts, starfield, drawStars, cached } from './kit.js';

// ================================================================ Space Rocks
const rockShape = r => Array.from({ length: 11 }, (_, i) => { const a = (i / 11) * TAU, k = r * rand(0.72, 1.08); return [Math.cos(a) * k, Math.sin(a) * k]; });
const newRock = (x, y, size, speed) => {
  const a = rand(0, TAU), v = rand(30, 70) * (4 - size) * 0.55 * speed, r = [0, 13, 24, 40][size];
  return { x, y, size, r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: 0, spin: rand(-1, 1), shape: rockShape(r), color: pick(['#a1887f', '#8d6e63', '#b0bec5', '#90a4ae', '#bcaaa4']) };
};
export const rocks = {
  w: 600, h: 450, how: '← → turn, ↑ thrust, Space fires. Or just tap where you want to shoot. Clear every rock!',
  start(G) { G.r = { s: { x: 300, y: 225, a: -Math.PI / 2, vx: 0, vy: 0, inv: 2 }, shots: [], rocks: [], fx: [], cool: 0, wave: 0, sky: starfield(90, 600, 450) }; this.next(G); },
  next(G) {
    const r = G.r; r.wave++; G.status(`wave ${r.wave}`);
    for (let i = 0; i < 2 + r.wave; i++) { let x, y; do { x = rand(600); y = rand(450); } while (Math.hypot(x - r.s.x, y - r.s.y) < 150); r.rocks.push(newRock(x, y, 3, G.params.speed || 1)); }
  },
  fire(G) { const r = G.r, s = r.s; if (r.cool > 0) return; r.cool = 0.2; r.shots.push({ x: s.x + Math.cos(s.a) * 16, y: s.y + Math.sin(s.a) * 16, vx: Math.cos(s.a) * 440 + s.vx, vy: Math.sin(s.a) * 440 + s.vy, t: 1 }); G.sound('tick'); },
  key(G, k) { if (k === ' ') this.fire(G); },
  tap(G, x, y) { const s = G.r.s; s.a = Math.atan2(y - s.y, x - s.x); G.r.cool = 0; this.fire(G); },
  update(G, dt) {
    const r = G.r, s = r.s, sp = G.params.speed || 1;
    if (G.keys.has('ArrowLeft')) s.a -= 4.2 * dt;
    if (G.keys.has('ArrowRight')) s.a += 4.2 * dt;
    r.thrust = G.keys.has('ArrowUp');
    if (r.thrust) { s.vx += Math.cos(s.a) * 280 * dt; s.vy += Math.sin(s.a) * 280 * dt; }
    if (G.keys.has(' ')) this.fire(G);
    const drag = Math.pow(0.55, dt); s.vx *= drag; s.vy *= drag;
    s.x = wrap(s.x + s.vx * dt, 600); s.y = wrap(s.y + s.vy * dt, 450);
    r.cool -= dt; s.inv -= dt;
    for (const b of r.shots) { b.x = wrap(b.x + b.vx * dt, 600); b.y = wrap(b.y + b.vy * dt, 450); b.t -= dt; }
    for (const k of r.rocks) { k.x = wrap(k.x + k.vx * dt, 600); k.y = wrap(k.y + k.vy * dt, 450); k.rot += k.spin * dt; }
    const born = [];
    for (const k of r.rocks) {
      for (const b of r.shots) if (b.t > 0 && !k.dead && Math.hypot(b.x - k.x, b.y - k.y) < k.r) {
        b.t = 0; k.dead = true; G.add([0, 100, 50, 20][k.size]); G.sound('pop'); burst(r.fx, k.x, k.y, k.color, 12, 140);
        if (k.size > 1) born.push(newRock(k.x, k.y, k.size - 1, sp), newRock(k.x, k.y, k.size - 1, sp));
      }
      if (!k.dead && s.inv <= 0 && Math.hypot(s.x - k.x, s.y - k.y) < k.r + 9) {
        burst(r.fx, s.x, s.y, '#ffb74d', 30, 200); G.sound('error'); G.lives--;
        if (G.lives <= 0) return G.lose('Your ship was hit');
        Object.assign(s, { x: 300, y: 225, vx: 0, vy: 0, inv: 2.5 });
      }
    }
    r.rocks = r.rocks.filter(k => !k.dead).concat(born); r.shots = r.shots.filter(b => b.t > 0);
    stepSparks(r.fx, dt, 0);
    if (!r.rocks.length) { G.add(100); G.sound('ok'); this.next(G); }
  },
  draw(G, c) {
    const r = G.r, s = r.s;
    sky(c, 600, 450, '#0b1030', '#1d1450'); drawStars(c, r.sky);
    for (const k of r.rocks) { c.save(); c.translate(k.x, k.y); c.rotate(k.rot); poly(c, k.shape, k.color); c.restore(); }
    for (const b of r.shots) dot(c, b.x, b.y, 3, '#ffe082');
    if (s.inv <= 0 || Math.floor(s.inv * 8) % 2) {
      c.save(); c.translate(s.x, s.y); c.rotate(s.a);
      if (r.thrust) poly(c, [[-10, -5], [-22 - Math.random() * 7, 0], [-10, 5]], '#ff7043');
      poly(c, [[17, 0], [-11, -11], [-6, 0], [-11, 11]], '#ff8a1f'); dot(c, 2, 0, 3.5, '#fff3e0'); c.restore();
    }
    drawSparks(c, r.fx); hearts(c, G.lives, 18, 20);
  },
};

// ================================================================ Garden Guard (bugs march down in rows)
export const garden = {
  w: 480, h: 560, how: 'Move with ← → (or hold and drag) and spray water with Space or a tap. Stop the bugs before they reach the flowers!',
  start(G) { G.g = { x: 220, shots: [], goo: [], fx: [], cool: 0, wave: 0, bushes: [90, 240, 390].map(x => ({ x, hp: 8 })) }; this.next(G); },
  next(G) {
    const g = G.g; g.wave++; g.dir = 1; g.speed = 24 + g.wave * 8 * (G.params.speed || 1); g.bugs = [];
    const rows = ['🐞', '🐝', '🐛', '🦋', '🐜'];
    for (let r = 0; r < 5; r++) for (let k = 0; k < 8; k++) g.bugs.push({ x: 50 + k * 48, y: 70 + r * 40, e: rows[r], pts: (5 - r) * 10 });
    G.status(`wave ${g.wave}`);
  },
  fire(G) { const g = G.g; if (g.cool > 0) return; g.cool = 0.32; g.shots.push({ x: g.x + 20, y: 496 }); G.sound('tick'); },
  key(G, k) { if (k === ' ' || k === 'ArrowUp') this.fire(G); },
  tap(G) { this.fire(G); },
  update(G, dt) {
    const g = G.g;
    if (G.keys.has('ArrowLeft')) g.x -= 270 * dt;
    if (G.keys.has('ArrowRight')) g.x += 270 * dt;
    if (G.pointer.down) g.x += clamp(G.pointer.x - 20 - g.x, -330 * dt, 330 * dt);
    g.x = clamp(g.x, 0, 440); g.cool -= dt;
    if (G.keys.has(' ')) this.fire(G);
    let edge = false;
    const sp = g.speed * (1 + (40 - g.bugs.length) / 18);
    for (const b of g.bugs) { b.x += g.dir * sp * dt; if (b.x < 20 || b.x > 460) edge = true; }
    if (edge) { g.dir *= -1; for (const b of g.bugs) { b.y += 16; b.x += g.dir * 4; } }
    if (g.bugs.length && Math.random() < dt * (0.8 + g.wave * 0.3)) { const b = pick(g.bugs); g.goo.push({ x: b.x, y: b.y + 12 }); }
    for (const s of g.shots) s.y -= 430 * dt;
    for (const o of g.goo) o.y += 170 * dt;
    for (const s of g.shots) for (const b of g.bugs) if (!b.dead && !s.dead && Math.abs(s.x - b.x) < 18 && Math.abs(s.y - b.y) < 16) { s.dead = b.dead = true; G.add(b.pts); G.sound('pop'); burst(g.fx, b.x, b.y, pick(PALETTE), 10, 120); }
    for (const o of g.goo) for (const bu of g.bushes) if (!o.dead && bu.hp > 0 && Math.abs(o.x - bu.x) < 28 && o.y > 438 && o.y < 470) { o.dead = true; bu.hp--; }
    for (const o of g.goo) if (!o.dead && o.y > 496 && o.y < 532 && o.x > g.x - 4 && o.x < g.x + 44) {
      o.dead = true; G.lives--; G.sound('error'); burst(g.fx, g.x + 20, 516, '#9ccc65', 20, 160);
      if (G.lives <= 0) return G.lose('The bugs got you');
    }
    g.bugs = g.bugs.filter(b => !b.dead); g.shots = g.shots.filter(s => !s.dead && s.y > 0); g.goo = g.goo.filter(o => !o.dead && o.y < 560);
    stepSparks(g.fx, dt);
    if (g.bugs.some(b => b.y > 430)) return G.lose('The bugs reached the flowers');
    if (!g.bugs.length) { G.add(200); G.sound('ok'); this.next(G); }
  },
  draw(G, c) {
    const g = G.g;
    sky(c, 480, 560, '#bde7ff', '#effbe0'); rr(c, 0, 538, 480, 22, 0, '#7cb342');
    for (let i = 0; i < 12; i++) emoji(c, '🌷', 20 + i * 40, 548, 18);
    for (const bu of g.bushes) if (bu.hp > 0) { c.globalAlpha = 0.35 + bu.hp / 12; emoji(c, '🌳', bu.x, 452, 48); c.globalAlpha = 1; }
    for (const b of g.bugs) emoji(c, b.e, b.x, b.y, 28);
    for (const s of g.shots) dot(c, s.x, s.y, 5, '#29b6f6');
    for (const o of g.goo) dot(c, o.x, o.y, 5, '#689f38');
    rr(c, g.x, 506, 40, 24, 9, '#ff8a1f'); rr(c, g.x + 14, 492, 12, 18, 4, '#ef6c00'); dot(c, g.x + 20, 518, 5, '#fff3e0');
    drawSparks(c, g.fx); hearts(c, G.lives, 18, 20);
  },
};

// ================================================================ Road Crosser
const ROWS = 13, CELL = 40;
export const crosser = {
  w: 440, h: 520, how: 'Arrow keys (or tap above, below or beside the chick) to hop. Cross the road, ride the logs and reach a lily pad!',
  start(G) { G.x = { level: 0, fx: [] }; this.level(G); },
  level(G) {
    const X = G.x, sp = (1 + X.level * 0.18) * (G.params.speed || 1); X.level++;
    X.pads = [1, 3, 5, 7, 9].map(c => ({ x: c * CELL + 20, full: false }));
    X.lanes = [];
    for (let r = 1; r <= 5; r++) {   // river
      const dir = r % 2 ? 1 : -1, w = rand(90, 150) | 0, n = 3;
      X.lanes[r] = { kind: 'river', dir, speed: rand(40, 80) * sp, items: Array.from({ length: n }, (_, i) => ({ x: i * (600 / n) + rand(0, 40), w })) };
    }
    for (let r = 7; r <= 11; r++) {  // road
      const dir = r % 2 ? -1 : 1, n = rand(2, 4) | 0;
      X.lanes[r] = { kind: 'road', dir, speed: rand(50, 110) * sp, items: Array.from({ length: n }, (_, i) => ({ x: i * (600 / n) + rand(0, 60), w: 40, e: pick(['🚗', '🚕', '🚙', '🚌', '🚓', '🛻']) })) };
    }
    this.reset(G); G.status(`level ${X.level}`);
  },
  reset(G) { Object.assign(G.x, { cx: 220, row: 12, best: 12, hop: 0 }); },
  hop(G, dx, dy) {
    const X = G.x; const r = X.row + dy, x = X.cx + dx * CELL;
    if (r < 0 || r > 12 || x < 20 || x > 420) return;
    X.row = r; X.cx = dx ? Math.round((x - 20) / CELL) * CELL + 20 : x; X.hop = 0.12; G.sound('tick');
    if (r < X.best) { X.best = r; G.add(10); }
  },
  key(G, k) { const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k]; if (d) this.hop(G, ...d); },
  tap(G, x, y) { const X = G.x, dx = x - X.cx, dy = y - (X.row * CELL + 20); Math.abs(dy) > Math.abs(dx) ? this.hop(G, 0, Math.sign(dy)) : this.hop(G, Math.sign(dx), 0); },
  die(G, why) {
    const X = G.x; burst(X.fx, X.cx, X.row * CELL + 20, '#ffd54f', 20, 160); G.sound('error'); G.lives--;
    if (G.lives <= 0) return G.lose(why);
    this.reset(G);
  },
  update(G, dt) {
    const X = G.x; X.hop = Math.max(0, X.hop - dt);
    for (let r = 1; r < ROWS; r++) { const L = X.lanes[r]; if (!L) continue; for (const it of L.items) it.x = wrap(it.x + L.dir * L.speed * dt + 160, 600) - 160; }
    stepSparks(X.fx, dt);
    const L = X.lanes[X.row];
    if (L?.kind === 'road' && L.items.some(it => X.cx > it.x - 12 && X.cx < it.x + it.w + 12)) return this.die(G, 'Watch out for cars!');
    if (L?.kind === 'river' && X.hop === 0) {
      const log = L.items.find(it => X.cx > it.x - 6 && X.cx < it.x + it.w + 6);
      if (!log) return this.die(G, 'Splash! Ride the logs');
      X.cx += L.dir * L.speed * dt;
      if (X.cx < 4 || X.cx > 436) return this.die(G, 'Floated away');
    }
    if (X.row === 0) {
      const pad = X.pads.find(p => !p.full && Math.abs(p.x - X.cx) < 22);
      if (!pad) return this.die(G, 'Aim for an empty lily pad');
      pad.full = true; G.add(50); G.sound('ok'); this.reset(G);
      if (X.pads.every(p => p.full)) { G.add(200); this.level(G); }
    }
  },
  draw(G, c) {
    const X = G.x;
    this.bg ||= cached(440, 520, g => {
      g.fillStyle = '#1e88e5'; g.fillRect(0, 0, 440, 6 * CELL);
      g.fillStyle = '#2e7d32'; g.fillRect(0, 0, 440, CELL);
      g.fillStyle = '#66bb6a'; g.fillRect(0, 6 * CELL, 440, CELL); g.fillRect(0, 12 * CELL, 440, CELL);
      g.fillStyle = '#455a64'; g.fillRect(0, 7 * CELL, 440, 5 * CELL);
      g.fillStyle = '#eceff1'; for (let r = 8; r < 12; r++) for (let x = 0; x < 440; x += 40) g.fillRect(x + 8, r * CELL - 1, 22, 3);
    });
    c.drawImage(this.bg, 0, 0);
    for (const p of X.pads) emoji(c, p.full ? '🐥' : '🪷', p.x, 20, 28);
    for (let r = 1; r < ROWS; r++) {
      const L = X.lanes[r]; if (!L) continue;
      for (const it of L.items) {
        if (L.kind === 'river') { rr(c, it.x, r * CELL + 6, it.w, CELL - 12, 12, '#8d6e63'); rr(c, it.x + 6, r * CELL + 12, it.w - 12, 4, 2, '#a1887f'); }
        else { c.save(); c.translate(it.x + 20, r * CELL + 20); if (L.dir > 0) c.scale(-1, 1); emoji(c, it.e, 0, 0, 32); c.restore(); }
      }
    }
    emoji(c, '🐥', X.cx, X.row * CELL + 20 - X.hop * 60, 30 + X.hop * 30);
    drawSparks(c, X.fx); hearts(c, G.lives, 340, 500);
  },
};

// ================================================================ Orange Muncher (garden maze chase)
const MAZE = [
  '###################',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.### # ###.####',
  '   #.#       #.#   ',
  '####.# ##-## #.####',
  '    .  #   #  .    ',
  '####.# ##### #.####',
  '   #.#       #.#   ',
  '####.# ##### #.####',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#..#...........#..#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];
const MC = 24, DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ent = (x, y) => ({ x, y, nx: x, ny: y, t: 0, dx: 0, dy: 0 });
export const muncher = {
  w: 456, h: 504, how: 'Arrow keys (or tap where to go) to munch every seed. Flowers 🌼 make the bees sleepy, then you can catch them!',
  start(G) { G.m = { level: 0, fx: [] }; this.level(G); },
  level(G) {
    const m = G.m; m.level++;
    m.grid = MAZE.map(r => r.split('')); m.grid[15][9] = ' ';
    m.seeds = m.grid.flat().filter(ch => ch === '.' || ch === 'o').length;
    G.status(`level ${m.level}`); this.reset(G);
  },
  reset(G) {
    const m = G.m; m.p = ent(9, 15); m.want = [0, 0]; m.scared = 0;
    m.bees = [[9, 7, 0], [8, 9, 3], [10, 9, 6], [9, 9, 9]].slice(0, 2 + Math.min(2, m.level)).map(([x, y, wait]) => ({ ...ent(x, y), wait, start: [x, y], inHouse: y === 9 }));
  },
  open(x, y, bee) { if (y === 9 && (x < 0 || x > 18)) return true; const ch = this.g[y]?.[x]; return ch !== undefined && ch !== '#' && (bee || ch !== '-'); },
  step(e, speed, dt, pick) {
    let arrived = false;
    if (e.nx === e.x && e.ny === e.y) {
      const d = pick(e);
      if (d && (d[0] || d[1])) { let nx = e.x + d[0]; const ny = e.y + d[1]; if (nx < 0) nx = 18; if (nx > 18) nx = 0; if (this.open(nx, ny, e.inHouse)) { e.nx = nx; e.ny = ny; [e.dx, e.dy] = d; e.t = 0; } }
    }
    if (e.nx !== e.x || e.ny !== e.y) { e.t += speed * dt; if (e.t >= 1) { e.x = e.nx; e.y = e.ny; e.t = 0; arrived = true; } }
    return arrived;
  },
  pos: e => Math.abs(e.nx - e.x) > 1 ? [e.x, e.y] : [e.x + (e.nx - e.x) * e.t, e.y + (e.ny - e.y) * e.t],
  key(G, k) {
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k]; if (!d) return;
    const m = G.m, p = m.p; m.want = d;
    if (p.t > 0 && d[0] === -p.dx && d[1] === -p.dy) { [p.x, p.nx] = [p.nx, p.x]; [p.y, p.ny] = [p.ny, p.y]; p.t = 1 - p.t; p.dx = d[0]; p.dy = d[1]; }
  },
  tap(G, x, y) { const [px, py] = this.pos(G.m.p), dx = x / MC - px - 0.5, dy = y / MC - py - 0.5; this.key(G, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp')); },
  update(G, dt) {
    const m = G.m; this.g = m.grid; stepSparks(m.fx, dt);
    m.scared = Math.max(0, m.scared - dt);
    const p = m.p;
    if (this.step(p, 7, dt, e => (this.open(wrap(e.x + m.want[0], 19), e.y + m.want[1]) ? m.want : [e.dx, e.dy]))) {
      const ch = m.grid[p.y][p.x];
      if (ch === '.' || ch === 'o') {
        m.grid[p.y][p.x] = ' '; m.seeds--;
        if (ch === 'o') { m.scared = 7; G.add(50); G.sound('ok'); } else { G.add(10); if (m.seeds % 4 === 0) G.sound('tick'); }
        if (!m.seeds) { G.add(500); G.sound('ok'); return this.level(G); }
      }
    }
    const smart = G.params.smart ?? 0.7;
    for (const b of m.bees) {
      if (b.wait > 0) { b.wait -= dt; continue; }
      this.step(b, m.scared ? 3.5 : 5.2 + m.level * 0.3, dt, e => {
        if (e.inHouse) { if (e.y === 7) { e.inHouse = false; } else return e.x !== 9 ? [Math.sign(9 - e.x), 0] : [0, -1]; }
        const opts = DIRS.filter(([dx, dy]) => !(dx === -e.dx && dy === -e.dy) && this.open(wrap(e.x + dx, 19), e.y + dy, false));
        if (!opts.length) return [-e.dx, -e.dy];
        if (m.scared || Math.random() > smart) return pick(opts);
        let best = opts[0], bd = 1e9;
        for (const o of opts) { const d = Math.hypot(e.x + o[0] - p.x, e.y + o[1] - p.y); if (d < bd) { bd = d; best = o; } }
        return best;
      });
      const [bx, by] = this.pos(b), [px, py] = this.pos(p);
      if (Math.hypot(bx - px, by - py) < 0.7) {
        if (m.scared) { G.add(200); G.sound('pop'); burst(m.fx, bx * MC + 12, by * MC + 12, '#ffd23f', 16, 140); Object.assign(b, ent(...b.start), { wait: 3, start: b.start, inHouse: b.start[1] === 9 }); }
        else { G.lives--; G.sound('error'); burst(m.fx, px * MC + 12, py * MC + 12, '#ff8a1f', 24, 160); if (G.lives <= 0) return G.lose('Stung by a bee!'); return this.reset(G); }
      }
    }
  },
  draw(G, c) {
    const m = G.m;
    this.walls ||= cached(456, 504, g => {
      g.fillStyle = '#fff8e1'; g.fillRect(0, 0, 456, 504);
      MAZE.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === '#') { g.fillStyle = '#43a047'; g.beginPath(); g.roundRect(x * MC + 1, y * MC + 1, MC - 2, MC - 2, 7); g.fill(); g.fillStyle = '#66bb6a'; g.fillRect(x * MC + 6, y * MC + 5, 6, 4); }
        if (ch === '-') { g.fillStyle = '#ffb74d'; g.fillRect(x * MC, y * MC + 10, MC, 4); }
      }));
    });
    c.drawImage(this.walls, 0, 0);
    const blink = Math.floor(G.t * 4) % 2;
    m.grid.forEach((row, y) => row.forEach((ch, x) => { if (ch === '.') dot(c, x * MC + 12, y * MC + 12, 3, '#ff8a1f'); else if (ch === 'o' && blink) emoji(c, '🌼', x * MC + 12, y * MC + 12, 18); }));
    for (const b of m.bees) { const [x, y] = this.pos(b); c.globalAlpha = m.scared ? 0.55 : 1; emoji(c, m.scared ? '😴' : '🐝', x * MC + 12, y * MC + 12, 22); c.globalAlpha = 1; }
    const [x, y] = this.pos(m.p); emoji(c, '🍊', x * MC + 12, y * MC + 12, 22 + Math.sin(G.t * 14) * 2);
    drawSparks(c, m.fx); hearts(c, G.lives, 16, 12);
  },
};

// ================================================================ Cave Glider
export const cave = {
  w: 600, h: 400, how: 'Hold Space, ↑ or the mouse button to fly up. Let go to glide down. Collect stars and don\'t touch the cave!',
  start(G) { const v = G.v = { y: 200, vy: 0, segs: [], base: 0, dist: 0, gap: 240, mid: 200, gems: [], bonus: 0, fx: [] }; for (let i = 0; i < 34; i++) this.seg(G); },
  seg(G) {
    const v = G.v; v.mid = clamp(v.mid + rand(-34, 34), v.gap / 2 + 16, 400 - v.gap / 2 - 16); v.gap = Math.max(130 / (G.params.tight || 1), v.gap - 0.5);
    v.segs.push([v.mid - v.gap / 2, v.mid + v.gap / 2]);
    if (Math.random() < 0.1) v.gems.push({ i: v.base + v.segs.length - 1, y: v.mid + rand(-v.gap / 4, v.gap / 4) });
  },
  update(G, dt) {
    const v = G.v, speed = (170 + v.dist * 0.015) * (G.params.speed || 1);
    const up = G.pointer.down || G.keys.has(' ') || G.keys.has('ArrowUp');
    v.vy = clamp(v.vy + (up ? -560 : 440) * dt, -270, 300); v.y += v.vy * dt; v.dist += speed * dt;
    while (v.dist > (v.base + 1) * 20) { v.segs.shift(); v.base++; this.seg(G); }
    const i = Math.floor((v.dist + 120) / 20) - v.base, [top, bot] = v.segs[i];
    stepSparks(v.fx, dt);
    for (const gm of v.gems) if (!gm.got && Math.abs(gm.i * 20 - v.dist - 120) < 16 && Math.abs(gm.y - v.y) < 18) { gm.got = true; v.bonus += 10; G.sound('ok'); burst(v.fx, 120, v.y, '#ffd23f', 10, 100); }
    v.gems = v.gems.filter(gm => gm.i >= v.base);
    G.setScore(Math.floor(v.dist / 20) + v.bonus);
    if (v.y - 7 < top || v.y + 7 > bot) { burst(v.fx, 120, v.y, '#ff8a1f', 30, 200); G.sound('error'); return G.lose('Bumped the cave'); }
  },
  draw(G, c) {
    const v = G.v, off = v.dist - v.base * 20;
    sky(c, 600, 400, '#2a1446', '#5b2a6e');
    const top = [[0, 0]], bot = [[0, 400]];
    v.segs.forEach(([t, b], j) => { const x = j * 20 - off; top.push([x, t]); bot.push([x, b]); });
    top.push([700, 0]); bot.push([700, 400]);
    poly(c, top, '#1a0d2e'); poly(c, bot, '#1a0d2e');
    for (const gm of v.gems) if (!gm.got) emoji(c, '⭐', gm.i * 20 - v.dist, gm.y, 20);
    c.save(); c.translate(120, v.y); c.rotate(clamp(v.vy / 500, -0.5, 0.5)); poly(c, [[16, 0], [-12, -9], [-6, 0], [-12, 9]], '#ff8a1f'); poly(c, [[16, 0], [-6, 0], [-12, 9]], '#ffb74d'); c.restore();
    drawSparks(c, v.fx);
  },
};

// ================================================================ Sky Hopper
export const hopper = {
  w: 360, h: 600, how: 'Move with ← → or the mouse. Bounce from cloud to cloud and climb as high as you can. Brown clouds break!',
  start(G) {
    const s = G.s = { x: 170, y: 500, vy: -580, cam: 0, plats: [{ x: 140, y: 560, w: 80, k: 'n' }], top: 560, mouse: false };
    while (s.top > -700) this.add(G);
  },
  add(G) {
    const s = G.s, hard = Math.min(1, -s.cam / 9000); s.top -= rand(55, 85 + hard * 55);
    const r = Math.random();
    s.plats.push({ x: rand(0, 290), y: s.top, w: 72, k: r < 0.1 + hard * 0.12 ? 'b' : r < 0.25 + hard * 0.25 ? 'm' : 'n', vx: rand(40, 90) * (Math.random() < 0.5 ? -1 : 1), spring: Math.random() < 0.07 });
  },
  move(G) { G.s.mouse = true; },
  update(G, dt) {
    const s = G.s;
    if (G.keys.has('ArrowLeft')) { s.x -= 300 * dt; s.mouse = false; }
    if (G.keys.has('ArrowRight')) { s.x += 300 * dt; s.mouse = false; }
    if (s.mouse) s.x += clamp(G.pointer.x - s.x, -380 * dt, 380 * dt);
    s.x = wrap(s.x, 360);
    s.vy += 1000 * dt; const prev = s.y; s.y += s.vy * dt;
    for (const p of s.plats) {
      if (p.k === 'm') { p.x += p.vx * dt; if (p.x < 0 || p.x > 288) p.vx *= -1; }
      if (s.vy > 0 && !p.gone && s.x > p.x - 12 && s.x < p.x + p.w + 12 && prev + 16 <= p.y + 2 && s.y + 16 >= p.y) {
        if (p.k === 'b') { p.gone = true; G.sound('error'); continue; }
        s.vy = p.spring ? -1050 : -580; G.sound(p.spring ? 'ok' : 'tick');
      }
    }
    if (s.y < s.cam + 250) s.cam = s.y - 250;
    G.setScore(Math.max(G.score, Math.floor(-s.cam / 10)));
    while (s.top > s.cam - 200) this.add(G);
    s.plats = s.plats.filter(p => p.y < s.cam + 650);
    if (s.y > s.cam + 640) G.lose('You fell!');
  },
  draw(G, c) {
    const s = G.s;
    sky(c, 360, 600, '#6ec6ff', '#e1f5fe');
    c.save(); c.translate(0, -s.cam);
    for (const p of s.plats) {
      if (p.gone) continue;
      const col = p.k === 'b' ? '#a1887f' : p.k === 'm' ? '#b3e5fc' : '#ffffff';
      rr(c, p.x, p.y, p.w, 14, 7, col); dot(c, p.x + 20, p.y + 2, 10, col); dot(c, p.x + 46, p.y, 12, col);
      if (p.spring) rr(c, p.x + 28, p.y - 8, 16, 9, 3, '#ffd23f');
    }
    emoji(c, '🐸', s.x, s.y, 34);
    c.restore();
  },
};

// ================================================================ Colour Gate
const GATE = ['#ff4f9a', '#ffd23f', '#2fb8ff', '#7c4dff'];
export const colorgate = {
  w: 360, h: 600, how: 'Tap, click or press Space to bounce up. Pass only through the part of each ring that matches your ball\'s colour!',
  start(G) { const g = G.cg = { y: 480, vy: 0, col: 0, cam: 0, rings: [], switches: [], started: false, fx: [] }; for (let i = 0; i < 4; i++) this.add(G, 300 - i * 330); },
  add(G, y) { const g = G.cg; g.rings.push({ y, r: 72, a: rand(0, TAU), spin: (1 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1) * (G.params.speed || 1) }); g.switches.push({ y: y - 165 }); },
  jump(G) { G.cg.vy = -340; G.cg.started = true; G.sound('tick'); },
  tap(G) { this.jump(G); },
  key(G, k) { if (k === ' ' || k === 'ArrowUp') this.jump(G); },
  update(G, dt) {
    const g = G.cg; stepSparks(g.fx, dt);
    if (g.started) { g.vy += 920 * dt; g.y += g.vy * dt; }
    if (g.y < g.cam + 300) g.cam = g.y - 300;
    if (g.y > g.cam + 620) return G.lose('Fell down');
    for (const r of g.rings) {
      r.a += r.spin * dt;
      for (const edge of [r.y - r.r, r.y + r.r]) if (Math.abs(g.y - edge) < 15) {
        const ang = edge < r.y ? -Math.PI / 2 : Math.PI / 2, seg = Math.floor(wrap(ang - r.a, TAU) / (TAU / 4));
        if (seg !== g.col) { burst(g.fx, 180, g.y, GATE[g.col], 30, 200); G.sound('error'); return G.lose('Wrong colour!'); }
      }
      if (!r.passed && g.y < r.y - r.r - 14) { r.passed = true; G.add(1); G.sound('pop'); }
    }
    for (const s of g.switches) if (!s.used && Math.abs(g.y - s.y) < 14) { s.used = true; let n; do { n = rand(4) | 0; } while (n === g.col); g.col = n; G.sound('ok'); }
    const top = Math.min(...g.rings.map(r => r.y)); if (top > g.cam - 400) this.add(G, top - 330);
    g.rings = g.rings.filter(r => r.y - r.r < g.cam + 700); g.switches = g.switches.filter(s => s.y < g.cam + 700);
  },
  draw(G, c) {
    const g = G.cg;
    sky(c, 360, 600, '#141026', '#24183f');
    c.save(); c.translate(0, -g.cam); c.lineWidth = 13; c.lineCap = 'butt';
    for (const r of g.rings) for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(180, r.y, r.r, r.a + (k * TAU) / 4 + 0.03, r.a + ((k + 1) * TAU) / 4 - 0.03); c.strokeStyle = GATE[k]; c.stroke(); }
    for (const s of g.switches) if (!s.used) for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(180, s.y); c.arc(180, s.y, 11, (k * TAU) / 4, ((k + 1) * TAU) / 4); c.fillStyle = GATE[k]; c.fill(); }
    dot(c, 180, g.y, 10, GATE[g.col]); drawSparks(c, g.fx);
    c.restore();
    if (!g.started) txt(c, 'Tap to start', 180, 560, 18, '#fff');
  },
};

// ================================================================ Coin Hop (a little platformer)
const LEVELS = [
  ['........................................',
   '........................................',
   '...................***..................',
   '..................=====.................',
   '..........***.................***.......',
   '.........=====...............=====....F.',
   '...***...................***..........##',
   'P.......................=====..^^.....##',
   '##########....##########################',
   '##########....##########################'],
  ['........................................',
   '..........................***...........',
   '...............***.......=====..........',
   '..............=====...............***...',
   '....***...........................===..F',
   '...=====.....^^........***............##',
   '.............==.......=====.....^......##',
   'P......***...........................###',
   '#######===....#####.....######...#######',
   '##############....#######..#####.#######'],
  ['........................................',
   '.....................***..........***...',
   '.............***....=====........=====..',
   '............=====.......................',
   '....***..............^^...***.........F.',
   '...=====...........=====..===.........##',
   '.........***...........................#',
   'P.......=====.....^^.........^^......###',
   '#####.........#######...########..######',
   '#####.........#######...########..######'],
];
const T = 40;
export const platform = {
  w: 600, h: 400, how: '← → to run, ↑ or Space to jump (or tap the top half to jump, hold left/right side to run). Grab the coins and reach the flag!',
  start(G) { G.pl = { lvl: -1, fx: [] }; this.level(G); },
  level(G) {
    const P = G.pl; P.lvl++;
    if (P.lvl >= LEVELS.length) return G.win('All levels done!');
    P.map = LEVELS[P.lvl].map(r => r.padEnd(40, '.').split(''));
    P.map.forEach((row, y) => row.forEach((ch, x) => { if (ch === 'P') { P.sx = x * T + 6; P.sy = y * T + 4; row[x] = '.'; } }));
    this.respawn(G); G.status(`level ${P.lvl + 1}`);
  },
  respawn(G) { Object.assign(G.pl, { x: G.pl.sx, y: G.pl.sy, vx: 0, vy: 0, ground: false, face: 1 }); },
  solid(G, x, y) { const ch = G.pl.map[Math.floor(y / T)]?.[Math.floor(x / T)]; return ch === '#' || ch === '='; },
  jump(G) { const P = G.pl; if (P.ground) { P.vy = -640; P.ground = false; G.sound('tick'); } },
  key(G, k) { if (k === ' ' || k === 'ArrowUp') this.jump(G); },
  tap(G, x, y) { if (y < 220) this.jump(G); },
  hurt(G) { const P = G.pl; burst(P.fx, P.x + 14, P.y + 17, '#ff7043', 20, 160); G.sound('error'); G.lives--; if (G.lives <= 0) return G.lose('Out of lives'); this.respawn(G); },
  update(G, dt) {
    const P = G.pl, W = 28, H = 34; stepSparks(P.fx, dt);
    let dir = (G.keys.has('ArrowRight') ? 1 : 0) - (G.keys.has('ArrowLeft') ? 1 : 0);
    if (G.pointer.down && G.pointer.y > 220) dir = G.pointer.x < 200 ? -1 : G.pointer.x > 400 ? 1 : dir;
    if (dir) P.face = dir;
    P.vx = dir * 230; P.vy = Math.min(P.vy + 1500 * dt, 900);
    P.x += P.vx * dt;
    for (const yy of [P.y + 2, P.y + H - 2]) {
      if (P.vx > 0 && this.solid(G, P.x + W, yy)) P.x = Math.floor((P.x + W) / T) * T - W - 0.01;
      if (P.vx < 0 && this.solid(G, P.x, yy)) P.x = Math.floor(P.x / T) * T + T + 0.01;
    }
    P.x = clamp(P.x, 0, 40 * T - W);
    P.y += P.vy * dt; P.ground = false;
    for (const xx of [P.x + 3, P.x + W - 3]) {
      if (P.vy > 0 && this.solid(G, xx, P.y + H)) { P.y = Math.floor((P.y + H) / T) * T - H; P.vy = 0; P.ground = true; }
      if (P.vy < 0 && this.solid(G, xx, P.y)) { P.y = Math.floor(P.y / T) * T + T; P.vy = 0; }
    }
    if (P.y > 420) return this.hurt(G);
    for (const [cx, cy] of [[P.x + 6, P.y + 6], [P.x + W - 6, P.y + 6], [P.x + 6, P.y + H - 4], [P.x + W - 6, P.y + H - 4]]) {
      const gx = Math.floor(cx / T), gy = Math.floor(cy / T), ch = P.map[gy]?.[gx];
      if (ch === '*') { P.map[gy][gx] = '.'; G.add(10); G.sound('pop'); burst(P.fx, gx * T + 20, gy * T + 20, '#ffd23f', 8, 90); }
      if (ch === '^') return this.hurt(G);
      if (ch === 'F') { G.add(100); G.sound('ok'); return this.level(G); }
    }
  },
  draw(G, c) {
    const P = G.pl, cam = clamp(P.x - 260, 0, 40 * T - 600);
    sky(c, 600, 400, '#81d4fa', '#e0f7fa');
    c.fillStyle = '#a5d6a7'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(((i * 260 - cam * 0.3) % 1560 + 1560) % 1560 - 200, 400, 150, 0, TAU); c.fill(); }
    c.save(); c.translate(-cam, 0);
    const x0 = Math.floor(cam / T), x1 = x0 + 16;
    P.map.forEach((row, y) => { for (let x = x0; x <= x1 && x < 40; x++) {
      const ch = row[x], X = x * T, Y = y * T;
      if (ch === '#') { rr(c, X, Y, T, T, 0, '#8d6e63'); if (P.map[y - 1]?.[x] !== '#') rr(c, X, Y, T, 10, 0, '#66bb6a'); }
      else if (ch === '=') { rr(c, X + 1, Y + 2, T - 2, 16, 5, '#ffb74d'); rr(c, X + 4, Y + 6, T - 8, 3, 2, '#ffe0b2'); }
      else if (ch === '*') emoji(c, '🪙', X + 20, Y + 20 + Math.sin(G.t * 4 + x) * 3, 24);
      else if (ch === '^') poly(c, [[X + 2, Y + T], [X + 10, Y + 18], [X + 18, Y + T], [X + 22, Y + T], [X + 30, Y + 18], [X + 38, Y + T]], '#90a4ae');
      else if (ch === 'F') emoji(c, '🚩', X + 20, Y + 18, 34);
    } });
    c.save(); c.translate(P.x + 14, P.y + 17); c.scale(P.face, 1); emoji(c, '🦊', 0, 0, 34); c.restore();
    drawSparks(c, P.fx); c.restore();
    hearts(c, G.lives, 18, 20);
  },
};

// ================================================================ Neon Trails
export const trails = {
  w: 600, h: 420, how: 'Steer with the arrow keys, or tap the left/right half to turn. Don\'t touch any trail. Last bike riding wins the round. First to 3!',
  start(G) { G.tr = { me: 0, them: 0 }; this.round(G); },
  round(G) {
    const t = G.tr, W = 100, H = 70; Object.assign(t, { W, H, grid: new Uint8Array(W * H), acc: 0, wait: 1, turn: null });
    t.layer = cached(600, 420, g => { g.fillStyle = '#0b0f1e'; g.fillRect(0, 0, 600, 420); g.strokeStyle = 'rgba(80,120,255,.12)'; for (let x = 0; x < 600; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 420); g.stroke(); } for (let y = 0; y < 420; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(600, y); g.stroke(); } });
    t.ctx = t.layer.getContext('2d');
    t.bikes = [{ x: 15, y: 35, dx: 1, dy: 0, col: '#ff8a1f', me: true }, { x: 85, y: 35, dx: -1, dy: 0, col: '#2fb8ff' }, { x: 50, y: 8, dx: 0, dy: 1, col: '#ff4f9a' }, { x: 50, y: 62, dx: 0, dy: -1, col: '#9be15d' }].slice(0, 1 + (G.params.foes || 1));
    G.status(`you ${t.me} · bikes ${t.them}`);
  },
  turnTo(G, dx, dy) { const me = G.tr.bikes[0]; if (me.dead || (dx === -me.dx && dy === -me.dy)) return; G.tr.turn = [dx, dy]; },
  key(G, k) { const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k]; if (d) this.turnTo(G, ...d); },
  tap(G, x) { const me = G.tr.bikes[0]; x < 300 ? this.turnTo(G, me.dy, -me.dx) : this.turnTo(G, -me.dy, me.dx); },
  free(t, x, y) { return x >= 0 && y >= 0 && x < t.W && y < t.H && !t.grid[y * t.W + x]; },
  update(G, dt) {
    const t = G.tr;
    if (t.wait > 0) { t.wait -= dt; return; }
    t.acc += dt * 20 * (G.params.speed || 1);
    while (t.acc >= 1) {
      t.acc--;
      if (t.turn) { [t.bikes[0].dx, t.bikes[0].dy] = t.turn; t.turn = null; }
      for (const b of t.bikes) if (!b.dead && !b.me) {
        const look = (dx, dy) => { let n = 0; while (n < 14 && this.free(t, b.x + dx * (n + 1), b.y + dy * (n + 1))) n++; return n + Math.random() * 1.5; };
        const opts = [[b.dx, b.dy], [b.dy, -b.dx], [-b.dy, b.dx]].map(d => [d, look(...d)]);
        if (opts[0][1] < 4 || Math.random() < 0.03) { opts.sort((a, z) => z[1] - a[1]); [b.dx, b.dy] = opts[0][0]; }
      }
      const next = t.bikes.map(b => (b.dead ? null : [b.x + b.dx, b.y + b.dy]));
      t.bikes.forEach((b, i) => {
        if (b.dead) return;
        const [x, y] = next[i];
        const clash = next.some((n, j) => j !== i && n && n[0] === x && n[1] === y);
        if (!this.free(t, x, y) || clash) { b.dead = true; G.sound(b.me ? 'error' : 'pop'); return; }
        b.x = x; b.y = y; t.grid[y * t.W + x] = i + 1; t.ctx.fillStyle = b.col; t.ctx.fillRect(x * 6, y * 6, 6, 6);
      });
      const me = t.bikes[0], alive = t.bikes.filter(b => !b.dead);
      if (me.dead || alive.length <= 1) {
        if (!me.dead) { t.me++; G.add(100); G.sound('ok'); } else t.them++;
        if (t.me >= 3) return G.win('You won 3 rounds!');
        if (t.them >= 3) return G.lose('The bikes won 3 rounds');
        return this.round(G);
      }
    }
  },
  draw(G, c) {
    const t = G.tr;
    c.drawImage(t.layer, 0, 0);
    for (const b of t.bikes) if (!b.dead) { dot(c, b.x * 6 + 3, b.y * 6 + 3, 6, b.col); dot(c, b.x * 6 + 3, b.y * 6 + 3, 3, '#fff'); }
    if (t.wait > 0) txt(c, `Round ${t.me + t.them + 1}`, 300, 210, 32, '#fff');
  },
};

// ================================================================ Hungry Fish
export const fishy = {
  w: 600, h: 420, how: 'Move your fish with the mouse or arrow keys. Eat fish smaller than you and grow. Stay away from bigger ones (red rings)!',
  start(G) { G.f = { x: 300, y: 210, r: 14, face: 1, fish: [], t: 0, inv: 1.5, fx: [], bub: starfield(26, 600, 420), mouse: false }; },
  move(G) { G.f.mouse = true; },
  update(G, dt) {
    const f = G.f;
    let dx = 0, dy = 0;
    if (G.keys.has('ArrowLeft')) dx--; if (G.keys.has('ArrowRight')) dx++; if (G.keys.has('ArrowUp')) dy--; if (G.keys.has('ArrowDown')) dy++;
    if (dx || dy) { f.mouse = false; f.x += dx * 230 * dt; f.y += dy * 230 * dt; if (dx) f.face = dx; }
    else if (f.mouse) { const ex = G.pointer.x - f.x, ey = G.pointer.y - f.y, d = Math.hypot(ex, ey); if (d > 4) { const s = Math.min(d, 270 * dt); f.x += (ex / d) * s; f.y += (ey / d) * s; if (Math.abs(ex) > 3) f.face = Math.sign(ex); } }
    f.x = clamp(f.x, f.r, 600 - f.r); f.y = clamp(f.y, f.r, 420 - f.r); f.inv -= dt; f.t -= dt;
    for (const b of f.bub) { b[1] -= 20 * dt; if (b[1] < 0) b[1] = 420; }
    if (f.t <= 0) {
      f.t = rand(0.45, 1.0); const side = Math.random() < 0.5 ? -1 : 1, r = clamp(f.r * rand(0.35, 1.8), 6, 80);
      f.fish.push({ x: side < 0 ? -r : 600 + r, y: rand(25, 395), r, vx: -side * rand(40, 120) * (G.params.speed || 1), e: pick(['🐟', '🐠', '🐡', '🦈', '🐋', '🦑']) });
    }
    for (const o of f.fish) {
      o.x += o.vx * dt;
      if (!o.gone && Math.hypot(o.x - f.x, o.y - f.y) < f.r + o.r * 0.6) {
        if (o.r < f.r * 0.95) { o.gone = true; f.r = Math.min(70, f.r + o.r * 0.07); G.add(Math.round(o.r)); G.sound('pop'); burst(f.fx, o.x, o.y, '#b3e5fc', 8, 80); }
        else if (f.inv <= 0) { G.lives--; G.sound('error'); burst(f.fx, f.x, f.y, '#ff8a1f', 20, 150); f.inv = 2; if (G.lives <= 0) return G.lose('A bigger fish got you'); }
      }
    }
    f.fish = f.fish.filter(o => !o.gone && o.x > -120 && o.x < 720);
    stepSparks(f.fx, dt, 0);
    if (f.r >= 60) G.win('You are the biggest fish in the sea!');
  },
  draw(G, c) {
    const f = G.f;
    sky(c, 600, 420, '#4fc3f7', '#0d47a1');
    c.globalAlpha = 0.35; for (const [x, y, r] of f.bub) dot(c, x, y, r * 2, '#e1f5fe'); c.globalAlpha = 1;
    for (const o of f.fish) {
      if (o.r >= f.r * 0.95) { c.beginPath(); c.arc(o.x, o.y, o.r + 4, 0, TAU); c.strokeStyle = 'rgba(255,60,60,.6)'; c.lineWidth = 3; c.stroke(); }
      c.save(); c.translate(o.x, o.y); if (o.vx > 0) c.scale(-1, 1); emoji(c, o.e, 0, 0, o.r * 2); c.restore();
    }
    c.save(); c.translate(f.x, f.y); if (f.face > 0) c.scale(-1, 1); c.globalAlpha = f.inv > 0 && Math.floor(f.inv * 8) % 2 ? 0.4 : 1; emoji(c, '🐠', 0, 0, f.r * 2.2); c.restore();
    drawSparks(c, f.fx); hearts(c, G.lives, 18, 20);
    rr(c, 440, 12, 140, 12, 6, 'rgba(255,255,255,.3)'); rr(c, 440, 12, 140 * Math.min(1, (f.r - 14) / 46), 12, 6, '#ffd23f');
  },
};

// ================================================================ Moon Lander
export const lander = {
  w: 600, h: 420, how: '↑ (or hold the mouse) fires the engine, ← → nudge sideways. Land slowly on the glowing pad. Watch your fuel!',
  start(G) { G.l = { lvl: 0, fx: [], sky: starfield(80, 600, 420) }; this.level(G); },
  level(G) {
    const l = G.l; l.lvl++;
    const n = 15, pad = rand(2, 11) | 0, padW = Math.max(2, 4 - Math.floor(l.lvl / 2));
    l.ground = Array.from({ length: n + 1 }, () => rand(280, 390));
    for (let i = pad + 1; i <= pad + padW; i++) l.ground[i] = l.ground[pad];
    l.pad = [pad * 40, (pad + padW) * 40, l.ground[pad]];
    this.ship(G); G.status(`level ${l.lvl}`);
  },
  ship(G) { Object.assign(G.l, { x: 80 + rand(0, 440), y: 50, vx: rand(-30, 30), vy: 0, fuel: 100, burn: false, done: 0 }); },
  gy(l, x) { const i = clamp(Math.floor(x / 40), 0, 14), t = (x - i * 40) / 40; return l.ground[i] + (l.ground[i + 1] - l.ground[i]) * t; },
  update(G, dt) {
    const l = G.l; stepSparks(l.fx, dt, 60);
    if (l.done > 0) { l.done -= dt; if (l.done <= 0) l.ok ? this.level(G) : this.ship(G); return; }
    const grav = 38 * (G.params.gravity || 1);
    l.burn = (G.keys.has('ArrowUp') || G.keys.has(' ') || G.pointer.down) && l.fuel > 0;
    if (l.burn) { l.vy -= 90 * dt; l.fuel -= 14 * dt; }
    const side = (G.keys.has('ArrowRight') ? 1 : 0) - (G.keys.has('ArrowLeft') ? 1 : 0);
    if (side && l.fuel > 0) { l.vx += side * 50 * dt; l.fuel -= 5 * dt; }
    l.vy += grav * dt; l.x += l.vx * dt; l.y += l.vy * dt;
    if (l.x < 10 || l.x > 590) { l.vx *= -0.5; l.x = clamp(l.x, 10, 590); }
    const g = this.gy(l, l.x);
    if (l.y + 14 >= g) {
      const onPad = l.x - 10 >= l.pad[0] && l.x + 10 <= l.pad[1], soft = l.vy < 45 && Math.abs(l.vx) < 28;
      l.y = g - 14; l.done = 1.4;
      if (onPad && soft) { l.ok = true; G.add(100 + Math.round(l.fuel)); G.sound('ok'); burst(l.fx, l.x, l.y + 10, '#9be15d', 24, 120); }
      else { l.ok = false; G.sound('error'); burst(l.fx, l.x, l.y, '#ff7043', 40, 220); G.lives--; if (G.lives <= 0) return G.lose(onPad ? 'Too fast!' : 'Missed the pad'); }
    }
  },
  draw(G, c) {
    const l = G.l;
    sky(c, 600, 420, '#05061a', '#1a1f4a'); drawStars(c, l.sky);
    poly(c, [[0, 420], ...l.ground.map((y, i) => [i * 40, y]), [600, 420]], '#5d6475');
    rr(c, l.pad[0], l.pad[2] - 3, l.pad[1] - l.pad[0], 6, 3, '#9be15d');
    if (!(l.done > 0 && !l.ok)) {
      c.save(); c.translate(l.x, l.y);
      if (l.burn) poly(c, [[-6, 10], [0, 22 + Math.random() * 10], [6, 10]], '#ffb74d');
      rr(c, -11, -12, 22, 20, 8, '#eceff1'); dot(c, 0, -3, 5, '#4fc3f7'); line(c, -10, 6, -15, 14, 3, '#b0bec5'); line(c, 10, 6, 15, 14, 3, '#b0bec5'); c.restore();
    }
    drawSparks(c, l.fx);
    rr(c, 14, 40, 100, 10, 5, 'rgba(255,255,255,.2)'); rr(c, 14, 40, Math.max(0, l.fuel), 10, 5, l.fuel > 25 ? '#ffd23f' : '#ff5252');
    const safe = l.vy < 45 && Math.abs(l.vx) < 28;
    txt(c, `speed ${Math.round(Math.hypot(l.vx, l.vy))}`, 14, 64, 13, safe ? '#9be15d' : '#ff8a80', 'left');
    hearts(c, G.lives, 18, 20);
  },
};

// ================================================================ Fireworks Party (a calm toy)
export const fireworks = {
  w: 600, h: 420, how: 'Tap or click anywhere in the sky to launch a firework. Each one plays a note: make your own music show!',
  start(G) {
    G.fw = { rockets: [], fx: [], sky: starfield(70, 600, 300) };
    G.fw.city = cached(600, 420, g => { g.fillStyle = '#0d0a1f'; let x = 0; while (x < 600) { const w = 30 + Math.random() * 40, h = 30 + Math.random() * 70; g.fillRect(x, 420 - h, w, h); g.fillStyle = '#ffd54f'; for (let i = 0; i < 6; i++) if (Math.random() < 0.5) g.fillRect(x + 6 + (i % 3) * 9, 420 - h + 8 + Math.floor(i / 3) * 14, 4, 6); g.fillStyle = '#0d0a1f'; x += w + 4; } });
  },
  tap(G, x, y) { G.fw.rockets.push({ sx: rand(200, 400), x: 0, y: 420, tx: x, ty: Math.min(y, 300), col: pick(PALETTE), col2: pick(PALETTE), t: 0 }); G.sound('tick'); },
  key(G, k) { if (k === ' ') this.tap(G, rand(80, 520), rand(60, 240)); },
  update(G, dt) {
    const f = G.fw;
    for (const r of f.rockets) {
      r.t += dt * 1.5; const e = 1 - (1 - Math.min(1, r.t)) ** 2;
      r.x = r.sx + (r.tx - r.sx) * e; r.y = 420 + (r.ty - 420) * e;
      if (r.t >= 1 && !r.done) { r.done = true; burst(f.fx, r.tx, r.ty, r.col, 50, 210); burst(f.fx, r.tx, r.ty, r.col2, 25, 110); tone(NOTES[Math.floor((r.tx / 600) * 11)], 0.6, 'sine', 0.1); G.add(1); }
    }
    f.rockets = f.rockets.filter(r => !r.done); stepSparks(f.fx, dt, 70);
  },
  draw(G, c) {
    const f = G.fw;
    sky(c, 600, 420, '#0a0620', '#2b1655'); drawStars(c, f.sky);
    for (const r of f.rockets) { line(c, r.x, r.y, r.x - (r.tx - r.sx) * 0.03, r.y + 18, 3, 'rgba(255,220,150,.7)'); dot(c, r.x, r.y, 3, '#fff'); }
    drawSparks(c, f.fx); c.drawImage(f.city, 0, 0);
    if (!G.score) txt(c, 'Tap the sky!', 300, 200, 26, 'rgba(255,255,255,.8)');
  },
};
