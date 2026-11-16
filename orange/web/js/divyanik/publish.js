// Publishing House: write a book chapter by chapter (autosaved, encrypted), add a cover and details, accept the
// author agreement (a parent approves for under-18s), send it to an editor, then publish it to the bookshelf,
// export an EPUB ebook or print a PDF. Books live in /DivyaNik/Books/<book>/book.json inside the box.
import { h, sfx, notify, fail, ask, debounce } from '../core.js';
import { api } from '../api.js';
import { today, isMinor, boxHas } from './common.js';

const ROOT = '/DivyaNik/Books';
const CATEGORIES = ['Story', 'Poems', 'Comics & pictures', 'Science', 'History', 'Biography', 'Non-fiction', 'Other'];
const LANGUAGES = [['English', 'en'], ['தமிழ் Tamil', 'ta'], ['हिन्दी Hindi', 'hi'], ['Other', 'und']];
const STATUS = { draft: ['✏️', 'Draft'], submitted: ['📨', 'With the editor'], changes: ['🔁', 'Changes requested'], approved: ['✅', 'Approved'], rejected: ['✖️', 'Not accepted'], published: ['📚', 'Published'] };
const AGREEMENT_VERSION = 'sample-1';
const words = t => (t.match(/\S+/g) || []).length;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mount(el, { data: d }) {
  let book = null, path = null, tab = 'write', ch = 0;
  const writeBook = async () => { book.updated = new Date().toISOString(); await api.post('write', { path, text: JSON.stringify(book, null, 1) }); };
  const autosave = debounce(() => writeBook().then(() => { const s = el.querySelector('.pb-saved'); if (s) s.textContent = 'Saved ✓ encrypted'; }).catch(fail), 900);
  const setStatus = (st, note) => { book.status = st; book.history.push({ status: st, date: today(), note: note || '' }); };

  async function library() {
    book = null;
    let books = [];
    try {
      const has = await boxHas(ROOT);
      const dirs = has ? (await api.get('list', { path: ROOT })).items.filter(i => i.dir) : [];
      books = (await Promise.all(dirs.map(async f => { try { return { path: `${f.path}/book.json`, b: JSON.parse(await api.text(`${f.path}/book.json`)) }; } catch { return null; } }))).filter(Boolean);
    } catch { /* no books yet */ }
    const cover = b => (b.b.cover ? h('img', { src: api.fileUrl(b.b.cover, { v: b.b.updated }), alt: '' }) : h('span', {}, b.b.title));
    const card = x => h('button', { class: 'pb-book', onclick: () => openBook(x.path) }, h('div', { class: 'pb-cover' }, cover(x)), h('b', {}, x.b.title), h('small', {}, `${STATUS[x.b.status][0]} ${STATUS[x.b.status][1]} · ${x.b.chapters.length} chapter${x.b.chapters.length === 1 ? '' : 's'}`));
    const shelf = books.filter(x => x.b.status === 'published');
    el.replaceChildren(
      h('div', { class: 'dn-hero pub' }, h('div', {}, h('h2', {}, '📚 Publishing House'), h('p', {}, 'Write your own book, give it a cover, and send it to an editor. When it is approved, publish it to the bookshelf and export it as an ebook.')),
        h('button', { class: 'btn primary', onclick: newBook }, '✍️ Start a new book')),
      h('div', { class: 'dn-card' }, h('h3', {}, 'My books'), books.length ? h('div', { class: 'pb-books' }, books.map(card)) : h('p', { class: 'muted' }, 'No books yet. Every great author started with a blank page!')),
      shelf.length ? h('div', { class: 'dn-card' }, h('h3', {}, '📖 Bookshelf (published)'), h('div', { class: 'pb-books' }, shelf.map(x => h('button', { class: 'pb-book', onclick: () => { book = x.b; path = x.path; reader(); } }, h('div', { class: 'pb-cover' }, cover(x)), h('b', {}, x.b.title), h('small', {}, `by ${x.b.penName || 'the author'}`))))) : null);
  }

  async function newBook() {
    const title = await ask({ title: 'Name your book', body: 'You can change it later.', value: 'My first book', ok: 'Create' });
    if (!title?.trim()) return;
    try {
      const dir = (await api.post('mkdir', { path: `${ROOT}/${title.trim().replace(/[\\/:*?"<>|]/g, '')}`, unique: true })).path;
      book = { title: title.trim(), penName: '', category: 'Story', language: 'en', ageBand: d.profile.band, description: '', cover: null, chapters: [{ title: 'Chapter 1', text: '' }],
        status: 'draft', history: [{ status: 'draft', date: today(), note: 'Book created' }], comments: [], agreement: null, parent: null, created: today() };
      path = `${dir}/book.json`; await writeBook(); sfx('ok'); tab = 'write'; ch = 0; editor();
    } catch (e) { fail(e); }
  }
  async function openBook(p) { try { book = JSON.parse(await api.text(p)); path = p; tab = 'write'; ch = 0; editor(); } catch (e) { fail(e); } }

  function editor() {
    const locked = ['submitted', 'approved', 'published'].includes(book.status);
    const tabs = [['write', '✍️ Write'], ['details', '🖼️ Details & cover'], ['publish', '🚀 Review & publish']];
    el.replaceChildren(h('div', { class: 'dn-card pb-ed' },
      h('div', { class: 'dn-mission-head' }, h('button', { class: 'tbtn', 'aria-label': 'Back', onclick: library }, '←'), h('div', {}, h('b', {}, book.title), h('small', { class: 'pb-count' }, `${STATUS[book.status][0]} ${STATUS[book.status][1]} · ${book.chapters.reduce((s, c) => s + words(c.text), 0)} words`)), h('div', { class: 'grow' }), h('small', { class: 'pb-saved muted' }, '')),
      h('div', { class: 'arc-chips' }, tabs.map(([id, label]) => h('button', { class: 'arc-chip' + (tab === id ? ' on' : ''), onclick: () => { tab = id; editor(); } }, label))),
      locked && tab !== 'publish' ? h('p', { class: 'dn-warn' }, 'This book is with the editor or published, so it is locked. Ask for changes on the Review tab to edit it again.') : null,
      ({ write: writeTab, details: detailsTab, publish: publishTab })[tab](locked)));
  }

  function writeTab(locked) {
    const list = h('div', { class: 'pb-chapters' }), titleIn = h('input', { class: 'field pb-ch-title', disabled: locked }), text = h('textarea', { class: 'pb-text', disabled: locked, placeholder: 'Once upon a time…' }), count = h('small', { class: 'muted' });
    const paintList = () => list.replaceChildren(...book.chapters.map((c, i) => h('div', { class: 'pb-ch' + (i === ch ? ' on' : '') }, h('button', { onclick: () => { ch = i; load(); } }, `${i + 1}. ${c.title || 'Untitled'}`),
      locked ? null : h('span', {}, h('button', { title: 'Move up', onclick: () => { if (i) { [book.chapters[i - 1], book.chapters[i]] = [book.chapters[i], book.chapters[i - 1]]; ch = i - 1; autosave(); load(); } } }, '↑'),
        h('button', { title: 'Delete chapter', onclick: async () => { if (book.chapters.length > 1 && await ask({ title: `Delete “${c.title}”?`, body: 'Its text will be removed from the book.', ok: 'Delete', danger: true })) { book.chapters.splice(i, 1); ch = Math.max(0, ch - 1); autosave(); load(); } } }, '✕')))),
      locked ? null : h('button', { class: 'btn ghost', onclick: () => { book.chapters.push({ title: `Chapter ${book.chapters.length + 1}`, text: '' }); ch = book.chapters.length - 1; autosave(); load(); } }, '＋ Add a chapter'));
    const load = () => { const c = book.chapters[ch]; titleIn.value = c.title; text.value = c.text; count.textContent = `${words(c.text)} words in this chapter`; paintList(); };
    titleIn.oninput = () => { book.chapters[ch].title = titleIn.value; autosave(); paintList(); };
    text.oninput = () => { book.chapters[ch].text = text.value; count.textContent = `${words(text.value)} words in this chapter`; const pc = el.querySelector('.pb-count'); if (pc) pc.textContent = `${STATUS[book.status][0]} ${STATUS[book.status][1]} · ${book.chapters.reduce((t, c) => t + words(c.text), 0)} words`; el.querySelector('.pb-saved').textContent = 'Saving…'; autosave(); };
    load();
    return h('div', { class: 'pb-write' }, list, h('div', { class: 'pb-page' }, titleIn, text, count));
  }

  function detailsTab(locked) {
    const field = (label, input, hint) => h('label', { class: 'pb-field' }, h('b', {}, label), input, hint ? h('small', { class: 'muted' }, hint) : null);
    const inp = (key, ph) => h('input', { class: 'field', value: book[key] || '', placeholder: ph, disabled: locked, oninput: e => { book[key] = e.target.value; autosave(); } });
    const sel = (key, opts) => h('select', { class: 'field', disabled: locked, onchange: e => { book[key] = e.target.value; autosave(); } }, opts.map(([label, v]) => h('option', { value: v, selected: book[key] === v }, label)));
    const coverBox = h('div', { class: 'pb-cover big' }, book.cover ? h('img', { src: api.fileUrl(book.cover, { v: Date.now() }), alt: 'cover' }) : h('span', {}, 'No cover yet')), coverNote = h('small', { class: 'muted' });
    const useCover = p => { book.cover = p; autosave(); coverBox.replaceChildren(h('img', { src: api.fileUrl(p, { v: Date.now() }), alt: 'cover', onload: e => { const im = e.target; coverNote.textContent = im.naturalWidth < 600 || im.naturalHeight < 800 ? `⚠️ ${im.naturalWidth}×${im.naturalHeight}: a cover of at least 600×800 looks sharper.` : `✓ ${im.naturalWidth}×${im.naturalHeight}`; } })); };
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 15 * 1048576) return fail(new Error('Please use a cover smaller than 15 MB.')); try { useCover((await api.upload(`${path.replace(/\/book\.json$/, '')}/cover${f.name.match(/\.\w+$/)?.[0] || '.png'}`, f, null, true)).path); } catch (er) { fail(er); } } });
    const fromBox = async () => { try { const pics = (await api.get('list', { path: '/Pictures' })).items.filter(i => /\.(png|jpe?g|webp)$/i.test(i.name)); const list = h('div', { class: 'pick-list' }, pics.map(p => h('button', { class: 'pick-row', onclick: () => { document.querySelector('.sheet .btn.ghost')?.click(); useCover(p.path); } }, p.name))); ask({ title: 'Choose a cover from Pictures', extra: list, ok: 'Close' }); } catch (e) { fail(e); } };
    return h('div', { class: 'pb-details' },
      h('div', {}, field('Title', inp('title', 'Book title')), field('Pen name', inp('penName', 'The name readers will see'), isMinor(d) ? 'Use a pen name, not your real name.' : 'Your name or a pen name.'),
        field('Category', sel('category', CATEGORIES.map(c => [c, c]))), field('Language', sel('language', LANGUAGES)),
        field('About the book', h('textarea', { class: 'field dn-text', disabled: locked, placeholder: 'A few sentences for the back cover', oninput: e => { book.description = e.target.value; autosave(); } }, book.description || ''))),
      h('div', { class: 'pb-cover-side' }, coverBox, coverNote, locked ? null : h('div', { class: 'nm-btns' }, h('button', { class: 'btn', onclick: fromBox }, 'From Pictures'), h('button', { class: 'btn', onclick: () => file.click() }, 'Upload'), file)));
  }

  function publishTab() {
    const minor = isMinor(d), total = book.chapters.reduce((s, c) => s + words(c.text), 0);
    const checks = [[!!book.title.trim(), 'The book has a title'], [!!book.penName.trim(), 'A pen name is set (Details tab)'], [total >= 50, `At least 50 words written (${total} so far)`], [!!book.agreement, 'The author agreement is accepted'], [!minor || !!book.parent, 'A parent has approved (for under-18 authors)']];
    const ready = checks.every(c => c[0]);
    const steps = ['draft', 'submitted', 'approved', 'published'], at = book.status === 'changes' ? 0 : book.status === 'rejected' ? 1 : steps.indexOf(book.status);
    const agree = h('label', { class: 'dn-check' }, h('input', { type: 'checkbox', checked: !!book.agreement, disabled: book.status !== 'draft' && book.status !== 'changes', onchange: e => { book.agreement = e.target.checked ? { by: d.profile.name, date: today(), version: AGREEMENT_VERSION } : null; autosave(); editor(); } }),
      h('span', {}, 'I wrote this book myself. I have permission for every picture I used, and I agree to the DivyaNik author agreement (content rights, originality, revenue share if any, and how to withdraw the book). ', h('small', { class: 'muted' }, `Sample text: DivyaNik's lawyer-approved agreement replaces it. Version ${AGREEMENT_VERSION}.`)));
    const parentName = h('input', { class: 'field', placeholder: 'Parent or guardian\'s name', value: book.parent?.by || '' });
    const parent = minor ? h('div', { class: 'pb-parent' }, h('b', {}, '👪 Parent approval'), h('p', { class: 'muted' }, 'A parent or guardian checks the book and approves publishing it under the pen name. Nothing leaves draft without this.'),
      book.parent ? h('p', {}, `✅ Approved by ${book.parent.by} on ${book.parent.date} (terms ${book.parent.version})`) : h('div', { class: 'nm-btns' }, parentName, h('button', { class: 'btn', onclick: () => { if (!parentName.value.trim()) return parentName.focus(); book.parent = { by: parentName.value.trim(), date: today(), version: AGREEMENT_VERSION }; autosave(); sfx('ok'); editor(); } }, 'I approve'))) : null;
    const comment = h('input', { class: 'field', placeholder: 'Editor\'s comment for the author' });
    const act = (st, note, msg) => { setStatus(st, note || comment.value.trim()); if (comment.value.trim()) book.comments.push({ by: 'Editor', text: comment.value.trim(), date: today() }); writeBook().then(() => { sfx('ok'); notify({ title: msg, icon: 'check', tone: 'good' }); editor(); }).catch(fail); };
    return h('div', { class: 'pb-pub' },
      h('ol', { class: 'dn-stages' }, ['Draft', 'With the editor', 'Approved', 'Published'].map((s, i) => h('li', { class: i < at ? 'done' : i === at ? 'on' : '' }, s))),
      book.status === 'changes' ? h('p', { class: 'dn-warn' }, '🔁 The editor asked for changes. Edit the book, then send it again.') : null,
      book.status === 'rejected' ? h('p', { class: 'dn-warn' }, '✖️ The editor did not accept this version. Read the comments below.') : null,
      ['draft', 'changes'].includes(book.status) ? h('div', {}, h('h3', {}, 'Before you send it'), h('ul', { class: 'pb-checks' }, checks.map(([ok, t]) => h('li', { class: ok ? 'ok' : '' }, `${ok ? '✅' : '⬜'} ${t}`))), agree, parent,
        h('button', { class: 'btn primary', disabled: !ready, onclick: () => act('submitted', 'Sent to the editor', 'Sent to the editor 📨') }, 'Send to the editor')) : null,
      book.status === 'submitted' ? h('div', { class: 'pb-editor' }, h('h3', {}, '🧑‍💼 Editor\'s desk'), h('p', { class: 'muted' }, 'For the editor. Read the book (use “Read it”), then decide. Plagiarism screening needs the DivyaNik platform\'s external service and an editor\'s judgement, so it is not done here.'),
        comment, h('div', { class: 'nm-btns' }, h('button', { class: 'btn primary', onclick: () => act('approved', '', 'Approved ✅') }, 'Approve'), h('button', { class: 'btn', onclick: () => act('changes', '', 'Changes requested') }, 'Ask for changes'), h('button', { class: 'btn ghost', onclick: () => act('rejected', '', 'Marked as not accepted') }, 'Not accepted'))) : null,
      book.status === 'approved' ? h('div', {}, h('p', {}, '✅ Approved! Publish it to the Orange bookshelf.'), h('button', { class: 'btn primary', onclick: () => act('published', 'Published to the bookshelf', 'Published 📚') }, '📚 Publish')) : null,
      ['rejected', 'published'].includes(book.status) ? h('button', { class: 'btn ghost', onclick: () => act('changes', 'Reopened for editing', 'Reopened for editing') }, 'Reopen for editing') : null,
      h('h3', {}, 'Files'), h('div', { class: 'nm-btns' }, h('button', { class: 'btn', onclick: reader }, '📖 Read it'), h('button', { class: 'btn', onclick: epub }, '📘 Export EPUB ebook'), h('button', { class: 'btn', onclick: printable }, '🖨️ Print / save as PDF')),
      book.comments.length ? h('div', {}, h('h3', {}, 'Comments'), ...book.comments.map(c => h('p', { class: 'pb-comment' }, h('b', {}, `${c.by} · ${c.date}: `), c.text))) : null,
      h('details', {}, h('summary', {}, 'History'), h('ul', {}, book.history.map(x => h('li', {}, `${x.date} · ${STATUS[x.status][1]}${x.note ? ` · ${x.note}` : ''}`)))));
  }

  async function epub() {
    try { await writeBook(); const r = await api.post('epub', { path }); sfx('ok'); notify({ title: 'Ebook saved 📘', body: r.path, icon: 'archive', tone: 'good' }); } catch (e) { fail(e); }
  }
  async function coverData() {
    if (!book.cover) return '';
    try { const b = await (await fetch(api.fileUrl(book.cover), { credentials: 'same-origin' })).blob(); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); } catch { return ''; }
  }
  function bookHtml(img, print) {
    const paras = t => t.split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    return `<!doctype html><html lang="${book.language}"><head><meta charset="utf-8"><title>${esc(book.title)}</title><style>
      body{font:17px/1.7 Georgia,"Nirmala UI","Noto Sans Tamil",serif;color:#222;max-width:640px;margin:0 auto;padding:32px 24px;background:#fffdf8}
      h1{font-size:34px;text-align:center;margin:.2em 0}.by{text-align:center;color:#666;margin-bottom:2em}.cover{display:block;max-width:70%;margin:0 auto 24px;border-radius:8px}
      h2{margin-top:2.4em;page-break-before:always}.blurb{font-style:italic;color:#555;text-align:center}.bar{position:sticky;top:0;text-align:right}
      button{font:600 14px system-ui;padding:8px 16px;border-radius:999px;border:0;background:#ff8a1f;color:#fff;cursor:pointer}
      @page{size:A5;margin:18mm}@media print{.bar{display:none}body{background:#fff;padding:0}}</style></head><body>
      ${print ? '<div class="bar"><button onclick="print()">Print or save as PDF</button></div>' : ''}
      ${img ? `<img class="cover" src="${img}" alt="">` : ''}<h1>${esc(book.title)}</h1><div class="by">by ${esc(book.penName || 'the author')}</div>
      ${book.description ? `<p class="blurb">${esc(book.description)}</p>` : ''}${book.chapters.map(c => `<h2>${esc(c.title)}</h2>${paras(c.text)}`).join('')}</body></html>`;
  }
  async function preview(print) {
    try {
      const { url } = await api.post('play', { html: bookHtml(await coverData(), print) });
      el.replaceChildren(h('div', { class: 'dn-card pb-reader' }, h('div', { class: 'dn-mission-head' }, h('button', { class: 'tbtn', 'aria-label': 'Back', onclick: () => (book.status === 'published' && tab !== 'publish' ? library() : editor()) }, '←'), h('b', {}, book.title)),
        h('iframe', { class: 'pb-frame', src: url, title: book.title, sandbox: 'allow-scripts allow-modals' })));
    } catch (e) { fail(e); }
  }
  const reader = () => preview(false), printable = () => preview(true);

  library();
}
