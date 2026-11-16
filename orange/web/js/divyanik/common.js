// Shared pieces for the DivyaNik modules: saved progress (encrypted in the box), charts and certificates.
import { api } from '../api.js';
import { h, debounce, notify } from '../core.js';

export const DN = { data: null };
export async function loadDN() {
  if (!DN.data) { try { DN.data = await api.get('kv', { key: 'divyanik' }); } catch { DN.data = {}; } }
  const d = DN.data;
  d.profile ||= {}; d.reading ||= []; d.rated ||= []; d.typing ||= {}; d.typing.level ||= 1; d.typing.passes ||= {}; d.typing.attempts ||= []; d.typing.weak ||= {};
  d.quest ||= {}; d.quest.done ||= {}; d.quest.subs ||= []; d.certs ||= [];
  return d;
}
export const saveDN = debounce(() => api.post('kv', { key: 'divyanik', value: DN.data }).catch(() => {}), 300);
// Does this path exist in the box? Walks down from the root, so a missing folder never shows up as an error.
export async function boxHas(path) {
  const parts = path.split('/').filter(Boolean); let dir = '/';
  for (const part of parts) {
    let items; try { ({ items } = await api.get('list', { path: dir })); } catch { return false; }
    if (!items.some(i => i.name === part)) return false;
    dir = dir === '/' ? `/${part}` : `${dir}/${part}`;
  }
  return true;
}
export const today = () => new Date().toISOString().slice(0, 10);
export const isMinor = d => ['4–6', '7–9', '10–12', '13–15', '16–18'].includes(d.profile.band);
export const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };
export const pick = a => a[(Math.random() * a.length) | 0];

// A small line chart as SVG (no library). values: numbers, oldest first.
export function chart(values, { label = '', color = '#ff8a1f', w = 520, h: H = 140 } = {}) {
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${H}`); svg.setAttribute('class', 'dn-chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
  if (values.length < 2) { svg.innerHTML = `<text x="${w / 2}" y="${H / 2}" text-anchor="middle" class="dn-chart-empty">Your progress chart appears after two attempts</text>`; return svg; }
  const max = Math.max(...values) * 1.15 || 1, step = (w - 40) / (values.length - 1), pts = values.map((v, i) => [20 + i * step, H - 20 - (v / max) * (H - 40)]);
  svg.innerHTML = `<polyline points="${pts.map(p => p.join(',')).join(' ')} ${w - 20},${H - 20} 20,${H - 20}" fill="${color}" opacity=".12"/>`
    + `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`
    + pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4" fill="${color}"><title>${values[i]}</title></circle>`).join('')
    + `<text x="${pts.at(-1)[0]}" y="${pts.at(-1)[1] - 10}" text-anchor="end" class="dn-chart-v">${values.at(-1)}</text>`;
  return svg;
}
export const meter = (label, pct, color = '#2ecc71', note = '') => h('div', { class: 'dn-meter' }, h('div', { class: 'dn-meter-top' }, h('span', {}, label), h('b', {}, note || `${Math.round(pct)}%`)), h('div', { class: 'dn-track' }, h('i', { style: { width: `${Math.max(0, Math.min(100, pct))}%`, background: color } })));
export const stat = (value, label, sub) => h('div', { class: 'dn-stat' }, h('b', {}, value), h('span', {}, label), sub ? h('small', {}, sub) : null);

// Certificates are pictures saved into /DivyaNik/Certificates. Without the DivyaNik server there is no QR
// verification, so every certificate says it was earned in an unsupervised test on this computer.
export function certNo() { return `DN-${today().replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`; }
export async function certificate({ title, name, lines, kind }) {
  const d = DN.data, no = certNo(), W = 1600, H = 1130, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#fff8ef'); g.addColorStop(1, '#ffe7cf'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#ff8a1f'; c.lineWidth = 18; c.strokeRect(40, 40, W - 80, H - 80); c.strokeStyle = '#ffd3a6'; c.lineWidth = 4; c.strokeRect(78, 78, W - 156, H - 156);
  const t = (s, y, size, color = '#3e2723', weight = 700) => { c.font = `${weight} ${size}px Sora, "Segoe UI", sans-serif`; c.fillStyle = color; c.textAlign = 'center'; c.fillText(s, W / 2, y); };
  t('DivyaNik', 210, 46, '#e65100', 800); t(title, 300, 72, '#3e2723', 800); t('This is to recognise that', 400, 30, '#6d4c41', 500);
  t(name || 'Learner', 500, 86, '#bf360c', 800); lines.forEach((l, i) => t(l, 600 + i * 56, 34, '#4e342e', 600));
  t(`Certificate ${no} · ${today()}`, 900, 26, '#6d4c41', 500);
  t(kind === 'quest' ? 'DivyaNik recognition, not an accredited qualification.' : 'Online unsupervised test, taken in Orange on this computer.', 950, 24, '#8d6e63', 500);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const r = await api.upload(`/DivyaNik/Certificates/${title} - ${(name || 'Learner').replace(/[\\/:*?"<>|]/g, '')} - ${no}.png`, blob);
  d.certs.unshift({ no, title, name, lines, date: today(), path: r.path }); saveDN();
  notify({ title: 'Certificate saved 🎓', body: r.path, icon: 'star', tone: 'good' });
  return r.path;
}
