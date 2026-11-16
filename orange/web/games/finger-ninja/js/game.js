// Finger Ninja — AR fruit slicer driven by hand tracking.
import { Tracker } from "./tracker.js";
import { sfx, unlockAudio } from "./audio.js";

// ---------------------------------------------------------------- setup
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d");
const video = $("video");
const tracker = new Tracker(video);

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);
resize();

const FRUITS = [
  { e: "🍉", juice: "#ff3b5c", pts: 1 },
  { e: "🍊", juice: "#ff9a1f", pts: 1 },
  { e: "🍎", juice: "#ff3030", pts: 1 },
  { e: "🍋", juice: "#ffe23d", pts: 1 },
  { e: "🍍", juice: "#ffd23d", pts: 2 },
  { e: "🥝", juice: "#8fd13f", pts: 2 },
  { e: "🍑", juice: "#ffab7a", pts: 1 },
  { e: "🍇", juice: "#9b4dff", pts: 2 },
  { e: "🥥", juice: "#f4efe6", pts: 3 },
];
const MAX_LIVES = 3;

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------------------------------------------------------------- state
let state = "intro"; // intro | ready | countdown | playing | paused | over
let score = 0, lives = MAX_LIVES, best = store.get("fn_best", 0);
let elapsed = 0, spawnTimer = 0;
let objects = [], halves = [], particles = [], popups = [], splats = [];
let shake = 0, flash = 0, countdown = 0, slashes = [];
const blades = new Map();
const ring = { progress: 0, pulse: 0 };

// ---------------------------------------------------------------- helpers
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const unit = () => Math.min(W, H) / 700; // scale factor for sizes/speeds

/** Map a normalised (camera-space) point to mirrored screen space, matching the "cover" video draw. */
function videoRect() {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const s = Math.max(W / vw, H / vh);
  const dw = vw * s, dh = vh * s;
  return { x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh };
}
function toScreen(p) {
  const r = videoRect();
  return { x: W - (r.x + p.x * r.w), y: r.y + p.y * r.h };
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ---------------------------------------------------------------- blades (fingers + mouse)
function updateBlade(id, x, y, now) {
  let b = blades.get(id);
  if (!b) {
    b = { x, y, px: x, py: y, trail: [], speed: 0, seen: now, comboCount: 0, comboAt: 0 };
    blades.set(id, b);
  }
  // light smoothing to reduce jitter
  const nx = b.x + (x - b.x) * 0.65, ny = b.y + (y - b.y) * 0.65;
  b.px = b.x; b.py = b.y; b.x = nx; b.y = ny;
  const dt = Math.max(1, now - b.seen) / 1000;
  b.speed = Math.hypot(b.x - b.px, b.y - b.py) / dt;
  b.seen = now;
  b.trail.push({ x: b.x, y: b.y, t: now });
}

function pruneBlades(now) {
  for (const [id, b] of blades) {
    b.trail = b.trail.filter((p) => now - p.t < 160);
    if (now - b.seen > 250) blades.delete(id);
  }
}

let mouseDown = false;
canvas.addEventListener("pointerdown", (e) => {
  mouseDown = true; unlockAudio();
  if ((state === "ready" && playerReady(performance.now())) || state === "over") {
    const c = ringCenter();
    if (Math.hypot(e.clientX - c.x, e.clientY - c.y) < c.r) startGame();
  }
});
window.addEventListener("pointerup", () => (mouseDown = false));
canvas.addEventListener("pointermove", (e) => {
  if (mouseDown) { const t = performance.now(); updateBlade("mouse", e.clientX, e.clientY, t); tracker.handSeenAt = Math.max(tracker.handSeenAt, t); }
});

// ---------------------------------------------------------------- spawning
function spawnWave() {
  const t = elapsed;
  const count = Math.min(1 + Math.floor(Math.random() * (2 + t / 20)), 6);
  const bombChance = Math.min(0.08 + t / 300, 0.3);
  for (let i = 0; i < count; i++) {
    setTimeout(() => state === "playing" && launch(Math.random() < bombChance), i * rand(90, 260));
  }
}

function launch(isBomb) {
  const u = unit();
  const g = H * 1.5;
  const r = (isBomb ? 46 : rand(40, 54)) * u;
  const x = rand(W * 0.15, W * 0.85);
  const peak = rand(H * 0.45, H * 0.82);
  const vy = -Math.sqrt(2 * g * peak);
  const flight = (2 * -vy) / g;
  const vx = (rand(W * 0.3, W * 0.7) - x) / flight;
  const f = isBomb ? null : pick(FRUITS);
  objects.push({
    x, y: H + r, vx, vy, g, r,
    rot: rand(0, Math.PI * 2), vr: rand(-3, 3),
    bomb: isBomb, fruit: f, dead: false,
  });
}

// ---------------------------------------------------------------- game flow
function startGame() {
  score = 0; lives = MAX_LIVES; elapsed = 0; spawnTimer = 0.6;
  objects = []; halves = []; particles = []; popups = []; splats = []; slashes = [];
  ring.progress = 0;
  state = "countdown"; countdown = 3;
  $("ready").classList.add("hidden");
  $("over").classList.add("hidden");
  $("hud").classList.remove("hidden");
  renderHud();
  sfx.tick();
}

function gameOver(byBomb) {
  state = "over";
  const isBest = score > best;
  if (isBest) { best = score; store.set("fn_best", best); }
  $("overTitle").textContent = byBomb ? "💥 BOOM!" : "GAME OVER";
  $("finalScore").textContent = score;
  $("newBest").classList.toggle("hidden", !isBest);
  $("paused").classList.add("hidden");
  setTimeout(() => state === "over" && $("over").classList.remove("hidden"), byBomb ? 900 : 300);
  ring.progress = 0;
  renderHud();
}

let bumpT = 0;
function bumpScore() {
  const el = $("score"); el.classList.add("bump");
  clearTimeout(bumpT); bumpT = setTimeout(() => el.classList.remove("bump"), 110);
}
let comboT = 0;
function showCombo(text) {
  const m = $("comboMeter"); $("comboText").textContent = text; m.classList.add("show");
  clearTimeout(comboT); comboT = setTimeout(() => m.classList.remove("show"), 900);
}

function renderHud() {
  $("score").textContent = score;
  $("best").textContent = `BEST ${best}`;
  $("lives").innerHTML = Array.from({ length: MAX_LIVES }, (_, i) =>
    `<span class="${i < lives ? "" : "lost"}">❤️</span>`).join("");
}

function playerReady(now) { return tracker.hasHand(now, 800); }

// ---------------------------------------------------------------- slicing
function sliceObject(o, b, now) {
  o.dead = true;
  const ang = Math.atan2(b.y - b.py, b.x - b.px);
  if (o.bomb) {
    explode(o);
    return;
  }
  sfx.slice();
  slashes.push({ x: o.x, y: o.y, a: ang, len: o.r * 3.2, life: 0.22, c: o.fruit.juice });
  const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
  const push = 160 * unit();
  for (const side of [-1, 1]) {
    halves.push({
      x: o.x, y: o.y, vx: o.vx * 0.6 + nx * push * side, vy: o.vy * 0.4 + ny * push * side - 80,
      g: o.g, r: o.r, rot: o.rot, vr: o.vr + side * 4, cut: ang - o.rot, side, e: o.fruit.e, life: 2.5,
    });
  }
  for (let i = 0; i < 18; i++) {
    const a = rand(0, Math.PI * 2), s = rand(80, 420) * unit();
    particles.push({ x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(2, 6) * unit(), c: o.fruit.juice, life: rand(0.4, 0.9) });
  }
  splats.push({ x: o.x, y: o.y, r: o.r * rand(1.1, 1.6), c: o.fruit.juice, life: 1.6, seed: Math.random() * 1000 });

  // combos: slices by the same blade within 280 ms
  if (now - b.comboAt < 280) b.comboCount++; else b.comboCount = 1;
  b.comboAt = now;
  let pts = o.fruit.pts;
  score += pts;
  popups.push({ x: o.x, y: o.y, text: `+${pts}`, life: 0.8, size: 26, color: "#fff7ec" });
  if (b.comboCount >= 3) {
    const bonus = b.comboCount;
    score += bonus;
    popups.push({ x: o.x, y: o.y - 50 * unit(), text: `${b.comboCount}x COMBO +${bonus}`, life: 1.1, size: 34, color: "#ffcc33" });
    sfx.combo(b.comboCount);
    showCombo(`⚡ ${b.comboCount}x COMBO`);
  }
  bumpScore();
  renderHud();
}

function explode(o) {
  sfx.boom();
  shake = 28; flash = 1;
  for (let i = 0; i < 60; i++) {
    const a = rand(0, Math.PI * 2), s = rand(150, 900) * unit();
    particles.push({ x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(3, 9) * unit(), c: pick(["#ffcc33", "#ff6a00", "#ff2d2d", "#ffffff", "#444"]), life: rand(0.5, 1.4) });
  }
  gameOver(true);
}

// ---------------------------------------------------------------- update
function update(dt, now) {
  tracker.update(now);

  // feed tracked fingertips into blades
  tracker.hands.forEach((h, i) => {
    const p = toScreen(h.tip);
    updateBlade("h" + i, p.x, p.y, now);
  });
  pruneBlades(now);

  // tracking indicators
  $("trk-hand").classList.toggle("on", tracker.hasHand(now));

  if (state === "ready") updateReadyChecks(now);

  // countdown before play
  if (state === "countdown") {
    const before = Math.ceil(countdown);
    countdown -= dt;
    if (countdown <= 0) { state = "playing"; sfx.start(); popups.push({ x: W / 2, y: H / 2, text: "SLICE!", life: 0.8, size: 80, color: "#3de8ff" }); }
    else if (Math.ceil(countdown) !== before) sfx.tick();
  }

  // hand presence → pause/resume (generous grace so quick drops don't pause)
  if (state === "playing" && !tracker.hasHand(now, 3000)) {
    state = "paused"; $("paused").classList.remove("hidden");
  } else if (state === "paused" && tracker.hasHand(now, 200)) {
    state = "playing"; $("paused").classList.add("hidden");
  }

  // start / restart ring by hovering a fingertip
  if (state === "ready" || state === "over") {
    const active = state === "over" ? !$("over").classList.contains("hidden") : playerReady(now);
    const c = ringCenter();
    let hovering = false;
    if (active) for (const b of blades.values()) if (Math.hypot(b.x - c.x, b.y - c.y) < c.r) hovering = true;
    ring.progress = hovering ? ring.progress + dt / 1.1 : Math.max(0, ring.progress - dt * 1.5);
    if (hovering && Math.random() < 0.15) sfx.tick();
    if (ring.progress >= 1) startGame();
  }
  ring.pulse += dt;

  if (state === "playing") {
    elapsed += dt;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnWave();
      spawnTimer = Math.max(0.9, 2.4 - elapsed / 40) + rand(0, 0.5);
    }

    // slicing test
    const minSpeed = 700 * unit();
    for (const b of blades.values()) {
      if (b.speed < minSpeed) continue;
      for (const o of objects) {
        if (o.dead) continue;
        if (distToSegment(o.x, o.y, b.px, b.py, b.x, b.y) < o.r * 0.95) {
          sliceObject(o, b, now);
          if (state !== "playing") break;
        }
      }
      if (state !== "playing") break;
    }
  }

  if (state !== "paused") {
    for (const o of objects) {
      o.vy += o.g * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
      if (!o.dead && o.vy > 0 && o.y > H + o.r * 1.5) {
        o.dead = true;
        if (!o.bomb && state === "playing") {
          lives--;
          sfx.miss();
          popups.push({ x: Math.min(Math.max(o.x, 60), W - 60), y: H - 40, text: "✖ MISS", life: 1, size: 28, color: "#ff4d3d" });
          renderHud();
          if (lives <= 0) gameOver(false);
        }
      }
    }
    objects = objects.filter((o) => !o.dead);

    for (const h of halves) { h.vy += h.g * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; h.life -= dt; }
    halves = halves.filter((h) => h.life > 0 && h.y < H + 200);
  }

  for (const p of particles) { p.vy += 900 * unit() * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const s of slashes) s.life -= dt;
  slashes = slashes.filter((s) => s.life > 0);
  for (const p of popups) { p.y -= 60 * dt; p.life -= dt; }
  popups = popups.filter((p) => p.life > 0);
  for (const s of splats) s.life -= dt * 0.6;
  splats = splats.filter((s) => s.life > 0);

  shake = Math.max(0, shake - dt * 60);
  flash = Math.max(0, flash - dt * 1.8);
}

function updateReadyChecks(now) {
  const set = (id, ok) => $(id).classList.toggle("ok", ok);
  set("chk-cam", video.readyState >= 2);
  set("chk-model", !!tracker.handLm);
  set("chk-hand", tracker.hasHand(now, 800));
  const hint = $("readyHint");
  if (!tracker.handLm && tracker.handSeenAt !== Infinity) hint.textContent = "Loading AI tracking…";
  else if (!tracker.hasHand(now, 800)) hint.textContent = "✋ Raise your hand with the index finger pointing up";
  else hint.textContent = "👉 Hold your fingertip on the glowing START ring";
}

// ---------------------------------------------------------------- draw
function ringCenter() {
  const r = 64 * unit();
  return { x: W / 2, y: Math.min(H - r - 20, H * (state === "over" ? 0.8 : 0.76)), r };
}

function drawVideo() {
  if (video.readyState < 2) { ctx.fillStyle = "#0a0614"; ctx.fillRect(0, 0, W, H); return; }
  const r = videoRect();
  ctx.save();
  ctx.translate(W, 0); ctx.scale(-1, 1);
  ctx.drawImage(video, r.x, r.y, r.w, r.h);
  ctx.restore();
  // moody night-dojo grade so the fruit pops
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "rgba(60, 10, 70, 0.55)");
  g.addColorStop(1, "rgba(10, 20, 60, 0.55)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

function drawHandSkeleton() {
  if (state === "playing") return; // keep the play field clean
  const bones = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  ctx.save();
  ctx.lineCap = "round";
  for (const h of tracker.hands) {
    const pts = h.landmarks.map(toScreen);
    ctx.shadowColor = "#3de8ff"; ctx.shadowBlur = 14;
    ctx.strokeStyle = "rgba(61,232,255,.75)"; ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [a, b] of bones) { ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); }
    ctx.stroke();
    ctx.fillStyle = "#fff";
    for (let i = 0; i < pts.length; i++) {
      if (i === 8) continue;
      ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawSplats() {
  for (const s of splats) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, s.life) * 0.45;
    ctx.fillStyle = s.c;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const rr = s.r * (0.6 + 0.4 * Math.abs(Math.sin(s.seed + i * 1.7)));
      const px = s.x + Math.cos(a) * rr, py = s.y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawEmoji(e, r) {
  ctx.font = `${r * 2}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(e, 0, r * 0.08);
}

function drawObjects(now) {
  for (const o of objects) {
    ctx.save();
    ctx.translate(o.x, o.y);
    const pulse = 0.5 + 0.5 * Math.sin(now / 90);
    const glow = ctx.createRadialGradient(0, 0, o.r * 0.3, 0, 0, o.r * 1.8);
    if (o.bomb) {
      glow.addColorStop(0, `rgba(255,40,60,${0.45 + pulse * 0.35})`);
      glow.addColorStop(1, "rgba(255,40,60,0)");
    } else {
      glow.addColorStop(0, o.fruit.juice + "66");
      glow.addColorStop(1, o.fruit.juice + "00");
    }
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, o.r * 1.8, 0, Math.PI * 2); ctx.fill();
    if (o.bomb) {
      ctx.strokeStyle = `rgba(255,80,90,${0.5 + pulse * 0.5})`; ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]); ctx.lineDashOffset = -now / 30;
      ctx.beginPath(); ctx.arc(0, 0, o.r * 1.25, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.rotate(o.rot);
    ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
    drawEmoji(o.bomb ? "💣" : o.fruit.e, o.r);
    ctx.restore();
  }
  for (const h of halves) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, h.life);
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    ctx.save();
    ctx.rotate(h.cut);
    ctx.beginPath();
    ctx.rect(-h.r * 1.5, h.side < 0 ? -h.r * 1.5 : 0, h.r * 3, h.r * 1.5);
    ctx.clip();
    ctx.rotate(-h.cut);
    drawEmoji(h.e, h.r);
    ctx.restore();
    ctx.restore();
  }
}

function drawSlashes() {
  ctx.save();
  ctx.lineCap = "round";
  for (const s of slashes) {
    const k = s.life / 0.22;
    const dx = Math.cos(s.a) * s.len * (1.2 - k * 0.2), dy = Math.sin(s.a) * s.len * (1.2 - k * 0.2);
    ctx.globalAlpha = k;
    ctx.shadowColor = s.c; ctx.shadowBlur = 24;
    ctx.strokeStyle = s.c; ctx.lineWidth = 14 * k * unit() + 2;
    ctx.beginPath(); ctx.moveTo(s.x - dx, s.y - dy); ctx.lineTo(s.x + dx, s.y + dy); ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 5 * k * unit() + 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 1.5);
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBlades(now) {
  for (const b of blades.values()) {
    const t = b.trail;
    if (t.length > 1) {
      ctx.save();
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      const hot = b.speed > 700 * unit(); // trail glows hotter when fast enough to cut
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 1; i < t.length; i++) {
          const k = i / t.length;
          if (pass === 0) {
            ctx.strokeStyle = hot ? `rgba(255,61,180,${0.35 * k})` : `rgba(61,232,255,${0.3 * k})`;
            ctx.lineWidth = 26 * k * unit() + 2;
          } else if (pass === 1) {
            ctx.strokeStyle = hot ? `rgba(61,232,255,${0.7 * k})` : `rgba(140,220,255,${0.5 * k})`;
            ctx.lineWidth = 12 * k * unit() + 1;
          } else {
            ctx.strokeStyle = `rgba(255,255,255,${0.95 * k})`;
            ctx.lineWidth = 4 * k * unit() + 1;
          }
          ctx.beginPath(); ctx.moveTo(t[i - 1].x, t[i - 1].y); ctx.lineTo(t[i].x, t[i].y); ctx.stroke();
        }
      }
      ctx.restore();
    }
    // fingertip cursor: glowing core + spinning ring
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.shadowColor = "#3de8ff"; ctx.shadowBlur = 22;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(0, 0, 6 * unit() + 2, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(now / 300);
    ctx.strokeStyle = "rgba(61,232,255,.9)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 14 * unit() + 4, 0, Math.PI * 1.2); ctx.stroke();
    ctx.restore();
  }
}

function drawPopups() {
  ctx.save();
  ctx.textAlign = "center";
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.font = `${p.size * unit() + 6}px Bungee, sans-serif`;
    ctx.lineWidth = 5; ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

function drawRing(now) {
  const show = (state === "ready" && playerReady(now)) || (state === "over" && !$("over").classList.contains("hidden"));
  if (!show) return;
  const c = ringCenter();
  const pulse = 1 + Math.sin(ring.pulse * 4) * 0.05;
  const R = c.r * pulse;
  ctx.save();
  ctx.translate(c.x, c.y);
  // outer halo
  const halo = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.9);
  halo.addColorStop(0, "rgba(255,210,63,.35)");
  halo.addColorStop(1, "rgba(255,210,63,0)");
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, R * 1.9, 0, Math.PI * 2); ctx.fill();
  // disc
  ctx.fillStyle = "rgba(20,10,36,.7)";
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  // spinning dashed track
  ctx.save();
  ctx.rotate(ring.pulse * 0.8);
  ctx.setLineDash([6, 10]);
  ctx.strokeStyle = "rgba(255,210,63,.6)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, R + 10, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // progress
  ctx.strokeStyle = "rgba(255,255,255,.15)"; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowColor = "#ffd23f"; ctx.shadowBlur = 20;
  ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 9; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + ring.progress * Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff8ef";
  ctx.font = `${18 * unit() + 6}px Bungee, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(state === "over" ? "AGAIN" : "START", 0, 2);
  ctx.restore();
}

function drawCountdown() {
  if (state !== "countdown") return;
  const n = Math.ceil(countdown);
  const frac = countdown - Math.floor(countdown); // 1 → 0 within each second
  const scale = 0.7 + frac * 0.6;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  ctx.globalAlpha = Math.min(1, frac * 2.5);
  ctx.font = `${140 * unit() + 30}px Bungee, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "#ff3d6e"; ctx.shadowBlur = 40;
  ctx.lineWidth = 10; ctx.strokeStyle = "#5a0820";
  ctx.strokeText(String(n), 0, 0);
  ctx.fillStyle = "#ffd23f"; ctx.fillText(String(n), 0, 0);
  ctx.restore();
}

function draw(now) {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawVideo();
  drawSplats();
  drawHandSkeleton();
  drawObjects(now);
  drawSlashes();
  drawParticles();
  drawPopups();
  drawRing(now);
  drawCountdown();
  drawBlades(now);
  ctx.restore();
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,240,220,${flash})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state !== "intro") update(dt, now);
  draw(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------- boot
$("startCam").addEventListener("click", async () => {
  unlockAudio();
  const err = $("err");
  err.textContent = "";
  if (!navigator.mediaDevices?.getUserMedia) {
    err.textContent = "This browser can't open the camera. Use Chrome/Edge/Firefox and open the game over https:// or http://localhost.";
    return;
  }
  $("startCam").disabled = true;
  $("startCam").textContent = "Starting…";
  try {
    await tracker.startCamera();
  } catch (e) {
    err.textContent = "Camera permission was blocked. Allow camera access in the address bar and try again.";
    $("startCam").disabled = false; $("startCam").textContent = "Turn on camera";
    return;
  }
  $("intro").classList.add("hidden");
  $("ready").classList.remove("hidden");
  state = "ready";
  renderHud();
  try {
    await tracker.loadModels();
  } catch (e) {
    console.error(e);
    $("readyHint").textContent = "Couldn't load the hand-tracking model (check your internet). You can still play with the mouse: click the ring, then drag to slice.";
    // mouse-only fallback: treat player as ready
    tracker.handSeenAt = Infinity;
  }
});
