// Orange desktop entry point.
import { api } from './api.js';
import { state, loadSettings, applyLook, DEFAULTS } from './core.js';
import './apps/files.js';
import './apps/code.js';
import './apps/terminal.js';
import './apps/lens.js';
import './apps/settings.js';
import { start } from './desktop.js';

history.replaceState(null, '', '/');   // drop the one-time secret from the address

(async () => {
  try {
    const st = await api.get('state');
    state.name = st.name;
    state.version = st.version;
    state.info = st;
    if (st.locked) {
      state.settings = { ...DEFAULTS };
      applyLook();
      return start(true);
    }
    await loadSettings();
    await start(false);
  } catch (e) {
    document.getElementById('boot').innerHTML =
      '<div class="boot-in"><div class="boot-line">Orange is locked. Open it from your terminal by typing <b>orange</b>.</div></div>';
    document.getElementById('boot').classList.add('run');
  }
})();
