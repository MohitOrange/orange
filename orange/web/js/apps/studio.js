// Studio: a coding playground with everything pre-installed and offline.
// HTML/CSS/JS and React (Preact + htm, vendored) run in a sandboxed preview; Python runs on this computer;
// SQL runs on a SQLite database that is stored encrypted inside the box.
import { api } from '../api.js';
import { h, icon, ico, sfx, notify, fail, ask, basename, debounce } from '../core.js';
import { register, launch } from '../registry.js';

const TEMPLATES = {
  web: {
    name: 'Web page', icon: '🌐', lang: 'HTML · CSS · JS', file: 'My page.html',
    code: `<!doctype html>
<html>
<head>
<style>
  body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0;
         background: linear-gradient(135deg, #ffb86b, #ff4f9a); color: white; }
  button { font-size: 22px; padding: 12px 26px; border: 0; border-radius: 14px; cursor: pointer; }
  h1 { font-size: 48px; margin: 0 0 16px; }
</style>
</head>
<body>
  <div style="text-align:center">
    <h1>Hello, Orange! 🍊</h1>
    <button id="b">Click me</button>
    <p id="out">You clicked 0 times</p>
  </div>
<script>
  let n = 0;
  b.onclick = () => out.textContent = 'You clicked ' + (++n) + ' times';
</script>
</body>
</html>`,
  },
  react: {
    name: 'React app', icon: '⚛️', lang: 'React (Preact + htm)', file: 'My app.html',
    code: `<!doctype html>
<html>
<head>
<!-- React-style components with Preact + htm, bundled with Orange (no internet needed) -->
<script src="/vendor/preact.umd.js"></script>
<script src="/vendor/hooks.umd.js"></script>
<script src="/vendor/htm.umd.js"></script>
<style>
  body { font-family: system-ui, sans-serif; background: #1d1b2e; color: #fff; padding: 24px; }
  .card { background: #2c2946; border-radius: 16px; padding: 18px; max-width: 420px; }
  input { padding: 10px; border-radius: 10px; border: 0; width: 70%; }
  button { padding: 10px 16px; border-radius: 10px; border: 0; background: #ff8a1f; color: #fff; }
  li { padding: 6px 0; }
</style>
</head>
<body>
<div id="app"></div>
<script>
  const { h, render } = preact;
  const { useState } = preactHooks;
  const html = htm.bind(h);

  function Todo() {
    const [items, setItems] = useState(['Learn React', 'Make a game']);
    const [text, setText] = useState('');
    const add = () => { if (text.trim()) { setItems([...items, text]); setText(''); } };
    return html\`<div class="card">
      <h2>My list ✅</h2>
      <input value=\${text} onInput=\${e => setText(e.target.value)} placeholder="New item" />
      <button onClick=\${add}>Add</button>
      <ul>\${items.map(i => html\`<li>\${i}</li>\`)}</ul>
    </div>\`;
  }
  render(html\`<\${Todo} />\`, document.getElementById('app'));
</script>
</body>
</html>`,
  },
  canvas: {
    name: 'Canvas game', icon: '🎮', lang: 'JavaScript', file: 'My game.html',
    code: `<!doctype html>
<html>
<body style="margin:0;background:#101626;display:grid;place-items:center;height:100vh">
<canvas id="c" width="480" height="320" style="background:#1c2540;border-radius:12px"></canvas>
<script>
  // Move the orange with the arrow keys and catch the stars!
  const c = document.getElementById('c'), g = c.getContext('2d');
  let x = 240, y = 160, score = 0, star = { x: 100, y: 100 };
  const keys = {};
  onkeydown = e => keys[e.key] = true; onkeyup = e => keys[e.key] = false;
  function loop() {
    if (keys.ArrowLeft) x -= 4; if (keys.ArrowRight) x += 4;
    if (keys.ArrowUp) y -= 4; if (keys.ArrowDown) y += 4;
    if (Math.hypot(x - star.x, y - star.y) < 26) { score++; star = { x: 20 + Math.random() * 440, y: 20 + Math.random() * 280 }; }
    g.clearRect(0, 0, 480, 320);
    g.font = '28px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('⭐', star.x, star.y); g.fillText('🍊', x, y);
    g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.fillText('Score: ' + score, 50, 18);
    requestAnimationFrame(loop);
  }
  loop();
</script>
</body>
</html>`,
  },
  python: {
    name: 'Python', icon: '🐍', lang: 'Python 3', file: 'hello.py',
    code: `# Python runs right here on your computer (15 second limit).
name = input() or "friend"
print(f"Hello, {name}! 🍊")

squares = [n * n for n in range(1, 11)]
print("Squares:", squares)
print("Sum:", sum(squares))

def fizzbuzz(n):
    return "FizzBuzz" if n % 15 == 0 else "Fizz" if n % 3 == 0 else "Buzz" if n % 5 == 0 else n

print([fizzbuzz(i) for i in range(1, 16)])
`,
  },
  sql: {
    name: 'Database (SQL)', icon: '🗄️', lang: 'SQLite', file: 'queries.sql',
    code: `-- Your database lives encrypted in the box at /Projects/orange.db
CREATE TABLE IF NOT EXISTS fruits (id INTEGER PRIMARY KEY, name TEXT, colour TEXT, price REAL);

INSERT INTO fruits (name, colour, price)
SELECT 'Orange', 'orange', 30 WHERE NOT EXISTS (SELECT 1 FROM fruits);
INSERT INTO fruits (name, colour, price)
SELECT 'Mango', 'yellow', 60 WHERE (SELECT COUNT(*) FROM fruits) = 1;
INSERT INTO fruits (name, colour, price)
SELECT 'Grapes', 'green', 80 WHERE (SELECT COUNT(*) FROM fruits) = 2;

SELECT name, colour, price FROM fruits ORDER BY price DESC;
`,
  },
};
const KIND_OF = n => /\.py$/i.test(n) ? 'python' : /\.sql$/i.test(n) ? 'sql' : 'web';

function mount(win, args) {
  const S = { kind: 'web', path: args.path || null, dirty: false, db: '/Projects/orange.db' };
  const ta = h('textarea', { class: 'st-code', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Code' });
  const gutter = h('div', { class: 'st-gutter', 'aria-hidden': 'true' });
  const out = h('div', { class: 'st-out' });
  const stdin = h('input', { class: 'st-stdin', placeholder: 'Input for input() (optional)', spellcheck: 'false' });
  const runBtn = h('button', { class: 'tbtn primary st-run', title: 'Run (Ctrl+Enter)', onclick: () => run() }, ico('play', 16), h('span', {}, 'Run'));
  const tabs = h('div', { class: 'st-tabs' }, Object.entries(TEMPLATES).map(([k, t]) =>
    h('button', { class: 'st-tab', dataset: { k }, title: t.lang, onclick: () => pickTemplate(k) }, h('span', {}, t.icon), h('b', {}, t.name))));
  const dbInfo = h('div', { class: 'st-db' });

  win.body.append(h('div', { class: 'st' },
    h('header', { class: 'tb', 'data-drag': '' }, tabs, h('div', { class: 'grow' }),
      h('button', { class: 'tbtn', title: 'Open from the box', 'aria-label': 'Open', html: icon('folder'), onclick: () => openFile() }),
      h('button', { class: 'tbtn', title: 'Save into Projects (Ctrl+S)', 'aria-label': 'Save', html: icon('save'), onclick: () => save() }),
      runBtn),
    h('div', { class: 'st-split' },
      h('div', { class: 'st-edit' }, gutter, ta),
      h('div', { class: 'st-right' }, h('div', { class: 'st-io' }, stdin, dbInfo), out))));

  const lines = () => { const n = ta.value.split('\n').length; if (gutter.childElementCount !== n) gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); };
  ta.addEventListener('scroll', () => (gutter.scrollTop = ta.scrollTop));
  const autoRun = debounce(() => S.kind === 'web' && run(true), 700);
  ta.addEventListener('input', () => { lines(); if (!S.dirty) { S.dirty = true; win.setDirty(true); } autoRun(); });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });

  function setKind(k) {
    S.kind = k;
    tabs.querySelectorAll('.st-tab').forEach(b => b.classList.toggle('on', b.dataset.k === (k === 'web' ? S.tpl || 'web' : k)));
    stdin.hidden = k !== 'python';
    dbInfo.hidden = k !== 'sql';
    win.setStatus(k === 'python' ? 'Python 3 · runs on this computer · Ctrl+Enter' : k === 'sql' ? `SQLite · saved encrypted at ${S.db}` : 'Preview updates as you type · sandboxed, no internet');
  }
  async function pickTemplate(k) {
    if (S.dirty && !(await ask({ title: 'Start a new file?', body: 'Your changes here are not saved yet.', ok: 'Start new', danger: true }))) return;
    const t = TEMPLATES[k];
    S.tpl = k; S.path = null; ta.value = t.code; lines(); S.dirty = false; win.setDirty(false);
    win.setTitle(`Studio · ${t.name}`);
    setKind(KIND_OF(t.file));
    if (S.kind === 'web') run(true); else out.replaceChildren(h('div', { class: 'st-meta' }, 'Press Run (Ctrl+Enter) to start.'));
  }

  async function run(quiet) {
    const code = ta.value;
    try {
      if (S.kind === 'web') {
        const { url } = await api.post('play', { html: code });
        const old = out.querySelector('iframe');
        const fr = h('iframe', { class: 'st-frame', src: url, title: 'Preview', sandbox: 'allow-scripts allow-modals allow-forms allow-pointer-lock' });
        old ? old.replaceWith(fr) : out.replaceChildren(fr);
        return;
      }
      runBtn.disabled = true;
      out.replaceChildren(h('div', { class: 'st-wait' }, 'Running…'));
      if (S.kind === 'python') {
        const r = await api.post('runpy', { code, stdin: stdin.value });
        out.replaceChildren(h('pre', { class: 'st-term' },
          r.stdout ? h('span', {}, r.stdout) : null,
          r.stderr ? h('span', { class: 'st-err' }, r.stderr) : null,
          h('span', { class: 'st-meta' }, `\n— finished in ${r.ms} ms, exit code ${r.code}`)));
        r.code === 0 ? sfx('ok') : sfx('error');
      } else {
        const r = await api.post('sql', { path: S.db, query: code });
        const blocks = (r.results || []).map(res => res.columns
          ? h('div', { class: 'st-table-wrap' }, h('table', { class: 'st-table' },
              h('thead', {}, h('tr', {}, res.columns.map(c => h('th', {}, c)))),
              h('tbody', {}, res.rows.map(row => h('tr', {}, row.map(v => h('td', {}, v == null ? 'NULL' : String(v))))))),
              h('small', {}, `${res.rows.length} row${res.rows.length === 1 ? '' : 's'}`))
          : h('div', { class: 'st-meta' }, `✓ ${res.changed >= 0 ? res.changed + ' row(s) changed' : 'done'}`));
        if (r.error) blocks.push(h('pre', { class: 'st-term' }, h('span', { class: 'st-err' }, r.error)));
        out.replaceChildren(...(blocks.length ? blocks : [h('div', { class: 'st-meta' }, 'Nothing to show. Try a SELECT.')]));
        if (r.tables) dbInfo.replaceChildren(ico('db', 14), h('span', {}, `${basename(S.db)} · tables: ${r.tables.join(', ') || 'none yet'}`));
        r.error ? sfx('error') : sfx('ok');
      }
    } catch (e) { if (!quiet) fail(e); }
    finally { runBtn.disabled = false; }
  }

  async function save() {
    let path = S.path;
    if (!path) {
      const t = TEMPLATES[S.tpl] || TEMPLATES[S.kind];
      const name = await ask({ title: 'Save into Projects', body: 'Stored encrypted in your box.', value: t.file, ok: 'Save', selectName: true });
      if (!name) return;
      path = `/Projects/${name.trim()}`;
    }
    try {
      const r = await api.post('write', { path, text: ta.value, unique: !S.path });
      S.path = r.path || path; S.dirty = false; win.setDirty(false); win.setTitle(basename(S.path));
      sfx('ok'); notify({ title: 'Saved & encrypted', body: S.path, icon: 'shield', tone: 'good' });
    } catch (e) { fail(e); }
  }
  async function load(path) {
    try {
      ta.value = await api.text(path); lines();
      S.path = path; S.dirty = false; win.setDirty(false); win.setTitle(basename(path));
      S.tpl = KIND_OF(path) === 'web' ? (/preact|react/i.test(ta.value) ? 'react' : 'web') : KIND_OF(path);
      setKind(KIND_OF(path));
      if (S.kind === 'web') run(true);
    } catch (e) { fail(e); }
  }
  async function openFile() {
    try {
      const { items } = await api.get('list', { path: '/Projects' });
      const files = items.filter(i => !i.dir && /\.(html?|py|sql|js|css)$/i.test(i.name));
      if (!files.length) return notify({ title: 'Nothing in Projects yet', body: 'Press Save to keep your first file.', icon: 'folder' });
      const list = h('div', { class: 'pick-list' }, files.map(f => h('button', { class: 'pick-row', onclick: () => { document.querySelector('.sheet .btn.ghost')?.click(); load(f.path); } }, ico('code', 16), h('span', {}, f.name))));
      ask({ title: 'Open from Projects', extra: list, ok: 'Close' });
    } catch (e) { fail(e); }
  }
  win.beforeClose = async () => !S.dirty || !!(await ask({ title: 'Close without saving?', body: 'Your changes will be lost.', ok: 'Close', danger: true }));
  win.getArgs = () => ({ path: S.path });
  win.reopen = a => a?.path && load(a.path);

  if (args.path) load(args.path);
  else { S.tpl = args.template || 'web'; const t = TEMPLATES[S.tpl]; ta.value = t.code; lines(); setKind(KIND_OF(t.file)); win.setTitle(`Studio · ${t.name}`); if (S.kind === 'web') run(true); }
}

register({ id: 'studio', name: 'Studio', icon: 'studio', color: '#6c5ce7', grad: 'linear-gradient(135deg,#74b9ff,#6c5ce7)', size: [1060, 680], mount, blurb: 'HTML, CSS, React, Python, SQL — ready offline' });
