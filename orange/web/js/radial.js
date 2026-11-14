// Segments: Orange's radial menu. Every choice sits the same distance from the pointer, and the
// choice is made by DIRECTION, so a wedge is an endless target (a "marking menu").
import { h, icon, sfx, anim, EASE, clamp } from './core.js';

const NS = 'http://www.w3.org/2000/svg';
let cur = null;

export function closeRadial(instant) {
  if (!cur) return;
  const c = cur;
  cur = null;
  c.cleanup();
  if (instant) return c.el.remove();
  c.el.classList.add('out');
  setTimeout(() => c.el.remove(), 170);
}
export const radialOpen = () => !!cur;

function wedge(cx, cy, r0, r1, s, e) {
  const rad = d => (d * Math.PI) / 180, p = (r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const large = e - s > 180 ? 1 : 0;
  const [x0, y0] = p(r1, s), [x1, y1] = p(r1, e), [x2, y2] = p(r0, e), [x3, y3] = p(r0, s);
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
}

/**
 * items: [{ label, icon, run, hint, danger, disabled }]
 * mode: 'full' (around the pointer) or 'corner' (a quarter fan from the bottom-left corner)
 */
export function radial({ x, y, items, mode = 'full', title = '' }) {
  closeRadial(true);
  items = items.filter(Boolean).slice(0, 8);
  const n = items.length, full = mode === 'full';
  const R = full ? 150 : 372, r0 = full ? 50 : 104;
  const span = full ? 360 : 90, a0 = full ? -90 - 180 / n : -90, pad = full ? 1.3 : 0.7;
  if (full) { x = clamp(x, R + 12, innerWidth - R - 12); y = clamp(y, R + 12, innerHeight - R - 12); }
  const S = R * 2 + 24, C = R + 12;

  const el = h('div', { class: `rad rad-${mode}`, role: 'menu', 'aria-label': title || 'Segments' });
  Object.assign(el.style, { left: x - C + 'px', top: y - C + 'px', width: S + 'px', height: S + 'px' });
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', S); svg.setAttribute('height', S); svg.setAttribute('viewBox', `0 0 ${S} ${S}`);
  svg.innerHTML = `<defs>
      <radialGradient id="segfill" cx="${C}" cy="${C}" r="${R}" gradientUnits="userSpaceOnUse">
        <stop offset="${r0 / R}" stop-color="var(--seg-in)"/><stop offset="1" stop-color="var(--seg-out)"/></radialGradient>
      <radialGradient id="seghot" cx="${C}" cy="${C}" r="${R}" gradientUnits="userSpaceOnUse">
        <stop offset="${r0 / R}" stop-color="var(--accent-2)"/><stop offset="1" stop-color="var(--accent)"/></radialGradient>
    </defs>
    <circle class="rad-rind" cx="${C}" cy="${C}" r="${R + 5}"/>`;
  el.append(svg);

  const segs = items.map((it, i) => {
    const s = a0 + (i * span) / n + pad, e = a0 + ((i + 1) * span) / n - pad, mid = (s + e) / 2;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', wedge(C, C, r0, R, s, e));
    path.setAttribute('class', 'rad-seg' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : ''));
    path.style.setProperty('--i', i);
    svg.append(path);
    const rm = full ? (r0 + R) / 2 + 4 : r0 + (R - r0) * 0.62;
    const ix = C + rm * Math.cos((mid * Math.PI) / 180), iy = C + rm * Math.sin((mid * Math.PI) / 180);
    const lab = h('div', { class: 'rad-item' + (it.disabled ? ' disabled' : ''), style: { left: ix + 'px', top: iy + 'px', '--i': i } },
      h('span', { class: 'rad-ico', html: icon(it.icon || 'sparkle', full ? 21 : 24) }),
      full ? h('span', { class: 'rad-lab' }, it.short || it.label) : null);
    el.append(lab);
    return { path, lab, it };
  });

  const hubLabel = h('b', {}, title || 'Segments');
  const hubHint = h('small', {}, full ? 'point & click' : '');
  const hub = h('div', { class: 'rad-hub', style: full ? { left: C + 'px', top: C + 'px' } : { left: C + 'px', top: C + 'px' } }, hubLabel, hubHint);
  el.append(hub);
  const tip = full ? null : h('div', { class: 'rad-tip' });
  if (tip) el.append(tip);

  let sel = -1;
  const setSel = (i, sound = true) => {
    if (i === sel) return;
    sel = i;
    segs.forEach((s, k) => { s.path.classList.toggle('hot', k === i); s.lab.classList.toggle('hot', k === i); });
    const it = items[i];
    if (full) {
      hubLabel.textContent = it ? it.label : title || 'Segments';
      hubHint.textContent = it ? (it.hint || '') : 'point & click';
    } else if (tip) {
      tip.textContent = it ? it.label + (it.hint ? `  ·  ${it.hint}` : '') : '';
      tip.classList.toggle('on', !!it);
      if (it) {
        const b = segs[i].lab.style;
        tip.style.left = `calc(${b.left} + 34px)`; tip.style.top = `calc(${b.top} - 14px)`;
      }
    }
    if (it && sound) sfx('tick');
  };

  const pick = ev => {
    const dx = ev.clientX - x, dy = ev.clientY - y, dist = Math.hypot(dx, dy);
    if (dist < r0 * 0.6) return -1;
    if (!full && dist > R + 60) return -1;
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    const rel = (((a - a0) % 360) + 360) % 360;
    if (!full && rel > span) return -1;
    return Math.min(n - 1, Math.floor(rel / (span / n)));
  };
  const run = i => {
    const it = items[i];
    if (!it || it.disabled) return;
    sfx('pop');
    closeRadial();
    setTimeout(() => it.run && it.run(), 30);
  };

  const onMove = ev => setSel(pick(ev));
  const onDown = ev => {
    if (ev.button === 2) return;
    ev.preventDefault(); ev.stopPropagation();
    const i = pick(ev);
    if (i < 0) closeRadial(); else run(i);
  };
  const onCtx = ev => { ev.preventDefault(); ev.stopPropagation(); const i = pick(ev); if (i >= 0) run(i); else closeRadial(); };
  const onKey = ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); closeRadial(); }
    else if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' || ev.key === 'Tab') { ev.preventDefault(); setSel((sel + 1 + n) % n); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { ev.preventDefault(); setSel((sel - 1 + n) % n); }
    else if (ev.key === 'Enter' && sel >= 0) { ev.preventDefault(); run(sel); }
    else if (/^[1-8]$/.test(ev.key)) { ev.preventDefault(); run(+ev.key - 1); }
    else return;
    ev.stopPropagation();
  };
  addEventListener('pointermove', onMove);
  addEventListener('pointerdown', onDown, true);
  addEventListener('contextmenu', onCtx, true);
  addEventListener('keydown', onKey, true);
  addEventListener('blur', () => closeRadial(), { once: true });
  cur = {
    el,
    cleanup() {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', onDown, true);
      removeEventListener('contextmenu', onCtx, true);
      removeEventListener('keydown', onKey, true);
    },
  };
  el.style.transformOrigin = `${C}px ${C}px`;
  document.getElementById('layer').append(el);
  sfx('pop');
  if (full) anim(el, [{ transform: 'scale(.6) rotate(-25deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: EASE.spring });
  else anim(el, [{ transform: 'scale(.3) rotate(-30deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: EASE.spring });
  return el;
}
