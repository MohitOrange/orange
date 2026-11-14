// Code: a calm editor for code and notes. It saves (and re-encrypts) by itself as you type.
import { api } from '../api.js';
import { h, icon, ico, notify, fail, ask, sfx, fmtWhen, kindOf, isTextKind, basename, dirname, join, extOf, logo, debounce, state } from '../core.js';
import { register, launch } from '../registry.js';

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- highlighting
const KW = {
  js: 'const let var function return if else for while do switch case break continue new class extends import from export default async await try catch finally throw typeof instanceof in of this null undefined true false yield static get set super delete void',
  py: 'def return if elif else for while in not and or is None True False class import from as with try except finally raise lambda yield pass break continue global nonlocal async await self print match case',
  c: 'int float double char void bool long short unsigned signed true false if else for while do switch case break continue return struct class public private protected internal static const readonly new delete using namespace include define template typename auto virtual override abstract sealed null nullptr string var let fn mut impl pub use mod enum match loop func package defer interface type this base self extends implements import throws throw try catch finally async await yield in out ref foreach where',
  sh: 'if then else elif fi for in do done while until case esac function return export local echo exit set unset source alias cd',
  json: 'true false null',
};
const LANG = {
  js: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', jsx: 'js', vue: 'js', svelte: 'js', json: 'json',
  py: 'py', gd: 'py', rb: 'py', yml: 'yaml', yaml: 'yaml', toml: 'yaml', ini: 'yaml', cfg: 'yaml', conf: 'yaml', env: 'yaml',
  c: 'c', h: 'c', cpp: 'c', hpp: 'c', cc: 'c', cs: 'c', java: 'c', rs: 'c', go: 'c', kt: 'c', swift: 'c', dart: 'c', php: 'c', lua: 'c',
  glsl: 'c', hlsl: 'c', shader: 'c', gdshader: 'c', sql: 'c',
  sh: 'sh', bash: 'sh', zsh: 'sh', bat: 'sh', cmd: 'sh', ps1: 'sh',
  html: 'html', htm: 'html', xml: 'html', svg: 'html', css: 'css', scss: 'css', sass: 'css', less: 'css', md: 'md', markdown: 'md',
};
const NAMES = { js: 'JavaScript', json: 'JSON', py: 'Python', yaml: 'Config', c: 'C-style', sh: 'Shell', html: 'HTML', css: 'CSS', md: 'Markdown', txt: 'Plain text' };
const STR = String.raw`(?<s>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|` + '`' + String.raw`(?:\\.|[^` + '`' + String.raw`\\])*` + '`)';
const NUM = String.raw`(?<n>\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b)`;
const WORD = String.raw`(?<w>\b[A-Za-z_$][\w$]*\b)`;
const SPEC = {};
function spec(lang) {
  if (SPEC[lang]) return SPEC[lang];
  let parts;
  const slashC = String.raw`(?<c>\/\/[^\n]*|\/\*[\s\S]*?\*\/)`, hashC = String.raw`(?<c>#[^\n]*)`;
  if (lang === 'js' || lang === 'c' || lang === 'json') parts = [slashC, STR, NUM, WORD];
  else if (lang === 'py' || lang === 'sh' || lang === 'yaml') parts = [hashC, STR, NUM, WORD];
  else if (lang === 'css') parts = [String.raw`(?<c>\/\*[\s\S]*?\*\/)`, STR, String.raw`(?<t>[.#]?[A-Za-z][\w-]*(?=\s*[{,]))`, String.raw`(?<h>[a-z-]+(?=\s*:))`, NUM];
  else if (lang === 'html') parts = [String.raw`(?<c><!--[\s\S]*?-->)`, STR, String.raw`(?<t><\/?[A-Za-z][\w:-]*|\/?>)`, String.raw`(?<h>\b[a-z-]+(?==))`];
  else if (lang === 'md') parts = [String.raw`(?<t>^#{1,6} [^\n]*)`, String.raw`(?<s>` + '`[^`\\n]+`' + `)`, String.raw`(?<k>\*\*[^*\n]+\*\*|__[^_\n]+__)`, String.raw`(?<h>^\s*(?:[-*+]|\d+\.) )`, String.raw`(?<c>^\s*>[^\n]*)`];
  else return null;
  return (SPEC[lang] = { re: new RegExp(parts.join('|'), 'gm'), kw: new Set((KW[lang === 'yaml' ? 'py' : lang] || '').split(' ')) });
}
function highlight(src, lang) {
  const L = spec(lang);
  if (!L || src.length > 160000) return esc(src);
  let out = '', last = 0, m;
  L.re.lastIndex = 0;
  while ((m = L.re.exec(src))) {
    if (!m[0]) { L.re.lastIndex++; continue; }
    out += esc(src.slice(last, m.index));
    const g = m.groups, t = m[0];
    let cls = g.c ? 'c' : g.s ? 's' : g.n ? 'n' : g.t ? 't' : g.h ? 'h' : g.k ? 'k' : null;
    if (g.w) cls = L.kw.has(t) ? 'k' : src[L.re.lastIndex] === '(' ? 'f' : /^[A-Z]/.test(t) && lang !== 'json' ? 'y' : null;
    out += cls ? `<span class="tk-${cls}">${esc(t)}</span>` : esc(t);
    last = L.re.lastIndex;
  }
  return out + esc(src.slice(last));
}

// ---------------------------------------------------------------- tiny, safe Markdown renderer (for preview)
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}
export function markdown(src) {
  const lines = esc(src).split('\n');
  let html = '', code = false, list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    if (raw.trimStart().startsWith('```')) { if (code) { html += '</code></pre>'; code = false; } else { closeList(); html += '<pre><code>'; code = true; } continue; }
    if (code) { html += raw + '\n'; continue; }
    let m;
    if ((m = raw.match(/^(#{1,6})\s+(.*)/))) { closeList(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = raw.match(/^\s*[-*+]\s+(?:\[( |x)\]\s+)?(.*)/))) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${m[1] ? (m[1] === 'x' ? '☑ ' : '☐ ') : ''}${inline(m[2])}</li>`; }
    else if ((m = raw.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if (/^\s*&gt;\s?/.test(raw)) { closeList(); html += `<blockquote>${inline(raw.replace(/^\s*&gt;\s?/, ''))}</blockquote>`; }
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(raw)) { closeList(); html += '<hr>'; }
    else if (!raw.trim()) closeList();
    else { closeList(); html += `<p>${inline(raw)}</p>`; }
  }
  if (code) html += '</code></pre>';
  closeList();
  return html;
}

// ---------------------------------------------------------------- the window
async function startView(win) {
  win.setTitle('Code');
  const recent = h('div', { class: 'cs-recent' }, h('small', {}, 'Loading recent files…'));
  const newFile = async () => {
    const name = await ask({ title: 'New file', body: 'Saved in Projects. The extension picks the colours (main.py, index.html, notes.md…).', value: 'untitled.md', ok: 'Create', selectName: true });
    if (!name) return;
    const path = join('/Projects', name.trim());
    try { await api.post('write', { path, text: '' }); win.body.replaceChildren(); openFile(win, path); } catch (e) { fail(e); }
  };
  win.body.replaceChildren(h('div', { class: 'code-start' },
    h('div', { class: 'cs-hero' }, h('span', { class: 'cs-logo', html: icon('code', 40) }), h('h2', {}, 'Code'), h('p', {}, 'Write code and notes. Every keystroke is saved and encrypted. There’s no Save button to forget.')),
    h('div', { class: 'cs-acts' }, h('button', { class: 'btn primary', onclick: newFile }, ico('plus', 16), 'New file'),
      h('button', { class: 'btn', onclick: () => launch('files', { path: '/Projects' }) }, ico('folder', 16), 'Browse Projects')),
    h('div', { class: 'cs-h' }, 'Jump back in'), recent));
  try {
    const { items } = await api.get('recent', { n: 40 });
    const texts = items.filter(i => isTextKind(kindOf(i.name))).slice(0, 7);
    recent.replaceChildren(...(texts.length ? texts.map(i => h('button', { class: 'cs-row', onclick: () => { win.body.replaceChildren(); openFile(win, i.path); } },
      ico(kindOf(i.name) === 'code' ? 'code' : 'text', 16), h('b', {}, i.name), h('span', {}, dirname(i.path)), h('em', {}, fmtWhen(i.mtime))))
      : [h('small', {}, 'No code or notes yet. Create one above.')]));
  } catch { /* ignore */ }
}

async function openFile(win, path) {
  const ext = extOf(basename(path)), lang = LANG[ext] || 'txt';
  win.setTitle(basename(path));
  win.getArgs = () => ({ path });
  const S = { path, wrap: lang === 'md' || lang === 'txt', size: state.settings.codeSize || 14, preview: false, saved: '', pending: false, lastSave: 0 };

  const gutter = h('pre', { class: 'ed-gutter', 'aria-hidden': 'true' });
  const hl = h('code');
  const pre = h('pre', { class: 'ed-hl', 'aria-hidden': 'true' }, hl);
  const ta = h('textarea', { class: 'ed-ta', spellcheck: lang === 'md' || lang === 'txt' ? 'true' : 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': `Editing ${basename(path)}` });
  const wrap = h('div', { class: 'ed-wrap' }, pre, ta);
  const prev = h('div', { class: 'ed-prev', hidden: true });
  const ed = h('div', { class: 'ed' + (S.wrap ? ' wrap' : ''), style: { '--fs': S.size + 'px' } }, gutter, wrap, prev);
  const tbtn = (i, t, fn, extra = '') => h('button', { class: 'tbtn ' + extra, title: t, 'aria-label': t, html: icon(i), onclick: fn });
  const saveLbl = h('span', { class: 'save-state' });
  const prevBtn = (lang === 'md' || lang === 'html') ? tbtn('preview', 'Live preview', () => togglePreview()) : null;
  const tb = h('header', { class: 'tb', 'data-drag': '' },
    h('span', { class: 'lang-pill' }, NAMES[lang] || ext.toUpperCase() || 'Text'),
    h('span', { class: 'tb-path' }, dirname(path) === '/' ? 'Home' : dirname(path)),
    h('div', { class: 'grow' }), saveLbl,
    tbtn('minus', 'Smaller text (Ctrl+-)', () => font(-1)), tbtn('plus', 'Bigger text (Ctrl+=)', () => font(1)),
    tbtn('wrap', 'Wrap long lines', () => { S.wrap = !S.wrap; ed.classList.toggle('wrap', S.wrap); paint(); }),
    prevBtn,
    tbtn('download', 'Export a decrypted copy', () => { const a = h('a', { href: api.fileUrl(path, { dl: true }) }); document.body.append(a); a.click(); a.remove(); }));
  win.body.replaceChildren(h('div', { class: 'code' }, tb, ed));

  try { ta.value = await api.text(path); } catch (e) { fail(e); }
  S.saved = ta.value;
  paint(); caret(); setSave('saved');
  ta.focus();
  ta.setSelectionRange(0, 0);

  function font(d) { S.size = Math.max(10, Math.min(28, S.size + d)); ed.style.setProperty('--fs', S.size + 'px'); state.settings.codeSize = S.size; }
  function paint() {
    const v = ta.value;
    hl.innerHTML = highlight(v, lang) + '\n ';
    const n = v.split('\n').length;
    if (gutter.dataset.n != n) { gutter.dataset.n = n; gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
    sync();
    if (S.preview) renderPreview();
  }
  function sync() { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop; }
  function caret() {
    const before = ta.value.slice(0, ta.selectionStart), line = before.split('\n').length, col = before.length - before.lastIndexOf('\n');
    const words = (ta.value.match(/\S+/g) || []).length;
    win.setStatus(h('span', {}, `Ln ${line}, Col ${col}`, h('em', {}, ` · ${words} words · UTF-8`)));
  }
  function setSave(st) {
    S.pending = st === 'pending';
    win.setDirty(st === 'pending' || st === 'saving');
    saveLbl.className = 'save-state ' + st;
    saveLbl.innerHTML = st === 'saved' ? icon('shield', 14) + '<span>Saved · encrypted</span>' : st === 'saving' ? '<span>Encrypting…</span>' : st === 'error' ? '<span>Not saved — retrying</span>' : '<span>Editing…</span>';
  }
  async function save() {
    if (ta.value === S.saved) return setSave('saved');
    const text = ta.value;
    setSave('saving');
    try { await api.post('write', { path, text }); S.saved = text; setSave(ta.value === text ? 'saved' : 'pending'); if (ta.value !== text) autosave(); }
    catch (e) { setSave('error'); setTimeout(autosave, 2000); }
  }
  const autosave = debounce(save, 650);
  function togglePreview() {
    S.preview = !S.preview;
    prev.hidden = !S.preview;
    ed.classList.toggle('previewing', S.preview);
    prevBtn?.classList.toggle('on', S.preview);
    if (S.preview) renderPreview();
  }
  const renderPreview = debounce(() => {
    if (lang === 'md') prev.innerHTML = `<article class="md">${markdown(ta.value)}</article>`;
    else {
      let fr = prev.querySelector('iframe');
      if (!fr) { fr = h('iframe', { sandbox: '', title: 'Preview (scripts are off for safety)' }); prev.replaceChildren(fr); }
      fr.srcdoc = ta.value;
    }
  }, 150);
  const insert = text => { if (!document.execCommand('insertText', false, text)) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); };

  ta.addEventListener('input', () => { paint(); caret(); setSave('pending'); autosave(); });
  ta.addEventListener('scroll', sync);
  ta.addEventListener('keyup', caret);
  ta.addEventListener('click', caret);
  ta.addEventListener('keydown', e => {
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && k.toLowerCase() === 's') { e.preventDefault(); save().then(() => { sfx('ok'); notify({ title: 'Saved & encrypted', body: basename(path), icon: 'shield', tone: 'good' }); }); }
    else if (mod && (k === '=' || k === '+')) { e.preventDefault(); font(1); }
    else if (mod && k === '-') { e.preventDefault(); font(-1); }
    else if (k === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
      if (s === en && !e.shiftKey) return insert('    ');
      const ls = v.lastIndexOf('\n', s - 1) + 1, block = v.slice(ls, en);
      const out = e.shiftKey ? block.replace(/^( {1,4}|\t)/gm, '') : block.replace(/^/gm, '    ');
      ta.setSelectionRange(ls, en); insert(out); ta.setSelectionRange(ls, ls + out.length);
    } else if (k === 'Enter' && !mod) {
      const s = ta.selectionStart, v = ta.value, ls = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(ls, s);
      let ind = line.match(/^[ \t]*/)[0];
      if (/[:{[(]\s*$/.test(line)) ind += '    ';
      const bullet = lang === 'md' && line.match(/^(\s*)([-*+]|\d+\.)\s+(\[[ x]\]\s+)?/);
      e.preventDefault();
      if (bullet && line.trim() === bullet[0].trim()) { ta.setSelectionRange(ls, s); insert(''); return; }
      insert('\n' + ind + (bullet ? (bullet[2].match(/\d/) ? `${parseInt(bullet[2]) + 1}. ` : bullet[2] + ' ') + (bullet[3] ? '[ ] ' : '') : ''));
    } else if (!mod && '([{"\''.includes(k) && ta.selectionStart !== ta.selectionEnd) {
      e.preventDefault();
      const pair = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" }[k], s = ta.selectionStart, en = ta.selectionEnd;
      insert(k + ta.value.slice(s, en) + pair); ta.setSelectionRange(s + 1, en + 1);
    }
  });
  win.beforeClose = async () => { if (ta.value !== S.saved) await save(); return true; };
  win.onLock = () => (ta.value !== S.saved ? save() : null);
}

function mount(win, args) {
  if (args.path) return openFile(win, args.path);
  return startView(win);
}

register({ id: 'code', name: 'Code', icon: 'code', color: '#7bd84a', grad: 'linear-gradient(135deg,#b6f36a,#3aa655)', size: [900, 620], mount, blurb: 'Code & notes, saved as you type' });
