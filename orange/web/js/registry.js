// App registry: every app describes itself once; the rail, Segments and search all read from here.
import { Win, wins } from './wm.js';
import { fail } from './core.js';

export const apps = {};
export const register = app => { apps[app.id] = app; };

export async function launch(id, args = {}, origin) {
  const app = apps[id];
  if (!app) return null;
  if (app.single) {
    const w = [...wins.values()].find(x => x.app.id === id);
    if (w) {
      if (w.state === 'min') w.restore(); else w.focus();
      w.reopen?.(args);
      return w;
    }
  }
  const win = new Win(app, { args, title: app.name, ...(args._rect || {}) });
  try {
    const p = app.mount(win, args);
    win.show(origin);
    await p;
  } catch (e) {
    fail(e);
  }
  return win;
}

// Opens a file with the right app.
export function openPath(item, origin) {
  return apps.files.openItem(item, origin);
}
