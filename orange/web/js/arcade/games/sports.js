// Sports and skill games: archery, basketball, mini golf, air hockey, bowling and more. Canvas games run by engine.js.
import { rand, pick, clamp, PALETTE } from '../engine.js';
import { sky, rr, dot, txt, emoji, poly, line, burst, stepSparks, drawSparks, tone, NOTES, TAU, hearts, cached } from './kit.js';

const grass = (c, w, h, y) => { rr(c, 0, y, w, h - y, 0, '#66bb6a'); c.fillStyle = '#5cad60'; for (let x = 0; x < w; x += 40) c.fillRect(x, y, 20, h - y); };

// ================================================================ Bullseye (archery)
export const archery = {
  w: 600, h: 400, how: 'Move the mouse (or ↑ ↓) to aim. Hold the mouse button or Space to pull the bow, let go to shoot. Watch the wind! 10 arrows.',
  start(G) { G.a = { ang: -0.12, power: 0, arrow: null, left: 10, wind: rand(-30, 30), ty: 200, dir: 1, marks: [], pop: null }; G.status('10 arrows'); },
  move(G, x, y) { G.a.ang = clamp(Math.atan2(y - 300, x - 70), -1.1, 0.5); },
  shoot(G) {
    const a = G.a; if (a.arrow || a.power < 0.08 || a.left <= 0) { a.power = 0; return; }
    const v = 320 + a.power * 520; a.arrow = { x: 70, y: 300, vx: Math.cos(a.ang) * v, vy: Math.sin(a.ang) * v }; a.power = 0; a.left--; G.sound('tick'); G.status(`${a.left} arrows`);
  },
  release(G) { this.shoot(G); },
  update(G, dt) {
    const a = G.a, pulling = (G.pointer.down || G.keys.has(' ')) && !a.arrow && a.left > 0;
    if (G.keys.has('ArrowUp')) a.ang = Math.max(-1.1, a.ang - dt); if (G.keys.has('ArrowDown')) a.ang = Math.min(0.5, a.ang + dt);
    if (pulling) a.power = Math.min(1, a.power + dt * 0.9);
    if (a.wasSpace && !G.keys.has(' ')) this.shoot(G);
    a.wasSpace = G.keys.has(' ');
    if (G.params.move) { a.ty += a.dir * 70 * dt; if (a.ty < 110 || a.ty > 300) a.dir *= -1; }
    if (a.pop) { a.pop.t -= dt; if (a.pop.t <= 0) a.pop = null; }
    if (a.end) { a.end -= dt; if (a.end <= 0) return G.win(`${G.score} points`); return; }
    const r = a.arrow; if (!r) return;
    r.vy += 300 * dt; r.vx += a.wind * dt * 0.6; r.x += r.vx * dt; r.y += r.vy * dt;
    if (r.x >= 516) {
      const d = Math.abs(r.y - a.ty), pts = d < 10 ? 10 : d < 20 ? 8 : d < 30 ? 6 : d < 40 ? 4 : d < 50 ? 2 : 0;
      if (pts) { a.marks.push(r.y - a.ty); G.add(pts); G.sound(pts >= 8 ? 'ok' : 'pop'); }
      a.pop = { t: 1, text: pts ? `+${pts}` : 'Miss', y: r.y }; this.next(G);
    } else if (r.y > 400 || r.x > 620) { a.pop = { t: 1, text: 'Miss', y: 300 }; this.next(G); }
  },
  next(G) { const a = G.a; a.arrow = null; a.wind = rand(-30, 30); if (a.left <= 0) a.end = 0.7; },
  draw(G, c) {
    const a = G.a;
    sky(c, 600, 400, '#9bd8ff', '#e3f6ff'); grass(c, 600, 400, 330);
    rr(c, 524, a.ty + 50, 8, 330 - a.ty - 50, 2, '#8d6e63');
    ['#fff', '#1e88e5', '#e53935', '#e53935', '#ffd23f'].forEach((col, i) => rr(c, 516, a.ty - 50 + i * 10, 14, 100 - i * 20, 5, col));
    for (const m of a.marks) line(c, 506, a.ty + m, 524, a.ty + m, 3, '#5d4037');
    c.save(); c.translate(70, 300); c.rotate(a.ang);
    c.beginPath(); c.arc(0, 0, 40, -1.2, 1.2); c.strokeStyle = '#8d6e63'; c.lineWidth = 5; c.stroke();
    const pull = -a.power * 26; line(c, Math.cos(-1.2) * 40, Math.sin(-1.2) * 40, pull, 0, 1.5, '#eee'); line(c, pull, 0, Math.cos(1.2) * 40, Math.sin(1.2) * 40, 1.5, '#eee');
    if (!a.arrow && a.left > 0) line(c, pull, 0, pull + 56, 0, 3, '#5d4037');
    c.restore();
    if (a.power > 0) { rr(c, 30, 360, 100, 10, 5, 'rgba(0,0,0,.2)'); rr(c, 30, 360, a.power * 100, 10, 5, '#ff8a1f'); }
    if (a.arrow) { const r = a.arrow, an = Math.atan2(r.vy, r.vx); line(c, r.x - Math.cos(an) * 40, r.y - Math.sin(an) * 40, r.x, r.y, 3, '#5d4037'); }
    txt(c, `wind ${a.wind < 0 ? '←' : '→'} ${Math.abs(Math.round(a.wind / 3))}`, 300, 24, 15, '#37474f');
    if (a.pop) txt(c, a.pop.text, 470, a.pop.y - (1 - a.pop.t) * 30, 26, a.pop.text === 'Miss' ? '#e53935' : '#2e7d32');
  },
};

// ================================================================ Hoop Shot (basketball)
export const hoops = {
  w: 400, h: 600, how: 'Drag back from the ball and let go to throw, like a slingshot. Score as many baskets as you can in 60 seconds!',
  start(G) { G.b = { time: G.params.time || 60, drag: null, fx: [], pop: null }; this.reset(G); },
  reset(G) { G.b.ball = { x: rand(60, 200), y: rand(440, 520), vx: 0, vy: 0, fly: false, touched: false, scored: false }; },
  tap(G, x, y) { const b = G.b; if (!b.ball.fly && Math.hypot(x - b.ball.x, y - b.ball.y) < 90) b.drag = { x, y }; },
  release(G) {
    const b = G.b; if (!b.drag) return; const dx = b.drag.x - G.pointer.x, dy = b.drag.y - G.pointer.y; b.drag = null;
    if (Math.hypot(dx, dy) < 12) return;
    Object.assign(b.ball, { vx: clamp(dx * 4.6, -700, 700), vy: clamp(dy * 5.4, -1150, 200), fly: true }); G.sound('tick');
  },
  update(G, dt) {
    const b = G.b, ball = b.ball, R = 16, rim = [[290, 230], [350, 230]];
    b.time -= dt; G.status(`${Math.ceil(Math.max(0, b.time))}s`);
    if (b.time <= 0) return G.win(`${G.score} points`);
    if (b.pop) { b.pop.t -= dt; if (b.pop.t <= 0) b.pop = null; }
    stepSparks(b.fx, dt);
    if (!ball.fly) return;
    for (let s = 0; s < 3; s++) {
      const h = dt / 3, py = ball.y;
      ball.vy += 1300 * h; ball.x += ball.vx * h; ball.y += ball.vy * h;
      if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx) * 0.7; }
      if (ball.x > 360 - R && ball.y > 130 && ball.y < 250) { ball.x = 360 - R; ball.vx = -Math.abs(ball.vx) * 0.6; ball.touched = true; }
      if (ball.x > 400 - R) { ball.x = 400 - R; ball.vx = -Math.abs(ball.vx) * 0.7; }
      for (const [rx, ry] of rim) {
        const dx = ball.x - rx, dy = ball.y - ry, d = Math.hypot(dx, dy);
        if (d < R + 3 && d > 0) { const nx = dx / d, ny = dy / d, vn = ball.vx * nx + ball.vy * ny; ball.x = rx + nx * (R + 3); ball.y = ry + ny * (R + 3); if (vn < 0) { ball.vx -= 1.7 * vn * nx; ball.vy -= 1.7 * vn * ny; } ball.touched = true; }
      }
      if (!ball.scored && py < 230 && ball.y >= 230 && ball.vy > 0 && ball.x > 296 && ball.x < 344) {
        ball.scored = true; const pts = ball.touched ? 2 : 3; G.add(pts); G.sound('ok'); burst(b.fx, ball.x, 240, pick(PALETTE), 24, 160);
        b.pop = { t: 1, text: pts === 3 ? 'Swish! +3' : '+2' };
      }
    }
    if (ball.y > 650) this.reset(G);
  },
  draw(G, c) {
    const b = G.b, ball = b.ball;
    sky(c, 400, 600, '#ffcc80', '#ffe0b2'); rr(c, 0, 560, 400, 40, 0, '#a1887f');
    rr(c, 356, 130, 10, 120, 3, '#eceff1'); rr(c, 366, 230, 8, 330, 3, '#78909c');
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(294 + i * 13, 232); c.lineTo(300 + i * 10, 270); c.stroke(); }
    line(c, 288, 230, 352, 230, 5, '#ff5722');
    if (b.drag) { line(c, ball.x, ball.y, ball.x + (b.drag.x - G.pointer.x), ball.y + (b.drag.y - G.pointer.y), 3, 'rgba(0,0,0,.25)'); }
    emoji(c, '🏀', ball.x, ball.y, 34);
    drawSparks(c, b.fx);
    if (b.pop) txt(c, b.pop.text, 300, 180 - (1 - b.pop.t) * 30, 26, '#e65100');
    if (!ball.fly && !b.drag) txt(c, 'drag back & let go', ball.x + 30, ball.y + 40, 13, '#6d4c41', 'left');
  },
};

// ================================================================ Mini Golf
const HOLES = [
  { s: [240, 480], h: [240, 90], par: 2, walls: [] },
  { s: [100, 480], h: [380, 100], par: 3, walls: [[0, 260, 330, 24]] },
  { s: [80, 480], h: [400, 480], par: 3, walls: [[200, 170, 24, 390]] },
  { s: [240, 500], h: [240, 70], par: 3, walls: [[120, 300, 240, 24], [0, 160, 180, 24], [300, 160, 180, 24]] },
  { s: [60, 80], h: [420, 480], par: 4, walls: [[0, 180, 360, 24], [120, 360, 360, 24]] },
  { s: [240, 280], h: [240, 110], par: 3, walls: [[160, 180, 160, 24], [160, 180, 24, 150], [296, 180, 24, 150]] },
];
export const golf = {
  w: 480, h: 560, lowerIsBetter: true,
  how: 'Drag back from the ball and let go to putt (or use ← → to aim and hold Space for power). Fewest strokes wins. 6 holes.',
  start(G) { G.gf = { hole: -1, strokes: 0, fx: [] }; this.next(G); },
  next(G) {
    const g = G.gf; g.hole++;
    if (g.hole >= HOLES.length) return G.win(`${g.strokes} strokes`);
    const H = HOLES[g.hole]; Object.assign(g, { b: { x: H.s[0], y: H.s[1], vx: 0, vy: 0 }, H, here: 0, aim: -Math.PI / 2, power: 0, drag: null, sink: 0 });
    G.status(`hole ${g.hole + 1}/6 · par ${H.par}`);
  },
  still: g => Math.hypot(g.b.vx, g.b.vy) < 1,
  putt(G, vx, vy) { const g = G.gf; Object.assign(g.b, { vx, vy }); g.strokes++; g.here++; G.setScore(g.strokes); G.sound('tick'); },
  tap(G, x, y) { const g = G.gf; if (this.still(g) && !g.sink && Math.hypot(x - g.b.x, y - g.b.y) < 70) g.drag = true; },
  release(G) {
    const g = G.gf; if (!g.drag) return; g.drag = false;
    const dx = g.b.x - G.pointer.x, dy = g.b.y - G.pointer.y, d = Math.hypot(dx, dy); if (d < 8) return;
    const s = Math.min(d * 4, 680) / d; this.putt(G, dx * s, dy * s);
  },
  update(G, dt) {
    const g = G.gf, b = g.b, R = 8; stepSparks(g.fx, dt);
    if (g.sink) { g.sink -= dt; if (g.sink <= 0) this.next(G); return; }
    if (this.still(g)) {
      if (G.keys.has('ArrowLeft')) g.aim -= 2 * dt; if (G.keys.has('ArrowRight')) g.aim += 2 * dt;
      if (G.keys.has(' ')) g.power = Math.min(1, g.power + dt * 0.8);
      else if (g.power > 0) { this.putt(G, Math.cos(g.aim) * g.power * 680, Math.sin(g.aim) * g.power * 680); g.power = 0; }
    }
    for (let s = 0; s < 4; s++) {
      const h = dt / 4; b.x += b.vx * h; b.y += b.vy * h;
      if (b.x < R + 10) { b.x = R + 10; b.vx = Math.abs(b.vx) * 0.8; } if (b.x > 470 - R) { b.x = 470 - R; b.vx = -Math.abs(b.vx) * 0.8; }
      if (b.y < R + 10) { b.y = R + 10; b.vy = Math.abs(b.vy) * 0.8; } if (b.y > 550 - R) { b.y = 550 - R; b.vy = -Math.abs(b.vy) * 0.8; }
      for (const [x, y, w, hh] of g.H.walls) {
        const cx = clamp(b.x, x, x + w), cy = clamp(b.y, y, y + hh), dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
        if (d < R && d > 0) { const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny; b.x = cx + nx * R; b.y = cy + ny * R; if (vn < 0) { b.vx = (b.vx - 2 * vn * nx) * 0.8; b.vy = (b.vy - 2 * vn * ny) * 0.8; } }
      }
    }
    const f = Math.pow(0.32, dt); b.vx *= f; b.vy *= f;
    if (Math.hypot(b.vx, b.vy) < 9) { b.vx = b.vy = 0; }
    const hd = Math.hypot(b.x - g.H.h[0], b.y - g.H.h[1]);
    if (hd < 12 && Math.hypot(b.vx, b.vy) < 430) { b.vx = b.vy = 0; b.x = g.H.h[0]; b.y = g.H.h[1]; g.sink = 1.2; G.sound('ok'); burst(g.fx, b.x, b.y, '#fff', 24, 120); }
  },
  draw(G, c) {
    const g = G.gf, b = g.b;
    rr(c, 0, 0, 480, 560, 0, '#5d4037'); rr(c, 10, 10, 460, 540, 18, '#4caf50');
    c.fillStyle = 'rgba(255,255,255,.05)'; for (let y = 10; y < 550; y += 40) c.fillRect(10, y, 460, 20);
    for (const [x, y, w, h] of g.H.walls) rr(c, x, y, w, h, 6, '#8d6e63');
    dot(c, g.H.h[0], g.H.h[1], 12, '#1b1b1b'); line(c, g.H.h[0], g.H.h[1], g.H.h[0], g.H.h[1] - 46, 2, '#eee'); poly(c, [[g.H.h[0], g.H.h[1] - 46], [g.H.h[0] + 22, g.H.h[1] - 39], [g.H.h[0], g.H.h[1] - 32]], '#ff5252');
    if (g.drag) line(c, b.x, b.y, b.x + (b.x - G.pointer.x), b.y + (b.y - G.pointer.y), 3, 'rgba(255,255,255,.6)');
    if (this.still(g) && !g.sink && !g.drag && (G.keys.size || g.power)) line(c, b.x, b.y, b.x + Math.cos(g.aim) * (30 + g.power * 60), b.y + Math.sin(g.aim) * (30 + g.power * 60), 3, '#fff');
    if (!g.sink) { dot(c, b.x + 2, b.y + 3, 8, 'rgba(0,0,0,.25)'); dot(c, b.x, b.y, 8, '#fff'); }
    drawSparks(c, g.fx);
    if (g.sink) txt(c, g.here <= 1 ? 'Hole in one!' : g.here < g.H.par ? 'Birdie!' : g.here === g.H.par ? 'Par!' : 'In the hole!', 240, 280, 32, '#fff');
  },
};

// ================================================================ Air Hockey
export const hockey = {
  w: 360, h: 600, how: 'Move your mallet (bottom half) with the mouse or arrow keys. Hit the puck into the top goal. First to 7 wins!',
  start(G) { G.k = { me: { x: 180, y: 520, px: 180, py: 520 }, cpu: { x: 180, y: 80, px: 180, py: 80 }, p: { x: 180, y: 300, vx: 0, vy: 0 }, a: 0, b: 0, wait: 0.8, fx: [] }; },
  move(G) { G.k.mouse = true; },
  serve(G, toMe) { Object.assign(G.k.p, { x: 180, y: toMe ? 360 : 240, vx: 0, vy: 0 }); G.k.wait = 0.8; },
  update(G, dt) {
    const k = G.k, me = k.me, cpu = k.cpu, p = k.p, skill = G.params.skill || 0.6;
    me.px = me.x; me.py = me.y; cpu.px = cpu.x; cpu.py = cpu.y;
    if (G.keys.size) { k.mouse = false; me.x += ((G.keys.has('ArrowRight') ? 1 : 0) - (G.keys.has('ArrowLeft') ? 1 : 0)) * 380 * dt; me.y += ((G.keys.has('ArrowDown') ? 1 : 0) - (G.keys.has('ArrowUp') ? 1 : 0)) * 380 * dt; }
    else if (k.mouse) { me.x += clamp(G.pointer.x - me.x, -900 * dt, 900 * dt); me.y += clamp(G.pointer.y - me.y, -900 * dt, 900 * dt); }
    me.x = clamp(me.x, 26, 334); me.y = clamp(me.y, 326, 574);
    const attack = p.y < 300, tx = attack ? p.x : 180 + (p.x - 180) * 0.4, ty = attack ? Math.max(40, p.y - 26) : 80, sp = 220 + skill * 280;
    cpu.x = clamp(cpu.x + clamp(tx - cpu.x, -sp * dt, sp * dt), 26, 334); cpu.y = clamp(cpu.y + clamp(ty - cpu.y, -sp * dt, sp * dt), 26, 274);
    stepSparks(k.fx, dt, 0);
    if (k.wait > 0) { k.wait -= dt; return; }
    for (let s = 0; s < 4; s++) {
      const h = dt / 4; p.x += p.vx * h; p.y += p.vy * h;
      if (p.x < 16) { p.x = 16; p.vx = Math.abs(p.vx); G.sound('tick'); } if (p.x > 344) { p.x = 344; p.vx = -Math.abs(p.vx); G.sound('tick'); }
      const inGoal = Math.abs(p.x - 180) < 58;
      if (p.y < 16) { if (inGoal) { k.a++; G.add(1); G.sound('ok'); burst(k.fx, p.x, 10, '#ffd23f', 30, 180); if (k.a >= 7) return G.win(`${k.a} – ${k.b}`); return this.serve(G, false); } p.y = 16; p.vy = Math.abs(p.vy); }
      if (p.y > 584) { if (inGoal) { k.b++; G.sound('error'); if (k.b >= 7) return G.lose(`${k.a} – ${k.b}`); return this.serve(G, true); } p.y = 584; p.vy = -Math.abs(p.vy); }
      for (const m of [me, cpu]) {
        const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
        if (d < 42 && d > 0) {
          const nx = dx / d, ny = dy / d, mvx = clamp((m.x - m.px) / dt, -1400, 1400), mvy = clamp((m.y - m.py) / dt, -1400, 1400);
          p.x = m.x + nx * 42; p.y = m.y + ny * 42;
          const rel = (p.vx - mvx) * nx + (p.vy - mvy) * ny; if (rel < 0) { p.vx -= 1.9 * rel * nx; p.vy -= 1.9 * rel * ny; G.sound('tick'); }
        }
      }
    }
    const sp2 = Math.hypot(p.vx, p.vy); if (sp2 > 950) { p.vx *= 950 / sp2; p.vy *= 950 / sp2; }
    const f = Math.pow(0.75, dt); p.vx *= f; p.vy *= f;
    G.status(`${k.a} – ${k.b}`);
  },
  draw(G, c) {
    const k = G.k;
    rr(c, 0, 0, 360, 600, 0, '#e3f2fd'); line(c, 0, 300, 360, 300, 3, '#ef9a9a');
    c.beginPath(); c.arc(180, 300, 50, 0, TAU); c.strokeStyle = '#ef9a9a'; c.lineWidth = 3; c.stroke();
    rr(c, 122, 0, 116, 8, 4, '#263238'); rr(c, 122, 592, 116, 8, 4, '#263238');
    dot(c, k.p.x, k.p.y, 16, '#263238'); dot(c, k.p.x, k.p.y, 10, '#455a64');
    for (const [m, col] of [[k.me, '#ff8a1f'], [k.cpu, '#2f80ed']]) { dot(c, m.x, m.y, 26, col); dot(c, m.x, m.y, 13, 'rgba(255,255,255,.5)'); }
    drawSparks(c, k.fx);
    txt(c, String(k.b), 30, 270, 28, 'rgba(47,128,237,.5)'); txt(c, String(k.a), 30, 330, 28, 'rgba(255,138,31,.6)');
  },
};

// ================================================================ Cannon Duel
export const cannon = {
  w: 640, h: 400, how: 'Aim with ↑ ↓ or the mouse. Hold Space or the mouse button for power, let go to fire. Hit the other cannon 3 times!',
  start(G) {
    const peak = rand(260, 380), hgt = rand(100, 190), hill = [];
    for (let x = 0; x <= 640; x += 16) hill.push(340 - Math.max(0, hgt * Math.cos(clamp((x - peak) / 190, -Math.PI / 2, Math.PI / 2))) + Math.sin(x / 23) * 4);
    G.cn = { hill, me: { x: 60, ang: -0.8, hits: 0 }, cpu: { x: 580, hits: 0, err: 0.35 / (G.params.skill || 1) }, turn: 'me', power: 0, shell: null, wind: rand(-30, 30), fx: [], wait: 0 };
  },
  gy(c, x) { const i = clamp(Math.floor(x / 16), 0, c.hill.length - 2), t = (x - i * 16) / 16; return c.hill[i] + (c.hill[i + 1] - c.hill[i]) * t; },
  move(G, x, y) { const c = G.cn; c.me.ang = clamp(Math.atan2(y - this.gy(c, 60), x - 60), -1.5, -0.05); },
  fire(G, x, ang, power) { const c = G.cn, v = 220 + power * 380; c.shell = { x, y: this.gy(c, x) - 18, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v }; G.sound('drop'); },
  release(G) { const c = G.cn; if (c.turn === 'me' && !c.shell && c.power > 0.05) { this.fire(G, 60, c.me.ang, c.power); c.power = 0; } },
  sim(c, x, ang, power) {   // where would this shot land? (for the computer's aim)
    const v = 220 + power * 380; let px = x, py = this.gy(c, x) - 18, vx = Math.cos(ang) * v, vy = Math.sin(ang) * v;
    for (let i = 0; i < 600; i++) { vy += 300 * 0.02; vx += c.wind * 0.02; px += vx * 0.02; py += vy * 0.02; if (px < 0 || px > 640 || py >= this.gy(c, px)) return px; }
    return px;
  },
  update(G, dt) {
    const c = G.cn; stepSparks(c.fx, dt);
    if (c.turn === 'me' && !c.shell) {
      if (G.keys.has('ArrowUp')) c.me.ang = Math.max(-1.5, c.me.ang - dt); if (G.keys.has('ArrowDown')) c.me.ang = Math.min(-0.05, c.me.ang + dt);
      if (G.pointer.down || G.keys.has(' ')) c.power = Math.min(1, c.power + dt * 0.7);
      if (c.space && !G.keys.has(' ') && c.power > 0.05) { this.fire(G, 60, c.me.ang, c.power); c.power = 0; }
      c.space = G.keys.has(' ');
    }
    if (c.turn === 'cpu' && !c.shell) {
      c.wait -= dt;
      if (c.wait <= 0) {
        let best = null;
        for (const ang of [-2.36, -2.1, -1.85]) for (let p = 0.2; p <= 1; p += 0.02) { const land = this.sim(c, 580, ang, p); const d = Math.abs(land - 60); if (!best || d < best.d) best = { d, ang, p }; }
        const p = clamp(best.p + rand(-c.err, c.err) * 0.4, 0.1, 1); c.err *= 0.7; this.fire(G, 580, best.ang, p);
      }
    }
    const s = c.shell; if (!s) return;
    s.vy += 300 * dt; s.vx += c.wind * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    const target = c.turn === 'me' ? c.cpu : c.me;
    if (Math.hypot(s.x - target.x, s.y - (this.gy(c, target.x) - 12)) < 24) {
      target.hits++; burst(c.fx, s.x, s.y, '#ff7043', 40, 220); G.sound(c.turn === 'me' ? 'ok' : 'error'); if (c.turn === 'me') G.add(100);
      if (c.cpu.hits >= 3) return G.win('You won the duel!');
      if (c.me.hits >= 3) return G.lose('The other cannon won');
      return this.swap(G);
    }
    if (s.x < -20 || s.x > 660 || s.y >= this.gy(c, s.x)) { burst(c.fx, s.x, Math.min(s.y, 400), '#a1887f', 16, 120); this.swap(G); }
  },
  swap(G) { const c = G.cn; c.shell = null; c.turn = c.turn === 'me' ? 'cpu' : 'me'; c.wait = 0.9; c.wind = rand(-30, 30); G.status(c.turn === 'me' ? 'your turn' : 'computer\'s turn'); },
  draw(G, c) {
    const C = G.cn;
    sky(c, 640, 400, '#90caf9', '#e3f2fd');
    poly(c, [[0, 400], ...C.hill.map((y, i) => [i * 16, y]), [640, 400]], '#7cb342');
    for (const [p, col, ang] of [[C.me, '#ff8a1f', C.me.ang], [C.cpu, '#2f80ed', C.shell && C.turn === 'cpu' ? -2.1 : -2.36]]) {
      const y = this.gy(C, p.x); line(c, p.x, y - 14, p.x + Math.cos(ang) * 30, y - 14 + Math.sin(ang) * 30, 8, '#37474f');
      rr(c, p.x - 18, y - 20, 36, 18, 8, col); dot(c, p.x - 10, y - 2, 6, '#424242'); dot(c, p.x + 10, y - 2, 6, '#424242');
      for (let i = 0; i < 3 - p.hits; i++) emoji(c, '❤️', p.x - 16 + i * 16, y - 40, 12);
    }
    if (C.shell) dot(c, C.shell.x, C.shell.y, 6, '#212121');
    drawSparks(c, C.fx);
    if (C.power > 0) { rr(c, 20, 20, 120, 12, 6, 'rgba(0,0,0,.2)'); rr(c, 20, 20, C.power * 120, 12, 6, '#ff5722'); }
    txt(c, `wind ${C.wind < 0 ? '←' : '→'} ${Math.abs(Math.round(C.wind / 3))}`, 320, 24, 15, '#37474f');
    txt(c, C.turn === 'me' ? 'Your turn' : 'Computer…', 320, 48, 14, C.turn === 'me' ? '#e65100' : '#1565c0');
  },
};

// ================================================================ Bowling
const PINS = [[180, 110], [163, 140], [197, 140], [146, 170], [180, 170], [214, 170], [129, 200], [163, 200], [197, 200], [231, 200]];
export const bowling = {
  w: 360, h: 600, how: 'Press Space or tap to stop the aim arrow, then again to set the power. Knock down all 10 pins! 5 frames.',
  start(G) { G.bw = { frame: 1, roll: 1, fx: [] }; this.rack(G); },
  rack(G) { const b = G.bw; b.pins = PINS.map(([x, y]) => ({ x, y, ox: x, oy: y, vx: 0, vy: 0, down: false })); this.ready(G); },
  ready(G) { Object.assign(G.bw, { phase: 'aim', t: 0, ball: { x: 180, y: 540, vx: 0, vy: 0 }, timer: 0 }); G.status(`frame ${G.bw.frame}/5 · roll ${G.bw.roll}`); },
  act(G) {
    const b = G.bw;
    if (b.phase === 'aim') { b.aim = Math.sin(b.t * 2.2) * 0.32; b.phase = 'power'; b.t = 0; }
    else if (b.phase === 'power') { const p = 0.5 + 0.5 * Math.abs(Math.sin(b.t * 2.6)); b.ball.vx = Math.sin(b.aim) * 520 * p; b.ball.vy = -Math.cos(b.aim) * 520 * p - 120; b.phase = 'roll'; G.sound('drop'); }
  },
  tap(G) { this.act(G); }, key(G, k) { if (k === ' ') this.act(G); },
  update(G, dt) {
    const b = G.bw; b.t += dt; stepSparks(b.fx, dt, 0);
    if (b.phase !== 'roll') return;
    const ball = b.ball;
    for (let s = 0; s < 3; s++) {
      const h = dt / 3; ball.x += ball.vx * h; ball.y += ball.vy * h;
      if (ball.x < 56 || ball.x > 304) ball.vx = 0;
      for (const p of b.pins) {
        p.x += p.vx * h; p.y += p.vy * h;
        const dx = p.x - ball.x, dy = p.y - ball.y, d = Math.hypot(dx, dy);
        if (d < 24 && d > 0 && ball.x > 56 && ball.x < 304) { const nx = dx / d, ny = dy / d; p.x = ball.x + nx * 24; p.y = ball.y + ny * 24; const rel = (ball.vx - p.vx) * nx + (ball.vy - p.vy) * ny; if (rel > 0) { p.vx += 1.6 * rel * nx; p.vy += 1.6 * rel * ny; ball.vx -= 0.25 * rel * nx; ball.vy -= 0.25 * rel * ny; } if (!p.hit) { p.hit = true; G.sound('tick'); } }
        for (const q of b.pins) if (q !== p) { const ex = q.x - p.x, ey = q.y - p.y, e = Math.hypot(ex, ey); if (e < 18 && e > 0) { const nx = ex / e, ny = ey / e, rel = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny; q.x = p.x + nx * 18; q.y = p.y + ny * 18; if (rel > 0) { q.vx += rel * nx * 0.9; q.vy += rel * ny * 0.9; p.vx -= rel * nx * 0.4; p.vy -= rel * ny * 0.4; } } }
      }
    }
    for (const p of b.pins) { const f = Math.pow(0.15, dt); p.vx *= f; p.vy *= f; }
    b.timer += dt;
    if (ball.y < -30 || b.timer > 4) {
      let n = 0;
      for (const p of b.pins) if (!p.down && (Math.hypot(p.x - p.ox, p.y - p.oy) > 7 || p.x < 60 || p.x > 300)) { p.down = true; n++; }
      const standing = b.pins.filter(p => !p.down).length;
      G.add(n + (standing === 0 ? (b.roll === 1 ? 10 : 5) : 0));
      if (n) G.sound(standing ? 'pop' : 'ok');
      if (!standing) burst(b.fx, 180, 160, pick(PALETTE), 40, 200);
      b.msg = { t: 1.2, text: !standing ? (b.roll === 1 ? 'STRIKE!' : 'Spare!') : `${n} pin${n === 1 ? '' : 's'}` };
      if (b.roll === 1 && standing) { b.roll = 2; b.pins.forEach(p => { p.vx = p.vy = 0; }); b.pins = b.pins.filter(p => !p.down); return this.ready(G); }
      b.roll = 1; b.frame++;
      if (b.frame > 5) return G.win(`${G.score} points`);
      this.rack(G);
    }
  },
  draw(G, c) {
    const b = G.bw;
    rr(c, 0, 0, 360, 600, 0, '#3e2723'); rr(c, 40, 0, 280, 600, 0, '#455a64'); rr(c, 56, 0, 248, 600, 0, '#ffcc80');
    c.fillStyle = 'rgba(141,110,99,.25)'; for (let x = 70; x < 304; x += 18) c.fillRect(x, 0, 2, 600);
    for (let i = 0; i < 7; i++) poly(c, [[110 + i * 23, 420], [104 + i * 23, 432], [116 + i * 23, 432]], '#8d6e63');
    for (const p of b.pins) if (!p.down || Math.hypot(p.vx, p.vy) > 5) { dot(c, p.x, p.y, 9, '#fafafa'); dot(c, p.x, p.y - 3, 3, '#e53935'); }
    if (b.phase === 'aim') { const a = Math.sin(b.t * 2.2) * 0.32; line(c, 180, 520, 180 + Math.sin(a) * 90, 520 - Math.cos(a) * 90, 5, '#ff5722'); }
    if (b.phase === 'power') { const p = 0.5 + 0.5 * Math.abs(Math.sin(b.t * 2.6)); rr(c, 330, 380, 14, 160, 7, 'rgba(0,0,0,.3)'); rr(c, 330, 380 + 160 * (1 - p), 14, 160 * p, 7, '#ff5722'); }
    dot(c, b.ball.x, b.ball.y, 15, '#5e35b1'); dot(c, b.ball.x - 4, b.ball.y - 5, 3, '#311b92'); dot(c, b.ball.x + 3, b.ball.y - 6, 3, '#311b92');
    drawSparks(c, b.fx);
    if (b.msg && b.msg.t > 0) { b.msg.t -= 1 / 60; txt(c, b.msg.text, 180, 300, 34, '#bf360c'); }
  },
};

// ================================================================ Penalty Kick
export const penalty = {
  w: 480, h: 560, how: 'Tap a spot inside the goal to shoot there (or press Space when the target is where you want). Beat the goalkeeper! 10 kicks.',
  start(G) { G.pk = { kicks: 0, goals: 0, fx: [] }; this.ready(G); },
  ready(G) { Object.assign(G.pk, { phase: 'aim', t: 0, ball: { x: 240, y: 470, s: 1 }, keeper: { x: 240, y: 205, tx: 240, ty: 205 }, shot: null, msg: null }); G.status(`kick ${G.pk.kicks + 1}/10`); },
  reticle(t) { return [240 + Math.sin(t * 1.9) * 140, 160 + Math.sin(t * 3.1) * 55]; },
  shoot(G, x, y) {
    const k = G.pk; if (k.phase !== 'aim') return;
    x = clamp(x, 92, 388); y = clamp(y, 102, 244); k.shot = { x, y, t: 0 }; k.phase = 'fly'; G.sound('drop');
    const smart = G.params.skill || 0.45, guess = Math.random() < smart ? x : pick([140, 240, 340]);
    k.keeper.tx = clamp(guess, 120, 360); k.keeper.ty = Math.random() < smart ? clamp(y, 150, 215) : rand(160, 215);
  },
  tap(G, x, y) { if (y < 280) this.shoot(G, x, y); else this.shoot(G, ...this.reticle(G.pk.t)); },
  key(G, k) { if (k === ' ') this.shoot(G, ...this.reticle(G.pk.t)); },
  update(G, dt) {
    const k = G.pk; k.t += dt; stepSparks(k.fx, dt);
    if (k.phase === 'fly') {
      const s = k.shot; s.t += dt / 0.55; const e = Math.min(1, s.t);
      k.ball.x = 240 + (s.x - 240) * e; k.ball.y = 470 + (s.y - 470) * e - Math.sin(e * Math.PI) * 40; k.ball.s = 1 - e * 0.45;
      const kp = k.keeper, ke = Math.min(1, s.t * 1.25); kp.x = 240 + (kp.tx - 240) * ke; kp.y = 205 + (kp.ty - 205) * ke;
      if (s.t >= 1) {
        const saved = Math.abs(s.x - kp.x) < 52 && Math.abs(s.y - kp.y) < 50;
        k.kicks++; if (!saved) { k.goals++; G.add(10); G.sound('ok'); burst(k.fx, s.x, s.y, pick(PALETTE), 30, 180); } else G.sound('error');
        k.msg = saved ? 'Saved!' : 'GOAL!'; k.phase = 'done'; k.t = 0;
      }
    } else if (k.phase === 'done' && k.t > 1.2) {
      if (k.kicks >= 10) return k.goals >= 5 ? G.win(`${k.goals} goals out of 10`) : G.lose(`${k.goals} goals out of 10`);
      this.ready(G);
    }
  },
  draw(G, c) {
    const k = G.pk;
    sky(c, 480, 560, '#4fc3f7', '#b3e5fc'); grass(c, 480, 560, 250);
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1; for (let x = 92; x <= 388; x += 16) { c.beginPath(); c.moveTo(x, 100); c.lineTo(x, 250); c.stroke(); } for (let y = 100; y <= 250; y += 16) { c.beginPath(); c.moveTo(92, y); c.lineTo(388, y); c.stroke(); }
    line(c, 88, 250, 88, 96, 8, '#fff'); line(c, 392, 250, 392, 96, 8, '#fff'); line(c, 84, 96, 396, 96, 8, '#fff');
    c.save(); c.translate(k.keeper.x, k.keeper.y); c.rotate((k.keeper.x - 240) / 300); rr(c, -20, -40, 40, 70, 12, '#ff7043'); dot(c, 0, -52, 14, '#ffcc80'); emoji(c, '🧤', -34, -30, 22); emoji(c, '🧤', 34, -30, 22); c.restore();
    if (k.phase === 'aim') { const [x, y] = this.reticle(k.t); c.beginPath(); c.arc(x, y, 16, 0, TAU); c.strokeStyle = '#ff1744'; c.lineWidth = 3; c.stroke(); dot(c, x, y, 3, '#ff1744'); }
    emoji(c, '⚽', k.ball.x, k.ball.y, 36 * k.ball.s);
    drawSparks(c, k.fx);
    if (k.msg) txt(c, k.msg, 240, 330, 44, k.msg === 'GOAL!' ? '#ffeb3b' : '#fff');
    for (let i = 0; i < 10; i++) dot(c, 150 + i * 20, 540, 6, i < k.kicks ? (i < k.goals ? '#ffd23f' : 'rgba(0,0,0,.25)') : 'rgba(255,255,255,.5)');
  },
};

// ================================================================ Keepy Uppy
export const keepy = {
  w: 360, h: 600, how: 'Tap (or click) the ball to kick it back up. Don\'t let it touch the ground! (Space kicks when it is low.)',
  start(G) { G.ky = { x: 180, y: 180, vx: rand(-40, 40), vy: 0, rot: 0, fx: [] }; },
  kick(G, x, y) { const k = G.ky; k.vy = -560; k.vx = clamp((k.x - x) * 9, -280, 280); G.add(1); G.sound('pop'); burst(k.fx, x, y, '#fff', 8, 90); },
  tap(G, x, y) { const k = G.ky; if (Math.hypot(x - k.x, y - k.y) < 64) this.kick(G, x, y); },
  key(G, k) { const b = G.ky; if (k === ' ' && b.y > 360) this.kick(G, b.x + rand(-20, 20), b.y + 10); },
  update(G, dt) {
    const k = G.ky; stepSparks(k.fx, dt);
    k.vy += (G.params.gravity || 900) * (1 + G.score * 0.008) * dt; k.x += k.vx * dt; k.y += k.vy * dt; k.rot += k.vx * dt * 0.03;
    if (k.x < 26 || k.x > 334) { k.vx *= -0.9; k.x = clamp(k.x, 26, 334); }
    if (k.y < 26) { k.y = 26; k.vy = Math.abs(k.vy); }
    if (k.y > 556) return G.lose(`${G.score} kicks`);
  },
  draw(G, c) {
    const k = G.ky;
    sky(c, 360, 600, '#81d4fa', '#e1f5fe'); grass(c, 360, 600, 570);
    c.globalAlpha = 0.25; c.beginPath(); c.ellipse(k.x, 574, 26 * (0.4 + k.y / 1000), 6, 0, 0, TAU); c.fillStyle = '#000'; c.fill(); c.globalAlpha = 1;
    c.save(); c.translate(k.x, k.y); c.rotate(k.rot); emoji(c, G.params.ball || '⚽', 0, 0, 52); c.restore();
    drawSparks(c, k.fx);
    if (!G.score) txt(c, 'Tap the ball!', 180, 300, 22, '#01579b');
  },
};

// ================================================================ Fruit Slice
const segDist = (px, py, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1, t = clamp(((px - a.x) * dx + (py - a.y) * dy) / l, 0, 1); return Math.hypot(px - a.x - t * dx, py - a.y - t * dy); };
export const slice = {
  w: 600, h: 420, how: 'Hold the mouse button (or your finger) and swipe across the fruit to slice it. Don\'t slice the bombs! 60 seconds.',
  start(G) { G.sl = { items: [], halves: [], trail: [], fx: [], t: 0.6, time: 60 }; },
  tap(G, x, y) { G.sl.trail = [{ x, y, t: 0.2 }]; },
  move(G, x, y) { const s = G.sl; if (!G.pointer.down) return; s.trail.push({ x, y, t: 0.2 }); const n = s.trail.length; if (n > 1) this.cut(G, s.trail[n - 2], s.trail[n - 1]); },
  cut(G, a, b) {
    const s = G.sl;
    for (const it of s.items) if (!it.cut && segDist(it.x, it.y, a, b) < it.r) {
      it.cut = true;
      if (it.bomb) { burst(s.fx, it.x, it.y, '#ff7043', 40, 240); G.sound('error'); G.lives--; if (G.lives <= 0) return G.lose('Boom!'); continue; }
      G.add(1); G.sound('pop'); burst(s.fx, it.x, it.y, it.juice, 14, 160);
      for (const side of [-1, 1]) s.halves.push({ x: it.x, y: it.y, vx: it.vx + side * 90, vy: it.vy - 60, e: it.e, side, rot: 0, t: 1.2 });
    }
  },
  update(G, dt) {
    const s = G.sl; s.time -= dt; s.t -= dt; G.status(`${Math.ceil(Math.max(0, s.time))}s`);
    if (s.time <= 0) return G.win(`${G.score} fruit sliced`);
    if (s.t <= 0) {
      s.t = rand(0.6, 1.3);
      for (let i = 0; i < rand(1, 3.5); i++) {
        const bomb = !G.params.zen && Math.random() < 0.16, x = rand(100, 500), [e, juice] = pick([['🍉', '#e53935'], ['🍊', '#ff9800'], ['🍎', '#e53935'], ['🍍', '#fdd835'], ['🥝', '#8bc34a'], ['🍋', '#ffeb3b'], ['🍑', '#ffab91'], ['🥥', '#efebe9']]);
        s.items.push({ x, y: 450, vx: (300 - x) * rand(0.3, 0.7), vy: rand(-640, -540), r: 28, e: bomb ? '💣' : e, juice, bomb, rot: 0, spin: rand(-3, 3) });
      }
    }
    for (const it of s.items) { it.vy += 600 * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.spin * dt; }
    for (const hf of s.halves) { hf.vy += 600 * dt; hf.x += hf.vx * dt; hf.y += hf.vy * dt; hf.rot += hf.side * 3 * dt; hf.t -= dt; }
    s.items = s.items.filter(it => !it.cut && it.y < 470); s.halves = s.halves.filter(hf => hf.t > 0);
    for (const p of s.trail) p.t -= dt; s.trail = s.trail.filter(p => p.t > 0);
    stepSparks(s.fx, dt);
  },
  draw(G, c) {
    const s = G.sl;
    sky(c, 600, 420, '#5d4037', '#3e2723'); c.fillStyle = 'rgba(255,255,255,.04)'; for (let x = 0; x < 600; x += 60) c.fillRect(x, 0, 30, 420);
    for (const it of s.items) { c.save(); c.translate(it.x, it.y); c.rotate(it.rot); emoji(c, it.e, 0, 0, 56); c.restore(); }
    for (const hf of s.halves) { c.save(); c.translate(hf.x, hf.y); c.rotate(hf.rot); c.beginPath(); c.rect(hf.side < 0 ? -30 : 0, -30, 30, 60); c.clip(); emoji(c, hf.e, 0, 0, 56); c.restore(); }
    drawSparks(c, s.fx);
    if (s.trail.length > 1) { c.beginPath(); s.trail.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 5; c.lineCap = c.lineJoin = 'round'; c.stroke(); }
    hearts(c, G.lives, 18, 20);
  },
};

// ================================================================ Fishing Fun
const CATCH = [['🐟', 10], ['🐠', 20], ['🐡', 30], ['🦑', 40], ['👢', 0], ['🐙', 35]];
export const fishing = {
  w: 600, h: 420, how: 'Move the boat with ← → or the mouse. Press Space or tap to drop the hook. Catch fish, not boots! 60 seconds.',
  start(G) { G.fi = { x: 300, hook: null, fish: [], time: 60, fx: [], pop: null }; for (let i = 0; i < 7; i++) this.spawn(G, true); },
  spawn(G, anywhere) { const left = Math.random() < 0.5, [e, pts] = pick(CATCH); G.fi.fish.push({ x: anywhere ? rand(40, 560) : left ? -30 : 630, y: rand(180, 390), vx: (left ? 1 : -1) * rand(30, 90), e, pts }); },
  move(G) { G.fi.mouse = true; },
  drop(G) { const f = G.fi; if (!f.hook) { f.hook = { x: f.x + 24, y: 112, dir: 1, got: null }; G.sound('drop'); } },
  tap(G) { this.drop(G); }, key(G, k) { if (k === ' ' || k === 'ArrowDown') this.drop(G); },
  update(G, dt) {
    const f = G.fi; f.time -= dt; G.status(`${Math.ceil(Math.max(0, f.time))}s`);
    if (f.time <= 0) return G.win(`${G.score} points`);
    if (!f.hook) {
      if (G.keys.has('ArrowLeft')) { f.x -= 240 * dt; f.mouse = false; } if (G.keys.has('ArrowRight')) { f.x += 240 * dt; f.mouse = false; }
      if (f.mouse) f.x += clamp(G.pointer.x - 24 - f.x, -260 * dt, 260 * dt);
      f.x = clamp(f.x, 0, 550);
    }
    for (const o of f.fish) { o.x += o.vx * dt; if (o.x < -40 || o.x > 640) o.gone = true; }
    const hk = f.hook;
    if (hk) {
      hk.y += (hk.dir > 0 ? 270 : -230) * dt;
      if (hk.dir > 0) { const o = f.fish.find(o => !o.gone && Math.abs(o.x - hk.x) < 22 && Math.abs(o.y - hk.y) < 18); if (o) { o.gone = true; hk.got = o; hk.dir = -1; G.sound('pop'); } else if (hk.y > 400) hk.dir = -1; }
      else if (hk.y <= 112) { if (hk.got) { G.add(hk.got.pts); G.sound(hk.got.pts ? 'ok' : 'error'); f.pop = { t: 1, text: hk.got.pts ? `+${hk.got.pts}` : 'A boot!', x: hk.x }; } f.hook = null; }
    }
    f.fish = f.fish.filter(o => !o.gone); while (f.fish.length < 7) this.spawn(G, false);
    if (f.pop) { f.pop.t -= dt; if (f.pop.t <= 0) f.pop = null; }
  },
  draw(G, c) {
    const f = G.fi;
    this.bg ||= cached(600, 420, g => {
      let gr = g.createLinearGradient(0, 0, 0, 120); gr.addColorStop(0, '#ffb74d'); gr.addColorStop(1, '#ffe0b2'); g.fillStyle = gr; g.fillRect(0, 0, 600, 120);
      gr = g.createLinearGradient(0, 120, 0, 420); gr.addColorStop(0, '#4fc3f7'); gr.addColorStop(1, '#01579b'); g.fillStyle = gr; g.fillRect(0, 120, 600, 300);
      g.fillStyle = '#ffd54f'; g.beginPath(); g.arc(500, 60, 30, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c8a26b'; g.fillRect(0, 404, 600, 16);
      g.font = '28px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ['🪸', '🌿', '🪨', '🌿', '🪸'].forEach((e, i) => g.fillText(e, 40 + i * 125, 404));
    });
    c.drawImage(this.bg, 0, 0);
    for (const o of f.fish) { c.save(); c.translate(o.x, o.y); if (o.vx > 0) c.scale(-1, 1); emoji(c, o.e, 0, 0, 32); c.restore(); }
    const hx = f.hook ? f.hook.x : f.x + 24, hy = f.hook ? f.hook.y : 112;
    line(c, f.x + 24, 92, hx, hy, 1.5, '#37474f');
    if (f.hook?.got) emoji(c, f.hook.got.e, hx, hy + 10, 30); else emoji(c, '🪝', hx, hy + 6, 18);
    emoji(c, '🚣', f.x + 24, 104, 48);
    if (f.pop) txt(c, f.pop.text, f.pop.x, 80 - (1 - f.pop.t) * 20, 22, f.pop.text === 'A boot!' ? '#c62828' : '#2e7d32');
  },
};

// ================================================================ Beat Tap (rhythm game with public-domain tunes)
const SONGS = {
  twinkle: [0, 0, 4, 4, 5, 5, 4, -1, 3, 3, 2, 2, 1, 1, 0, -1, 4, 4, 3, 3, 2, 2, 1, -1, 4, 4, 3, 3, 2, 2, 1, -1, 0, 0, 4, 4, 5, 5, 4, -1, 3, 3, 2, 2, 1, 1, 0],
  joy: [2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2, 2, 1, 1, -1, 2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2, 1, 0, 0, -1, 1, 1, 2, 0, 1, 2, 3, 2, 0, 1, 2, 3, 2, 1, 0, 1, 4],
  mary: [2, 1, 0, 1, 2, 2, 2, -1, 1, 1, 1, -1, 2, 4, 4, -1, 2, 1, 0, 1, 2, 2, 2, 2, 1, 1, 2, 1, 0],
};
const LANE_C = ['#ff4f9a', '#ffd23f', '#2fb8ff', '#9be15d'], LANE_K = ['d', 'f', 'j', 'k'];
export const beats = {
  w: 400, h: 600, usesLetters: true, how: 'Press D F J K (or tap the lanes) when a note reaches the line. Play the whole song!',
  start(G) {
    const song = SONGS[G.params.song || 'twinkle'], beat = 60 / (G.params.bpm || 96);
    const notes = []; song.forEach((n, i) => { if (n >= 0) notes.push({ time: 2 + i * beat, lane: n % 4, pitch: NOTES[n], hit: false, miss: false }); });
    G.bt = { notes, now: 0, combo: 0, hits: 0, flash: [0, 0, 0, 0], msg: null, end: notes.at(-1).time + 1.5 };
  },
  hit(G, lane) {
    const b = G.bt; b.flash[lane] = 0.15;
    const n = b.notes.find(n => n.lane === lane && !n.hit && !n.miss && Math.abs(n.time - b.now) < 0.18);
    if (!n) { b.combo = 0; return; }
    n.hit = true; b.hits++; b.combo++; const perfect = Math.abs(n.time - b.now) < 0.07;
    G.add((perfect ? 3 : 1) * Math.min(4, 1 + Math.floor(b.combo / 8))); tone(n.pitch, 0.4, 'triangle', 0.14);
    b.msg = { t: 0.5, text: perfect ? 'Perfect!' : 'Good', lane };
  },
  key(G, k) { const i = LANE_K.indexOf(k.toLowerCase()); if (i >= 0) this.hit(G, i); },
  tap(G, x) { this.hit(G, clamp(Math.floor(x / 100), 0, 3)); },
  update(G, dt) {
    const b = G.bt; b.now += dt;
    for (const n of b.notes) if (!n.hit && !n.miss && b.now - n.time > 0.2) { n.miss = true; b.combo = 0; }
    b.flash = b.flash.map(f => Math.max(0, f - dt)); if (b.msg) { b.msg.t -= dt; if (b.msg.t <= 0) b.msg = null; }
    G.status(`combo ${b.combo}`);
    if (b.now > b.end) return b.hits >= b.notes.length * 0.5 ? G.win(`${b.hits} of ${b.notes.length} notes`) : G.lose(`${b.hits} of ${b.notes.length} notes`);
  },
  draw(G, c) {
    const b = G.bt, Y = 520, sp = 260;
    sky(c, 400, 600, '#1a1033', '#3a1d5c');
    for (let i = 0; i < 4; i++) { rr(c, i * 100 + 6, 0, 88, 600, 0, `rgba(255,255,255,${0.03 + b.flash[i] * 1.5})`); }
    line(c, 0, Y, 400, Y, 4, 'rgba(255,255,255,.7)');
    for (const n of b.notes) { if (n.hit) continue; const y = Y - (n.time - b.now) * sp; if (y < -30 || y > 640) continue; rr(c, n.lane * 100 + 14, y - 14, 72, 28, 14, n.miss ? 'rgba(255,255,255,.15)' : LANE_C[n.lane]); }
    for (let i = 0; i < 4; i++) { dot(c, i * 100 + 50, Y, 22, b.flash[i] ? LANE_C[i] : 'rgba(255,255,255,.12)'); txt(c, LANE_K[i].toUpperCase(), i * 100 + 50, Y, 16, '#fff'); }
    if (b.msg) txt(c, b.msg.text, b.msg.lane * 100 + 50, Y - 60, 18, '#fff');
    if (b.now < 2) txt(c, 'Get ready…', 200, 280, 26, '#fff');
  },
};

// ================================================================ Bubble Shooter
const BC = ['#ff4f9a', '#ffd23f', '#2fb8ff', '#9be15d', '#b18cff', '#ff8a1f'];
const BR = 16, ROW_H = 28;
export const bubbles = {
  w: 400, h: 600, how: 'Aim with the mouse (or ← →) and click or press Space to shoot. Join 3 or more of the same colour to pop them!',
  start(G) {
    const b = G.bb = { grid: new Map(), top: 0, shots: 0, ang: -Math.PI / 2, ball: null, fx: [], drops: [], n: G.params.colors || 4 };
    for (let r = 0; r < 6; r++) for (let c = 0; c < this.cols(r); c++) b.grid.set(`${r},${c}`, rand(b.n) | 0);
    b.cur = this.color(G); b.next = this.color(G);
  },
  cols: r => (r % 2 ? 11 : 12),
  pos(b, r, c) { return [BR + c * 32 + (r % 2) * 16, BR + r * ROW_H + b.top]; },
  near(r, c) { const o = r % 2 ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]]; return o.map(([dr, dc]) => [r + dr, c + dc]).filter(([rr2, cc]) => rr2 >= 0 && cc >= 0 && cc < this.cols(rr2)); },
  color(G) { const have = [...new Set(G.bb.grid.values())]; return have.length ? pick(have) : rand(G.bb.n) | 0; },
  move(G, x, y) { G.bb.ang = clamp(Math.atan2(y - 560, x - 200), -Math.PI + 0.2, -0.2); },
  shoot(G) { const b = G.bb; if (b.ball) return; b.ball = { x: 200, y: 560, vx: Math.cos(b.ang) * 720, vy: Math.sin(b.ang) * 720, col: b.cur }; b.cur = b.next; b.next = this.color(G); G.sound('tick'); },
  tap(G, x, y) { this.move(G, x, y); this.shoot(G); }, key(G, k) { if (k === ' ' || k === 'ArrowUp') this.shoot(G); },
  update(G, dt) {
    const b = G.bb; stepSparks(b.fx, dt);
    if (G.keys.has('ArrowLeft')) b.ang = Math.max(-Math.PI + 0.2, b.ang - 1.6 * dt); if (G.keys.has('ArrowRight')) b.ang = Math.min(-0.2, b.ang + 1.6 * dt);
    for (const d of b.drops) { d.vy += 900 * dt; d.y += d.vy * dt; } b.drops = b.drops.filter(d => d.y < 640);
    const s = b.ball; if (!s) return;
    for (let k = 0; k < 4; k++) {
      s.x += s.vx * dt / 4; s.y += s.vy * dt / 4;
      if (s.x < BR) { s.x = BR; s.vx = Math.abs(s.vx); } if (s.x > 400 - BR) { s.x = 400 - BR; s.vx = -Math.abs(s.vx); }
      let stick = s.y < BR + b.top;
      if (!stick) for (const key of b.grid.keys()) { const [r, c] = key.split(',').map(Number), [x, y] = this.pos(b, r, c); if (Math.hypot(x - s.x, y - s.y) < 28) { stick = true; break; } }
      if (stick) return this.land(G);
    }
  },
  land(G) {
    const b = G.bb, s = b.ball; b.ball = null;
    const r0 = Math.max(0, Math.round((s.y - BR - b.top) / ROW_H)); let best = null;
    for (let r = Math.max(0, r0 - 1); r <= r0 + 1; r++) for (let c = 0; c < this.cols(r); c++) {
      if (b.grid.has(`${r},${c}`)) continue; const [x, y] = this.pos(b, r, c), d = Math.hypot(x - s.x, y - s.y); if (!best || d < best.d) best = { r, c, d };
    }
    if (!best) return;
    const key = `${best.r},${best.c}`; b.grid.set(key, s.col);
    const same = new Set([key]), q = [[best.r, best.c]];
    while (q.length) { const [r, c] = q.pop(); for (const [nr, nc] of this.near(r, c)) { const k = `${nr},${nc}`; if (!same.has(k) && b.grid.get(k) === s.col) { same.add(k); q.push([nr, nc]); } } }
    if (same.size >= 3) {
      for (const k of same) { const [r, c] = k.split(',').map(Number), [x, y] = this.pos(b, r, c); b.grid.delete(k); burst(b.fx, x, y, BC[s.col], 6, 120); }
      G.add(same.size * 10); G.sound('pop');
      const keep = new Set(), q2 = [...b.grid.keys()].filter(k => k.startsWith('0,'));
      q2.forEach(k => keep.add(k));
      while (q2.length) { const [r, c] = q2.pop().split(',').map(Number); for (const [nr, nc] of this.near(r, c)) { const k = `${nr},${nc}`; if (b.grid.has(k) && !keep.has(k)) { keep.add(k); q2.push(k); } } }
      for (const [k, col] of [...b.grid]) if (!keep.has(k)) { const [r, c] = k.split(',').map(Number), [x, y] = this.pos(b, r, c); b.drops.push({ x, y, vy: 0, col }); b.grid.delete(k); G.add(20); }
    } else { b.shots++; if (b.shots % (G.params.drop || 6) === 0) { b.top += ROW_H; G.sound('drop'); } }
    if (!b.grid.size) return G.win('Board cleared!');
    for (const k of b.grid.keys()) { const [r] = k.split(',').map(Number); if (BR + r * ROW_H + b.top > 500) return G.lose('The bubbles reached the bottom'); }
  },
  draw(G, c) {
    const b = G.bb;
    sky(c, 400, 600, '#1e2a4a', '#3b2d63'); line(c, 0, 516, 400, 516, 2, 'rgba(255,255,255,.2)');
    const ball = (x, y, col) => { dot(c, x, y, BR - 1, BC[col]); dot(c, x - 5, y - 5, 4, 'rgba(255,255,255,.55)'); };
    for (const [k, col] of b.grid) { const [r, cc] = k.split(',').map(Number); ball(...this.pos(b, r, cc), col); }
    for (const d of b.drops) ball(d.x, d.y, d.col);
    if (!b.ball) { c.setLineDash([6, 8]); line(c, 200, 560, 200 + Math.cos(b.ang) * 160, 560 + Math.sin(b.ang) * 160, 2, 'rgba(255,255,255,.5)'); c.setLineDash([]); }
    ball(200, 560, b.cur); if (b.ball) ball(b.ball.x, b.ball.y, b.ball.col);
    txt(c, 'next', 340, 548, 11, 'rgba(255,255,255,.6)'); ball(340, 572, b.next);
    drawSparks(c, b.fx);
  },
};
