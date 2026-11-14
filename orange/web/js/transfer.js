// Moving files from the computer into the box (drag & drop, file pickers, whole folders).
import { api } from './api.js';
import { emit, notify, fmtSize, sfx, join } from './core.js';

// Turns a drop into [{file, rel}] — folders are walked recursively.
export async function collect(dt) {
  const out = [];
  const entries = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) {
    for (const f of dt.files || []) out.push({ file: f, rel: f.name });
    return out;
  }
  const readAll = dir => new Promise(res => {
    const r = dir.createReader(), all = [];
    const next = () => r.readEntries(batch => { if (!batch.length) return res(all); all.push(...batch); next(); }, () => res(all));
    next();
  });
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej)).catch(() => null);
      if (file) out.push({ file, rel: prefix + entry.name });
    } else if (entry.isDirectory) {
      for (const child of await readAll(entry)) await walk(child, prefix + entry.name + '/');
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

export function pick({ folder = false } = {}) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    if (folder) inp.webkitdirectory = true;
    inp.onchange = () => resolve([...inp.files].map(f => ({ file: f, rel: f.webkitRelativePath || f.name })));
    inp.addEventListener('cancel', () => resolve([]));
    inp.click();
  });
}

let job = 0;
// Encrypts every file into `dest`, one at a time, reporting progress to the Pip.
export async function uploadAll(list, dest) {
  if (!list.length) return [];
  const id = ++job, total = list.reduce((s, x) => s + x.file.size, 0);
  let done = 0, ok = 0;
  const t0 = performance.now();
  const paths = [];
  sfx('drop');
  for (const [i, { file, rel }] of list.entries()) {
    const label = list.length > 1 ? `${i + 1} of ${list.length} · ${file.name}` : file.name;
    emit('progress', { id, label, pct: total ? done / total : i / list.length });
    try {
      const res = await api.upload(join(dest, rel), file, loaded =>
        emit('progress', { id, label, pct: total ? (done + loaded) / total : i / list.length }));
      paths.push(res.path);
      ok++;
    } catch (e) {
      notify({ title: `Couldn’t add ${file.name}`, body: e.message, icon: 'info', tone: 'bad' });
    }
    done += file.size;
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  emit('progress', { id, end: true });
  emit('changed', { path: dest });
  if (ok) {
    sfx('ok');
    notify({ title: `${ok} file${ok > 1 ? 's' : ''} encrypted`, body: `${fmtSize(total)} into ${dest === '/' ? 'Home' : dest.split('/').pop()} in ${secs}s`, icon: 'shield', tone: 'good' });
  }
  return paths;
}
