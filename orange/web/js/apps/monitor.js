// Monitor: live CPU, RAM, disk and box usage, plus what this window itself is using.
// Polls once every 2 s, and only while the window is visible.
import { api } from '../api.js';
import { h, fmtSize } from '../core.js';
import { register } from '../registry.js';
import { wins } from '../wm.js';

const N = 60;

function mount(win) {
  const hist = { cpu: [], ram: [], heap: [] };
  const card = (id, label, color) => {
    const val = h('b', { class: 'mo-val' }, '–'), sub = h('small', { class: 'mo-sub' }, '');
    const cv = h('canvas', { class: 'mo-spark', width: 300, height: 60 });
    return { id, el: h('div', { class: 'mo-card', style: { '--c': color } }, h('span', { class: 'mo-lbl' }, label), val, sub, cv), val, sub, cv, color };
  };
  const cards = { cpu: card('cpu', 'CPU', '#ff8a1f'), ram: card('ram', 'Memory (RAM)', '#00b894'), heap: card('heap', 'This app (JS memory)', '#6c5ce7') };
  const disk = h('div', { class: 'mo-bars' });
  const tips = h('div', { class: 'mo-tip' });
  win.body.append(h('div', { class: 'mo' },
    h('header', { class: 'tb', 'data-drag': '' }, h('b', { class: 'mo-title' }, 'System monitor'), h('div', { class: 'grow' }), h('span', { class: 'mo-live' }, '● live')),
    h('div', { class: 'mo-body' }, h('div', { class: 'mo-cards' }, Object.values(cards).map(c => c.el)), disk, tips)));

  const bar = (label, used, total, color, note) => {
    const p = total ? Math.min(100, (used / total) * 100) : 0;
    return h('div', { class: 'mo-bar' }, h('div', { class: 'mo-bar-top' }, h('span', {}, label), h('small', {}, note)),
      h('div', { class: 'mo-track' }, h('i', { style: { width: p.toFixed(1) + '%', background: color } })));
  };
  function spark(c, arr, max = 100) {
    const g = c.cv.getContext('2d'), W = c.cv.width, H = c.cv.height;
    g.clearRect(0, 0, W, H);
    if (arr.length < 2) return;
    g.beginPath();
    arr.forEach((v, i) => { const x = (i / (N - 1)) * W, y = H - 4 - (Math.min(v, max) / max) * (H - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = c.color; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke();
    g.lineTo(((arr.length - 1) / (N - 1)) * W, H); g.lineTo(0, H); g.closePath();
    g.globalAlpha = 0.18; g.fillStyle = c.color; g.fill(); g.globalAlpha = 1;
  }
  const push = (k, v) => { hist[k].push(v); if (hist[k].length > N) hist[k].shift(); };

  async function tick() {
    if (document.hidden || win.state === 'min') return;
    let s;
    try { s = await api.get('sys'); } catch { return; }
    if (s.cpu != null) { push('cpu', s.cpu); cards.cpu.val.textContent = `${Math.round(s.cpu)}%`; cards.cpu.sub.textContent = `${s.cores || '?'} cores`; spark(cards.cpu, hist.cpu); }
    else cards.cpu.sub.textContent = 'warming up…';
    if (s.ram) { push('ram', s.ram.percent); cards.ram.val.textContent = `${Math.round(s.ram.percent)}%`; cards.ram.sub.textContent = `${fmtSize(s.ram.used)} of ${fmtSize(s.ram.total)}`; spark(cards.ram, hist.ram); }
    const m = performance.memory;
    if (m) { const mb = m.usedJSHeapSize / 1048576; push('heap', mb); cards.heap.val.textContent = `${mb.toFixed(0)} MB`; cards.heap.sub.textContent = `Orange server: ${s.proc ? fmtSize(s.proc) : '–'}`; spark(cards.heap, hist.heap, Math.max(64, ...hist.heap) * 1.2); }
    else { cards.heap.val.textContent = s.proc ? fmtSize(s.proc) : '–'; cards.heap.sub.textContent = 'Orange server memory'; }
    disk.replaceChildren(
      s.disk ? bar('Disk (ROM / storage)', s.disk.total - s.disk.free, s.disk.total, 'linear-gradient(90deg,#74b9ff,#0984e3)', `${fmtSize(s.disk.free)} free of ${fmtSize(s.disk.total)}`) : null,
      bar('Your encrypted box', s.box || 0, Math.max(s.box || 0, s.disk ? s.disk.free + (s.box || 0) : 1), 'linear-gradient(90deg,#ffb86b,#ff4f9a)', fmtSize(s.box || 0)),
      bar('Open windows', wins.size, 12, 'linear-gradient(90deg,#9be15d,#00b894)', `${wins.size} open`));
    const hot = (s.cpu ?? 0) > 85 || (s.ram?.percent ?? 0) > 90;
    tips.className = 'mo-tip' + (hot ? ' warn' : '');
    tips.textContent = hot ? 'Your computer is busy. Close games or windows you are not using to keep it cool.' : 'All good. Games pause by themselves when you minimise them, so nothing runs in the background.';
  }
  tick();
  const t = setInterval(tick, 2000);
  win.destroy = () => clearInterval(t);
  win.setStatus('Updates every 2 seconds · pauses when hidden');
}

register({ id: 'monitor', name: 'Monitor', icon: 'monitor', color: '#00b894', grad: 'linear-gradient(135deg,#55efc4,#0984e3)', size: [720, 560], single: true, mount, blurb: 'RAM, CPU and disk, live' });
