// Action games: each is a small object { w, h, start, update, draw, key?, tap?, move? } run by engine.js.
import { rand, pick, clamp, hit, PALETTE } from '../engine.js';

import { sky, rr, dot, txt, emoji, steer } from './kit.js';

// ================================================================ Snake
export const snake = {
  w: 400, h: 400, how: 'Arrow keys (or swipe) to steer. Eat the fruit, don\'t bite yourself.',
  start(G) {
    const n = 20;
    G.s = { n, cell: 400 / n, body: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 }, acc: 0,
      speed: G.params.speed || 7, walls: G.params.walls ?? true, rocks: [] };
    if (G.params.rocks) for (let i = 0; i < 14; i++) G.s.rocks.push({ x: rand(2, n - 2) | 0, y: rand(2, n - 2) | 0 });
    G.s.rocks = G.s.rocks.filter(r => !(r.y === 10 && r.x > 6 && r.x < 14));
    this.food(G);
  },
  food(G) {
    const s = G.s;
    do { s.food = { x: rand(s.n), y: rand(s.n), e: pick(['🍎', '🍊', '🍇', '🍓', '🍌', '🍉']) }; }
    while (s.body.some(b => b.x === s.food.x && b.y === s.food.y) || s.rocks.some(r => r.x === s.food.x && r.y === s.food.y));
  },
  key(G, k) {
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[k];
    if (d && (d[0] !== -G.s.dir.x || d[1] !== -G.s.dir.y)) G.s.next = { x: d[0], y: d[1] };
  },
  tap(G, x, y) { this.sx = x; this.sy = y; },
  release(G) {
    const dx = G.pointer.x - this.sx, dy = G.pointer.y - this.sy;
    if (Math.hypot(dx, dy) < 12) return;
    this.key(G, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'));
  },
  update(G, dt) {
    const s = G.s;
    s.acc += dt;
    const step = 1 / (s.speed + s.body.length * 0.08);
    while (s.acc > step) {
      s.acc -= step;
      s.dir = s.next;
      let hd = { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y };
      if (!s.walls) hd = { x: (hd.x + s.n) % s.n, y: (hd.y + s.n) % s.n };
      if (hd.x < 0 || hd.y < 0 || hd.x >= s.n || hd.y >= s.n || s.body.some(b => b.x === hd.x && b.y === hd.y) || s.rocks.some(r => r.x === hd.x && r.y === hd.y)) return G.lose('Ouch!');
      s.body.unshift(hd);
      if (hd.x === s.food.x && hd.y === s.food.y) { G.add(10); G.sound('pop'); this.food(G); } else s.body.pop();
    }
  },
  draw(G, c) {
    const s = G.s, z = s.cell;
    sky(c, 400, 400, '#1b5e20', '#2e7d32');
    for (let i = 0; i < s.n; i++) for (let j = 0; j < s.n; j++) if ((i + j) % 2) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(i * z, j * z, z, z); }
    s.rocks.forEach(r => rr(c, r.x * z + 1, r.y * z + 1, z - 2, z - 2, 5, '#795548'));
    emoji(c, s.food.e, s.food.x * z + z / 2, s.food.y * z + z / 2 + 1, z * 0.9);
    s.body.forEach((b, i) => rr(c, b.x * z + 1, b.y * z + 1, z - 2, z - 2, 6, i ? `hsl(${30 + i * 3},100%,${60 - Math.min(i, 20)}%)` : '#ffcf5c'));
    const hd = s.body[0];
    dot(c, hd.x * z + z * 0.35, hd.y * z + z * 0.4, 2.5, '#222'); dot(c, hd.x * z + z * 0.65, hd.y * z + z * 0.4, 2.5, '#222');
  },
};

// ================================================================ Breakout
const LAYOUTS = {
  classic: r => true,
  pyramid: (r, col, rows, cols) => Math.abs(col - (cols - 1) / 2) <= r * 0.8 + 0.6,
  checker: (r, col) => (r + col) % 2 === 0,
  heart: (r, col) => [[0, 1, 1, 0, 0, 1, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1, 1, 0], [0, 0, 1, 1, 1, 1, 0, 0], [0, 0, 0, 1, 1, 0, 0, 0]][r]?.[col],
  wall: (r) => r % 2 === 0,
};
export const breakout = {
  w: 360, h: 560, how: 'Move the paddle with the mouse or arrow keys. Break every brick!',
  start(G) {
    const cols = 8, rows = 6, bw = 40, bh = 18;
    const f = LAYOUTS[G.params.layout || 'classic'];
    G.b = { pad: { x: 140, y: 520, w: 80, h: 12 }, ball: { x: 180, y: 500, vx: 150, vy: -260, r: 7 }, stuck: true, bricks: [] };
    for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) if (f(r, col, rows, cols)) G.b.bricks.push({ x: 8 + col * (bw + 3), y: 60 + r * (bh + 4), w: bw, h: bh, c: PALETTE[r % PALETTE.length] });
    G.lives = 3; G.status('♥♥♥');
  },
  tap(G) { G.b.stuck = false; },
  key(G, k) { if (k === ' ' || k === 'ArrowUp') G.b.stuck = false; },
  update(G, dt) {
    const b = G.b, p = b.pad, ball = b.ball;
    steer(G, 420, dt, p, 0, 360 - p.w);
    if (b.stuck) { ball.x = p.x + p.w / 2; ball.y = p.y - 9; return; }
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x < ball.r || ball.x > 360 - ball.r) { ball.vx *= -1; ball.x = clamp(ball.x, ball.r, 360 - ball.r); }
    if (ball.y < ball.r) { ball.vy = Math.abs(ball.vy); }
    if (ball.vy > 0 && ball.y + ball.r > p.y && ball.y < p.y + p.h && ball.x > p.x - 4 && ball.x < p.x + p.w + 4) {
      const off = (ball.x - (p.x + p.w / 2)) / (p.w / 2), sp = Math.min(520, Math.hypot(ball.vx, ball.vy) * 1.02);
      ball.vx = sp * off * 0.8; ball.vy = -Math.sqrt(sp * sp - ball.vx * ball.vx); G.sound('tick');
    }
    for (const br of b.bricks) {
      if (!br.dead && hit({ x: ball.x - ball.r, y: ball.y - ball.r, w: ball.r * 2, h: ball.r * 2 }, br)) {
        br.dead = true; ball.vy *= -1; G.add(5); G.sound('pop'); break;
      }
    }
    if (b.bricks.every(x => x.dead)) return G.win('All bricks broken');
    if (ball.y > 580) {
      G.lives--; G.status('♥'.repeat(G.lives)); b.stuck = true; ball.vx = 150; ball.vy = -260;
      if (G.lives <= 0) G.lose('Out of balls');
    }
  },
  draw(G, c) {
    const b = G.b;
    sky(c, 360, 560, '#1a1446', '#3b1f6b');
    b.bricks.forEach(br => !br.dead && rr(c, br.x, br.y, br.w, br.h, 5, br.c));
    rr(c, b.pad.x, b.pad.y, b.pad.w, b.pad.h, 6, '#ffb24d');
    dot(c, b.ball.x, b.ball.y, b.ball.r, '#fff');
    if (b.stuck) txt(c, 'tap / space to launch', 180, 470, 14, 'rgba(255,255,255,.7)');
  },
};

// ================================================================ Orange Fly (flappy style)
export const fly = {
  w: 360, h: 600, how: 'Tap, click or press Space to flap through the gaps.',
  start(G) { G.f = { y: 300, vy: 0, pipes: [], t: 0, gap: G.params.gap || 170, speed: G.params.speed || 140 }; },
  flap(G) { G.f.vy = -300; G.sound('tick'); },
  tap(G) { this.flap(G); },
  key(G, k) { if (k === ' ' || k === 'ArrowUp') this.flap(G); },
  update(G, dt) {
    const f = G.f;
    f.vy += 900 * dt; f.y += f.vy * dt; f.t -= dt;
    if (f.t <= 0) { f.t = 1.6; const top = rand(60, 600 - f.gap - 80); f.pipes.push({ x: 380, top, scored: false }); }
    for (const p of f.pipes) {
      p.x -= f.speed * dt;
      if (!p.scored && p.x + 50 < 80) { p.scored = true; G.add(1); G.sound('pop'); }
      const bird = { x: 66, y: f.y - 14, w: 28, h: 28 };
      if (hit(bird, { x: p.x, y: 0, w: 50, h: p.top }) || hit(bird, { x: p.x, y: p.top + f.gap, w: 50, h: 600 })) return G.lose('Bonk!');
    }
    f.pipes = f.pipes.filter(p => p.x > -60);
    if (f.y > 580 || f.y < 0) G.lose('Fell down');
  },
  draw(G, c) {
    const f = G.f;
    sky(c, 360, 600, '#7fd3ff', '#d6f3ff');
    for (const p of f.pipes) { rr(c, p.x, -10, 50, p.top + 10, 8, '#43a047'); rr(c, p.x, p.top + f.gap, 50, 600, 8, '#43a047'); }
    rr(c, 0, 585, 360, 20, 0, '#8d6e63');
    c.save(); c.translate(80, f.y); c.rotate(clamp(f.vy / 600, -0.5, 0.8)); emoji(c, '🍊', 0, 0, 34); c.restore();
  },
};

// ================================================================ Pong vs computer
export const pong = {
  w: 360, h: 600, how: 'Move your paddle (bottom) with the mouse or arrows. First to 7 wins.',
  start(G) { G.p = { me: { x: 140, y: 560, w: 80, h: 12 }, cpu: { x: 140, y: 28, w: 80, h: 12 }, ball: { x: 180, y: 300, vx: 160, vy: 220 }, a: 0, b: 0, skill: G.params.skill || 0.6 }; },
  update(G, dt) {
    const p = G.p, ball = p.ball;
    steer(G, 460, dt, p.me, 0, 280);
    const target = ball.x - p.cpu.w / 2 + (ball.vy < 0 ? 0 : (180 - ball.x) * 0.5);
    p.cpu.x += clamp(target - p.cpu.x, -300 * p.skill * dt * 1.6, 300 * p.skill * dt * 1.6);
    p.cpu.x = clamp(p.cpu.x, 0, 280);
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x < 8 || ball.x > 352) ball.vx *= -1;
    for (const [pad, dir] of [[p.me, -1], [p.cpu, 1]]) {
      if (Math.sign(ball.vy) === -dir && Math.abs(ball.y - (pad.y + 6)) < 12 && ball.x > pad.x - 6 && ball.x < pad.x + pad.w + 6) {
        ball.vy = dir * Math.min(520, Math.abs(ball.vy) * 1.06); ball.vx = (ball.x - (pad.x + pad.w / 2)) * 5; G.sound('tick');
      }
    }
    if (ball.y < -10 || ball.y > 610) {
      if (ball.y > 610) p.b++; else { p.a++; G.add(1); G.sound('ok'); }
      Object.assign(ball, { x: 180, y: 300, vx: rand(-160, 160), vy: ball.y > 610 ? -220 : 220 });
      G.status(`you ${p.a} : ${p.b} cpu`);
      if (p.a >= 7) G.win(`You beat the computer ${p.a}–${p.b}`);
      if (p.b >= 7) G.lose(`Computer won ${p.b}–${p.a}`);
    }
  },
  draw(G, c) {
    const p = G.p;
    sky(c, 360, 600, '#0d2b45', '#203c56');
    c.setLineDash([10, 10]); c.strokeStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.moveTo(0, 300); c.lineTo(360, 300); c.stroke(); c.setLineDash([]);
    txt(c, String(p.b), 330, 260, 30, 'rgba(255,255,255,.3)'); txt(c, String(p.a), 330, 340, 30, 'rgba(255,255,255,.3)');
    rr(c, p.cpu.x, p.cpu.y, p.cpu.w, p.cpu.h, 6, '#ff7eb3'); rr(c, p.me.x, p.me.y, p.me.w, p.me.h, 6, '#ffd166');
    dot(c, p.ball.x, p.ball.y, 8, '#fff');
  },
};

// ================================================================ Space Defender
export const shooter = {
  w: 360, h: 600, how: 'Move with mouse or arrows. Shooting is automatic. Stop the invaders!',
  start(G) { G.s = { me: { x: 160, y: 540, w: 40, h: 36 }, shots: [], foes: [], t: 0, ft: 0, rate: G.params.rate || 1.1, stars: Array.from({ length: 50 }, () => ({ x: rand(360), y: rand(600), s: rand(1, 3) })) }; G.lives = 3; G.status('♥♥♥'); },
  update(G, dt) {
    const s = G.s;
    steer(G, 380, dt, s.me, 0, 320);
    s.t -= dt; s.ft -= dt;
    if (s.t <= 0) { s.t = 0.28; s.shots.push({ x: s.me.x + 17, y: s.me.y - 10, w: 6, h: 14 }); }
    if (s.ft <= 0) { s.ft = Math.max(0.35, s.rate - G.score / 900); s.foes.push({ x: rand(10, 320), y: -30, w: 36, h: 32, v: rand(60, 110) + G.score / 8, e: pick(['👾', '🛸', '👽']) }); }
    s.shots.forEach(b => b.y -= 520 * dt);
    s.foes.forEach(f => { f.y += f.v * dt; f.x += Math.sin(G.t * 3 + f.v) * 40 * dt; });
    for (const f of s.foes) for (const b of s.shots) if (!f.dead && !b.dead && hit(f, b)) { f.dead = b.dead = true; G.add(10); G.sound('pop'); }
    for (const f of s.foes) if (!f.dead && (f.y > 600 || hit(f, s.me))) { f.dead = true; G.lives--; G.status('♥'.repeat(Math.max(0, G.lives))); G.sound('error'); if (G.lives <= 0) return G.lose('The invaders got through'); }
    s.shots = s.shots.filter(b => !b.dead && b.y > -20); s.foes = s.foes.filter(f => !f.dead);
    s.stars.forEach(st => { st.y += st.s * 30 * dt; if (st.y > 600) st.y = 0; });
  },
  draw(G, c) {
    const s = G.s;
    sky(c, 360, 600, '#05051a', '#1a0b3d');
    s.stars.forEach(st => dot(c, st.x, st.y, st.s / 2, 'rgba(255,255,255,.8)'));
    s.shots.forEach(b => rr(c, b.x, b.y, b.w, b.h, 3, '#ffcf5c'));
    s.foes.forEach(f => emoji(c, f.e, f.x + 18, f.y + 16, 32));
    emoji(c, '🚀', s.me.x + 20, s.me.y + 18, 38);
  },
};

// ================================================================ Catcher (fruit / letters / numbers)
const CATCH_SETS = {
  fruit: { good: ['🍎', '🍊', '🍇', '🍓', '🍌', '🍒', '🍍'], bad: ['💣', '🪨'] },
  vowels: { good: ['A', 'E', 'I', 'O', 'U'], bad: ['B', 'K', 'T', 'M', 'Z', 'R', 'P'], letters: true },
  even: { good: ['2', '4', '6', '8', '10', '12'], bad: ['1', '3', '5', '7', '9', '11'], letters: true },
};
export const catcher = {
  w: 360, h: 600,
  get how() { return 'Move the basket. Catch the good ones, avoid the rest!'; },
  start(G) { G.c = { me: { x: 140, y: 540, w: 80, h: 40 }, items: [], t: 0, set: CATCH_SETS[G.params.set || 'fruit'] }; G.lives = 3; G.status('♥♥♥'); },
  update(G, dt) {
    const s = G.c;
    steer(G, 420, dt, s.me, 0, 280);
    s.t -= dt;
    if (s.t <= 0) { s.t = Math.max(0.45, 1.0 - G.score / 600); const good = Math.random() < 0.65; s.items.push({ x: rand(10, 320), y: -30, w: 34, h: 34, v: rand(120, 190) + G.score / 4, good, e: pick(good ? s.set.good : s.set.bad) }); }
    for (const it of s.items) {
      it.y += it.v * dt;
      if (!it.done && hit(it, s.me)) { it.done = true; if (it.good) { G.add(5); G.sound('pop'); } else { G.lives--; G.sound('error'); G.status('♥'.repeat(Math.max(0, G.lives))); } }
      if (!it.done && it.y > 600) { it.done = true; if (it.good && s.set.letters) { G.lives--; G.status('♥'.repeat(Math.max(0, G.lives))); } }
    }
    s.items = s.items.filter(i => !i.done);
    if (G.lives <= 0) G.lose();
  },
  draw(G, c) {
    const s = G.c;
    sky(c, 360, 600, '#ffe0b2', '#ffccbc');
    if (s.set.letters) txt(c, G.params.set === 'vowels' ? 'catch the vowels' : 'catch the even numbers', 180, 24, 15, '#bf360c');
    for (const it of s.items) {
      if (s.set.letters) { dot(c, it.x + 17, it.y + 17, 19, it.good ? '#ffb24d' : '#90a4ae'); txt(c, it.e, it.x + 17, it.y + 18, 20, '#fff'); }
      else emoji(c, it.e, it.x + 17, it.y + 17, 32);
    }
    emoji(c, '🧺', s.me.x + 40, s.me.y + 18, 54);
  },
};

// ================================================================ Meteor dodge
export const dodge = {
  w: 360, h: 600, how: 'Dodge the falling meteors as long as you can. Mouse or arrow keys.',
  start(G) { G.d = { me: { x: 165, y: 540, w: 30, h: 30 }, rocks: [], t: 0, speed: G.params.speed || 1 }; },
  update(G, dt) {
    const d = G.d;
    steer(G, 400, dt, d.me, 0, 330);
    d.t -= dt;
    if (d.t <= 0) { d.t = Math.max(0.12, 0.6 / d.speed - G.t / 120); const r = rand(12, 26); d.rocks.push({ x: rand(0, 340), y: -40, w: r, h: r, v: (rand(160, 260) + G.t * 6) * d.speed }); }
    for (const r of d.rocks) { r.y += r.v * dt; if (hit({ x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 }, d.me)) return G.lose(`You survived ${G.t.toFixed(1)}s`); }
    d.rocks = d.rocks.filter(r => r.y < 640);
    G.setScore(Math.floor(G.t * 10));
  },
  draw(G, c) {
    const d = G.d;
    sky(c, 360, 600, '#311b92', '#880e4f');
    d.rocks.forEach(r => emoji(c, '☄️', r.x + r.w / 2, r.y + r.h / 2, r.w * 1.4));
    emoji(c, '🛸', d.me.x + 15, d.me.y + 15, 34);
  },
};

// ================================================================ Jump runner
export const runner = {
  w: 600, h: 300, how: 'Tap or press Space to jump over the obstacles.',
  start(G) { G.r = { y: 0, vy: 0, obs: [], t: 1, speed: G.params.speed || 260, night: !!G.params.night }; },
  jump(G) { if (G.r.y === 0) { G.r.vy = 560; G.sound('tick'); } },
  tap(G) { this.jump(G); },
  key(G, k) { if (k === ' ' || k === 'ArrowUp') this.jump(G); },
  update(G, dt) {
    const r = G.r;
    r.vy -= 1500 * dt; r.y = Math.max(0, r.y + r.vy * dt); if (r.y === 0) r.vy = 0;
    r.t -= dt; const sp = r.speed + G.t * 6;
    if (r.t <= 0) { r.t = rand(0.9, 1.8) * 260 / sp + 0.35; r.obs.push({ x: 620, w: rand(20, 34), h: rand(28, 52), e: pick(['🌵', '🪨', '🔥']) }); }
    for (const o of r.obs) { o.x -= sp * dt; if (hit({ x: 70, y: 250 - r.y - 40, w: 28, h: 38 }, { x: o.x + 4, y: 250 - o.h, w: o.w - 8, h: o.h })) return G.lose(); }
    r.obs = r.obs.filter(o => o.x > -50);
    G.setScore(Math.floor(G.t * 10));
  },
  draw(G, c) {
    const r = G.r;
    sky(c, 600, 300, r.night ? '#0d1b4c' : '#81d4fa', r.night ? '#283593' : '#e1f5fe');
    if (r.night) dot(c, 520, 60, 24, '#fff9c4'); else dot(c, 520, 60, 28, '#ffeb3b');
    rr(c, 0, 250, 600, 50, 0, r.night ? '#1b5e20' : '#66bb6a');
    r.obs.forEach(o => emoji(c, o.e, o.x + o.w / 2, 250 - o.h / 2, o.h * 1.2));
    emoji(c, '🏃', 84, 230 - r.y, 40);
  },
};

// ================================================================ Balloon pop (free / colour / count up)
export const balloon = {
  w: 360, h: 600,
  get how() { return 'Tap the balloons before they fly away!'; },
  start(G) {
    G.b = { list: [], t: 0, mode: G.params.mode || 'free', next: 1, color: 0 };
    G.lives = 5;
    if (G.b.mode === 'color') { G.b.color = rand(4); G.status(['pop RED', 'pop BLUE', 'pop GREEN', 'pop YELLOW'][G.b.color]); }
    if (G.b.mode === 'count') G.status('pop 1, 2, 3… in order');
  },
  tap(G, x, y) {
    const b = G.b;
    for (const bl of [...b.list].reverse()) {
      if (Math.hypot(x - bl.x, y - bl.y) < 30) {
        let ok = b.mode === 'free' || (b.mode === 'color' && bl.ci === b.color) || (b.mode === 'count' && bl.n === b.next);
        bl.dead = true;
        if (ok) { G.add(b.mode === 'count' ? 10 : 5); G.sound('pop'); if (b.mode === 'count') b.next++; }
        else { G.lives--; G.sound('error'); if (G.lives <= 0) G.lose(); }
        return;
      }
    }
  },
  update(G, dt) {
    const b = G.b;
    b.t -= dt;
    if (b.t <= 0) {
      b.t = Math.max(0.4, 0.9 - G.score / 900);
      const ci = rand(4);
      const n = b.mode === 'count' ? (Math.random() < 0.5 ? b.next + b.list.filter(x => x.n).length : rand(1, b.next + 5) | 0) : 0;
      b.list.push({ x: rand(30, 330), y: 640, v: rand(70, 120) + G.score / 10, ci, n: n || b.next + rand(3) });
    }
    for (const bl of b.list) {
      bl.y -= bl.v * dt;
      if (bl.y < -40 && !bl.dead) { bl.dead = true; if ((b.mode === 'free') || (b.mode === 'color' && bl.ci === b.color) || (b.mode === 'count' && bl.n === b.next)) { G.lives--; if (G.lives <= 0) G.lose('Too many got away'); } }
    }
    b.list = b.list.filter(x => !x.dead);
  },
  draw(G, c) {
    const cols = ['#e53935', '#1e88e5', '#43a047', '#fdd835'];
    sky(c, 360, 600, '#b3e5fc', '#fff3e0');
    for (const bl of G.b.list) {
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.moveTo(bl.x, bl.y + 32); c.lineTo(bl.x, bl.y + 60); c.stroke();
      c.beginPath(); c.ellipse(bl.x, bl.y, 26, 32, 0, 0, Math.PI * 2); c.fillStyle = cols[bl.ci]; c.fill();
      dot(c, bl.x - 9, bl.y - 12, 6, 'rgba(255,255,255,.45)');
      if (G.b.mode === 'count') txt(c, String(bl.n), bl.x, bl.y, 22);
    }
    txt(c, '♥'.repeat(Math.max(0, G.lives)), 180, 22, 18, '#e53935');
  },
};

// ================================================================ Whack-a-mole
export const whack = {
  w: 360, h: 480, how: 'Tap the moles when they pop up. 45 seconds!',
  start(G) { G.m = { holes: Array.from({ length: 9 }, (_, i) => ({ x: 70 + (i % 3) * 110, y: 130 + Math.floor(i / 3) * 120, up: 0, t: 0 })), next: 0.6, left: 45, speed: G.params.speed || 1 }; },
  tap(G, x, y) {
    for (const hl of G.m.holes) if (hl.up > 0.4 && Math.hypot(x - hl.x, y - (hl.y - 16)) < 42) { hl.up = 0; hl.t = 0; G.add(10); G.sound('pop'); return; }
  },
  update(G, dt) {
    const m = G.m;
    m.left -= dt; G.status(`${Math.ceil(m.left)}s`);
    if (m.left <= 0) return G.win('Time up');
    m.next -= dt;
    if (m.next <= 0) { m.next = rand(0.35, 0.9) / m.speed; const free = m.holes.filter(h => h.t <= 0); if (free.length) { const hl = pick(free); hl.t = rand(0.8, 1.4) / m.speed; } }
    for (const hl of m.holes) { if (hl.t > 0) { hl.t -= dt; hl.up = Math.min(1, hl.up + dt * 6); } else hl.up = Math.max(0, hl.up - dt * 6); }
  },
  draw(G, c) {
    sky(c, 360, 480, '#a5d6a7', '#66bb6a');
    for (const hl of G.m.holes) {
      c.beginPath(); c.ellipse(hl.x, hl.y + 10, 42, 16, 0, 0, Math.PI * 2); c.fillStyle = '#4e342e'; c.fill();
      if (hl.up > 0) { c.save(); c.beginPath(); c.rect(hl.x - 50, hl.y - 80, 100, 90); c.clip(); emoji(c, '🐹', hl.x, hl.y + 10 - hl.up * 40, 46); c.restore(); }
    }
  },
};

// ================================================================ Tower stack
export const stack = {
  w: 360, h: 600, how: 'Tap to drop the moving block. Line them up to build tall!',
  start(G) { G.k = { blocks: [{ x: 90, w: 180 }], cur: { x: 0, w: 180, dir: 1 }, speed: G.params.speed || 180, cam: 0 }; },
  drop(G) {
    const k = G.k, top = k.blocks[k.blocks.length - 1], cur = k.cur;
    const l = Math.max(top.x, cur.x), r = Math.min(top.x + top.w, cur.x + cur.w);
    if (r - l <= 0) return G.lose(`Tower of ${k.blocks.length - 1}`);
    k.blocks.push({ x: l, w: r - l }); G.add(1); G.sound(r - l > top.w - 4 ? 'ok' : 'pop');
    k.cur = { x: k.blocks.length % 2 ? -(r - l) : 360, w: r - l, dir: k.blocks.length % 2 ? 1 : -1 };
    k.speed += 8;
  },
  tap(G) { this.drop(G); },
  key(G, k) { if (k === ' ') this.drop(G); },
  update(G, dt) {
    const k = G.k; k.cur.x += k.cur.dir * k.speed * dt;
    if (k.cur.x > 360 - k.cur.w * 0.2 || k.cur.x < -k.cur.w * 0.8) k.cur.dir *= -1;
    k.cam += (Math.max(0, k.blocks.length - 10) * 26 - k.cam) * dt * 4;
  },
  draw(G, c) {
    const k = G.k;
    sky(c, 360, 600, `hsl(${200 + k.blocks.length * 6},70%,75%)`, `hsl(${260 + k.blocks.length * 6},60%,85%)`);
    k.blocks.forEach((b, i) => rr(c, b.x, 560 - i * 26 + k.cam, b.w, 24, 4, `hsl(${(i * 24) % 360},80%,60%)`));
    rr(c, k.cur.x, 560 - k.blocks.length * 26 + k.cam, k.cur.w, 24, 4, `hsl(${(k.blocks.length * 24) % 360},80%,60%)`);
  },
};

// ================================================================ Lane racer
export const racer = {
  w: 360, h: 600, how: 'Switch lanes with arrows or tap left/right. Don\'t crash!',
  start(G) { G.r = { lane: 1, x: 180, cars: [], t: 0, line: 0, speed: G.params.speed || 300 }; },
  key(G, k) { if (k === 'ArrowLeft') G.r.lane = Math.max(0, G.r.lane - 1); if (k === 'ArrowRight') G.r.lane = Math.min(2, G.r.lane + 1); },
  tap(G, x) { this.key(G, x < 180 ? 'ArrowLeft' : 'ArrowRight'); },
  update(G, dt) {
    const r = G.r, sp = r.speed + G.t * 8;
    r.x += ((70 + r.lane * 110) - r.x) * Math.min(1, dt * 12);
    r.t -= dt; r.line = (r.line + sp * dt) % 60;
    if (r.t <= 0) { r.t = Math.max(0.45, 1.0 - G.t / 90); r.cars.push({ lane: rand(3), y: -80, e: pick(['🚙', '🚌', '🚕', '🚓', '🚚']) }); }
    for (const car of r.cars) { car.y += sp * 0.6 * dt; if (Math.abs(car.y - 520) < 50 && Math.abs((70 + car.lane * 110) - r.x) < 50) return G.lose('Crash!'); }
    r.cars = r.cars.filter(car => car.y < 680);
    G.setScore(Math.floor(G.t * 10));
  },
  draw(G, c) {
    const r = G.r;
    sky(c, 360, 600, '#43a047', '#2e7d32');
    rr(c, 15, 0, 330, 600, 0, '#424242');
    c.fillStyle = '#fff';
    for (let y = -60 + r.line; y < 600; y += 60) { c.fillRect(123, y, 4, 30); c.fillRect(233, y, 4, 30); }
    r.cars.forEach(car => emoji(c, car.e, 70 + car.lane * 110, car.y, 56));
    c.save(); c.translate(r.x, 520); c.rotate(-Math.PI / 2); emoji(c, '🏎️', 0, 0, 58); c.restore();
  },
};

// ================================================================ Reaction tap
export const reaction = {
  w: 360, h: 480, lowerIsBetter: true, how: 'Wait for GREEN, then tap as fast as you can. 5 rounds, lowest time wins.',
  start(G) { G.q = { phase: 'wait', t: rand(1.2, 3), times: [], msg: 'wait for green…' }; },
  tap(G) {
    const q = G.q;
    if (q.phase === 'wait') { q.msg = 'too early! wait…'; q.t = rand(1.2, 3); G.sound('error'); return; }
    if (q.phase === 'go') {
      q.times.push(q.react); G.sound('pop');
      G.setScore(Math.round(q.times.reduce((a, b) => a + b, 0) / q.times.length * 1000));
      if (q.times.length >= 5) return G.win(`average ${G.score} ms`);
      q.phase = 'wait'; q.t = rand(1.2, 3); q.msg = `${Math.round(q.react * 1000)} ms · again…`;
    }
  },
  key(G, k) { if (k === ' ') this.tap(G); },
  update(G, dt) {
    const q = G.q;
    if (q.phase === 'wait') { q.t -= dt; if (q.t <= 0) { q.phase = 'go'; q.react = 0; } }
    else q.react += dt;
  },
  draw(G, c) {
    const q = G.q;
    sky(c, 360, 480, q.phase === 'go' ? '#43a047' : '#e53935', q.phase === 'go' ? '#66bb6a' : '#ef5350');
    txt(c, q.phase === 'go' ? 'TAP!' : q.msg, 180, 240, q.phase === 'go' ? 64 : 22);
    txt(c, `round ${q.times.length + 1} / 5`, 180, 440, 15, 'rgba(255,255,255,.8)');
  },
};
