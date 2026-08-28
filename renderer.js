'use strict';

const STORAGE_KEY = 'whatnot-multiview.state.v1';
const PARTITION = 'persist:whatnot';
const WHATNOT_HOME = 'https://www.whatnot.com/';
const WHATNOT_LOGIN = 'https://www.whatnot.com/login';

/*
 * In die Streamseite injizierter Lautstaerkeregler.
 * Whatnot baut das <video> beim Reconnect neu auf, deshalb haelt ein Intervall
 * plus MutationObserver den eingestellten Pegel dauerhaft fest.
 */
const AUDIO_HOOK = [
  '(() => {',
  '  if (window.__mvAudio) return true;',
  '  const state = { vol: 1 };',
  '  const apply = () => {',
  '    document.querySelectorAll("video, audio").forEach((el) => {',
  '      try {',
  '        if (Math.abs(el.volume - state.vol) > 0.001) el.volume = state.vol;',
  '        if (el.muted && state.vol > 0) el.muted = false;',
  '      } catch (e) {}',
  '    });',
  '  };',
  '  window.__mvAudio = {',
  '    set(v) { state.vol = Math.max(0, Math.min(1, v)); apply(); },',
  '  };',
  '  setInterval(apply, 500);',
  '  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });',
  '  apply();',
  '  return true;',
  '})();',
].join('\n');

const state = {
  streams: [],
  masterVolume: 70,
  masterMuted: false,
  soloId: null,
  focusId: null,
  cols: 'auto',
  theme: 'dark',
};

/** id -> { stream, el, webview, ready, ... } */
const tiles = new Map();

const dom = {
  grid: document.getElementById('grid'),
  addForm: document.getElementById('add-form'),
  addInput: document.getElementById('add-input'),
  layoutGroup: document.getElementById('layout-group'),
  masterMute: document.getElementById('master-mute'),
  masterVolume: document.getElementById('master-volume'),
  masterVolumeValue: document.getElementById('master-volume-value'),
  themeToggle: document.getElementById('theme-toggle'),
  statusCount: document.getElementById('status-count'),
  openWhatnot: document.getElementById('open-whatnot'),
  openLogin: document.getElementById('open-login'),
  openLoginEmpty: document.getElementById('open-login-empty'),
};

/* ------------------------------------------------------------------ */
/* Persistenz                                                          */
/* ------------------------------------------------------------------ */

function save() {
  const payload = {
    streams: state.streams.map((s) => ({
      id: s.id, url: s.url, title: s.title, volume: s.volume, muted: s.muted,
    })),
    masterVolume: state.masterVolume,
    masterMuted: state.masterMuted,
    cols: state.cols,
    theme: state.theme,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Konnte Zustand nicht speichern', e);
  }
}

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return;
  }
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data.streams)) {
      state.streams = data.streams
        .filter((s) => s && typeof s.url === 'string')
        .map((s) => ({
          id: s.id || nextId(),
          url: s.url,
          title: s.title || hostLabel(s.url),
          volume: clamp(Number(s.volume), 0, 100, 100),
          muted: Boolean(s.muted),
        }));
    }
    state.masterVolume = clamp(Number(data.masterVolume), 0, 100, 70);
    state.masterMuted = Boolean(data.masterMuted);
    state.cols = ['auto', '1', '2', '3', '4'].includes(data.cols) ? data.cols : 'auto';
    state.theme = data.theme === 'light' ? 'light' : 'dark';
  } catch (e) {
    console.warn('Gespeicherter Zustand unlesbar', e);
  }
}

/* ------------------------------------------------------------------ */
/* Helfer                                                              */
/* ------------------------------------------------------------------ */

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return 's' + Date.now().toString(36) + idCounter;
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function hostLabel(url) {
  try {
    const u = new URL(url);
    return (u.pathname === '/' ? u.hostname : u.pathname.replace(/^\//, '')).slice(0, 60);
  } catch (e) {
    return url;
  }
}

/**
 * Nimmt einen vollen Link, eine Domain ohne Schema oder einen blossen
 * Whatnot-Usernamen entgegen.
 */
function normalizeInput(raw) {
  const input = raw.trim();
  if (!input) return null;
  if (/^https?:\/\//i.test(input)) return input;
  if (/^(www\.)?whatnot\.com\//i.test(input)) {
    return 'https://' + input.replace(/^(www\.)?/i, 'www.');
  }
  if (/^@?[a-z0-9._-]{2,40}$/i.test(input)) {
    return 'https://www.whatnot.com/user/' + input.replace(/^@/, '');
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Tonsteuerung                                                        */
/* ------------------------------------------------------------------ */

/** Ist diese Kachel gerade hoerbar? Solo schlaegt Einzel-Mute, Master schlaegt alles. */
function isAudible(stream) {
  if (state.masterMuted) return false;
  if (state.soloId !== null) return state.soloId === stream.id;
  return !stream.muted;
}

function effectiveVolume(stream) {
  if (!isAudible(stream)) return 0;
  return (stream.volume / 100) * (state.masterVolume / 100);
}

function applyAudio(entry) {
  if (!entry || !entry.ready) return;
  const audible = isAudible(entry.stream);
  const vol = effectiveVolume(entry.stream);
  try {
    entry.webview.setAudioMuted(!audible);
    entry.webview
      .executeJavaScript('window.__mvAudio && window.__mvAudio.set(' + vol.toFixed(4) + ')', true)
      .catch(() => { /* Seite laedt gerade neu */ });
  } catch (e) {
    /* webview noch nicht bereit */
  }
}

function applyAllAudio() {
  tiles.forEach((entry) => applyAudio(entry));
}

/* ------------------------------------------------------------------ */
/* Kachel-Aufbau                                                       */
/* ------------------------------------------------------------------ */

function buildTile(stream) {
  const el = document.createElement('section');
  el.className = 'tile';
  el.dataset.id = stream.id;

  const header = document.createElement('header');
  header.className = 'tile-header';
  header.draggable = true;

  const title = document.createElement('div');
  title.className = 'tile-title';
  title.textContent = stream.title;
  title.title = stream.url;

  const audio = document.createElement('div');
  audio.className = 'tile-audio';

  const muteBtn = document.createElement('button');
  muteBtn.className = 'tile-btn';
  muteBtn.title = 'Stumm / laut';

  const volume = document.createElement('input');
  volume.className = 'slider';
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.value = String(stream.volume);
  volume.title = 'Lautstaerke dieser Kachel';

  const volumeValue = document.createElement('span');
  volumeValue.className = 'value';
  volumeValue.textContent = String(stream.volume);

  audio.append(muteBtn, volume, volumeValue);

  const soloBtn = document.createElement('button');
  soloBtn.className = 'tile-btn';
  soloBtn.textContent = 'S';
  soloBtn.title = 'Nur diesen Stream hoeren (Solo)';

  const focusBtn = document.createElement('button');
  focusBtn.className = 'tile-btn';
  focusBtn.textContent = '⛶';
  focusBtn.title = 'Gross / zurueck ins Raster';

  const reloadBtn = document.createElement('button');
  reloadBtn.className = 'tile-btn';
  reloadBtn.textContent = '⟳';
  reloadBtn.title = 'Neu laden';

  const externalBtn = document.createElement('button');
  externalBtn.className = 'tile-btn';
  externalBtn.textContent = '↗';
  externalBtn.title = 'Im Browser oeffnen';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'tile-btn danger';
  removeBtn.textContent = '✕';
  removeBtn.title = 'Kachel entfernen';

  header.append(title, audio, soloBtn, focusBtn, reloadBtn, externalBtn, removeBtn);

  const body = document.createElement('div');
  body.className = 'tile-body';

  const webview = document.createElement('webview');
  webview.setAttribute('partition', PARTITION);
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('src', stream.url);

  const error = document.createElement('div');
  error.className = 'tile-error';
  const errorText = document.createElement('div');
  errorText.textContent = 'Stream konnte nicht geladen werden.';
  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn';
  retryBtn.textContent = 'Erneut versuchen';
  error.append(errorText, retryBtn);

  body.append(webview, error);
  el.append(header, body);

  const entry = {
    stream, el, webview, title, volume, volumeValue, muteBtn, soloBtn, ready: false,
  };

  /* --- Bedienelemente der Kachel --- */

  muteBtn.addEventListener('click', () => {
    stream.muted = !stream.muted;
    // Lautschalten bei fremdem Solo hebt das Solo auf, sonst passiert
    // scheinbar nichts.
    if (!stream.muted && state.soloId !== null && state.soloId !== stream.id) {
      state.soloId = null;
    }
    syncControls();
    applyAllAudio();
    save();
  });

  volume.addEventListener('input', () => {
    stream.volume = Number(volume.value);
    volumeValue.textContent = volume.value;
    if (stream.volume > 0) stream.muted = false;
    syncControls();
    applyAudio(entry);
  });
  volume.addEventListener('change', save);

  soloBtn.addEventListener('click', () => {
    state.soloId = state.soloId === stream.id ? null : stream.id;
    syncControls();
    applyAllAudio();
  });

  focusBtn.addEventListener('click', () => {
    state.focusId = state.focusId === stream.id ? null : stream.id;
    applyLayout();
  });

  reloadBtn.addEventListener('click', () => {
    el.classList.remove('has-error');
    webview.reload();
  });

  externalBtn.addEventListener('click', () => {
    window.app.openExternal(webview.getURL() || stream.url);
  });

  removeBtn.addEventListener('click', () => removeStream(stream.id));

  retryBtn.addEventListener('click', () => {
    el.classList.remove('has-error');
    webview.loadURL(stream.url);
  });

  /* --- Ereignisse des Webviews --- */

  webview.addEventListener('dom-ready', () => {
    entry.ready = true;
    webview
      .executeJavaScript(AUDIO_HOOK, true)
      .then(() => applyAudio(entry))
      .catch(() => { /* Injection blockiert - Mute greift trotzdem */ });
    applyAudio(entry);
  });

  webview.addEventListener('page-title-updated', (event) => {
    const clean = String(event.title || '').replace(/\s*\|\s*Whatnot\s*$/i, '').trim();
    if (clean) {
      stream.title = clean;
      title.textContent = clean;
      save();
    }
  });

  webview.addEventListener('did-fail-load', (event) => {
    // -3 = ERR_ABORTED, tritt bei jeder normalen Navigation auf.
    if (event.errorCode === -3 || !event.isMainFrame) return;
    errorText.textContent = 'Stream konnte nicht geladen werden (' + event.errorDescription + ').';
    el.classList.add('has-error');
  });

  webview.addEventListener('did-navigate', () => el.classList.remove('has-error'));

  /* --- Reihenfolge per Drag & Drop am Kachelkopf --- */

  header.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', stream.id);
    event.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  header.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    dom.grid.querySelectorAll('.drag-over').forEach((n) => n.classList.remove('drag-over'));
  });
  header.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    el.classList.add('drag-over');
  });
  header.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  header.addEventListener('drop', (event) => {
    event.preventDefault();
    el.classList.remove('drag-over');
    reorder(event.dataTransfer.getData('text/plain'), stream.id);
  });

  return entry;
}

/* ------------------------------------------------------------------ */
/* Rendern und Layout                                                  */
/* ------------------------------------------------------------------ */

/**
 * Gleicht das DOM an den Zustand an. Bestehende Webviews werden nur
 * verschoben, nie neu erzeugt - sonst wuerde jeder Stream neu starten.
 */
function render() {
  const seen = new Set();

  state.streams.forEach((stream, index) => {
    seen.add(stream.id);
    let entry = tiles.get(stream.id);
    if (!entry) {
      entry = buildTile(stream);
      tiles.set(stream.id, entry);
    }
    if (dom.grid.children[index] !== entry.el) {
      dom.grid.insertBefore(entry.el, dom.grid.children[index] || null);
    }
  });

  tiles.forEach((entry, id) => {
    if (seen.has(id)) return;
    entry.el.remove();
    tiles.delete(id);
  });

  document.body.classList.toggle('is-empty', state.streams.length === 0);
  dom.statusCount.textContent =
    state.streams.length + (state.streams.length === 1 ? ' Stream' : ' Streams');

  applyLayout();
  syncControls();
}

function applyLayout() {
  const count = state.streams.length;
  if (state.focusId && !state.streams.some((s) => s.id === state.focusId)) {
    state.focusId = null;
  }

  dom.grid.classList.toggle('focused', Boolean(state.focusId));
  tiles.forEach((entry) => {
    entry.el.classList.toggle('is-focused', entry.stream.id === state.focusId);
  });

  if (state.focusId || count === 0) {
    dom.grid.style.gridTemplateColumns = '';
    dom.grid.style.gridTemplateRows = '';
    return;
  }

  const cols = state.cols === 'auto'
    ? Math.max(1, Math.ceil(Math.sqrt(count)))
    : Math.min(Number(state.cols), Math.max(1, count));
  const rows = Math.ceil(count / cols);

  dom.grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
  dom.grid.style.gridTemplateRows = 'repeat(' + rows + ', minmax(240px, 1fr))';
}

/** Bringt alle Bedienelemente auf den Stand des Zustands. */
function syncControls() {
  dom.masterVolume.value = String(state.masterVolume);
  dom.masterVolumeValue.textContent = String(state.masterVolume);
  dom.masterMute.textContent = state.masterMuted ? '🔇' : '🔊';
  dom.masterVolume.disabled = state.masterMuted;

  tiles.forEach((entry) => {
    const audible = isAudible(entry.stream);
    entry.muteBtn.textContent = entry.stream.muted ? '🔇' : '🔊';
    entry.soloBtn.classList.toggle('on', state.soloId === entry.stream.id);
    entry.el.classList.toggle('is-solo', state.soloId === entry.stream.id);
    entry.el.classList.toggle('is-muted', !audible);
    entry.volume.value = String(entry.stream.volume);
    entry.volumeValue.textContent = String(entry.stream.volume);
  });

  dom.layoutGroup.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.cols === state.cols);
  });

  document.documentElement.dataset.theme = state.theme;
  dom.themeToggle.textContent = state.theme === 'dark' ? '🌙' : '☀️';
}

/* ------------------------------------------------------------------ */
/* Aktionen                                                            */
/* ------------------------------------------------------------------ */

function addStream(rawInput) {
  const url = normalizeInput(rawInput);
  if (!url) {
    dom.addInput.value = '';
    dom.addInput.placeholder = 'Bitte einen gueltigen Link oder Usernamen eingeben';
    return false;
  }
  // Neue Kacheln starten stumm, damit nicht ploetzlich alles durcheinanderredet.
  const startMuted = state.streams.length > 0;
  state.streams.push({
    id: nextId(),
    url,
    title: hostLabel(url),
    volume: 100,
    muted: startMuted,
  });
  render();
  save();
  return true;
}

function removeStream(id) {
  state.streams = state.streams.filter((s) => s.id !== id);
  if (state.soloId === id) state.soloId = null;
  if (state.focusId === id) state.focusId = null;
  render();
  save();
}

function reorder(draggedId, targetId) {
  if (!draggedId || draggedId === targetId) return;
  const from = state.streams.findIndex((s) => s.id === draggedId);
  const to = state.streams.findIndex((s) => s.id === targetId);
  if (from < 0 || to < 0) return;
  const [moved] = state.streams.splice(from, 1);
  state.streams.splice(to, 0, moved);
  render();
  save();
}

function soloByIndex(index) {
  const stream = state.streams[index];
  if (!stream) return;
  state.soloId = state.soloId === stream.id ? null : stream.id;
  syncControls();
  applyAllAudio();
}

/* ------------------------------------------------------------------ */
/* Globale Bedienelemente                                              */
/* ------------------------------------------------------------------ */

dom.addForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (addStream(dom.addInput.value)) dom.addInput.value = '';
});

dom.masterVolume.addEventListener('input', () => {
  state.masterVolume = Number(dom.masterVolume.value);
  dom.masterVolumeValue.textContent = dom.masterVolume.value;
  applyAllAudio();
});
dom.masterVolume.addEventListener('change', save);

dom.masterMute.addEventListener('click', () => {
  state.masterMuted = !state.masterMuted;
  syncControls();
  applyAllAudio();
  save();
});

dom.layoutGroup.addEventListener('click', (event) => {
  const btn = event.target.closest('button');
  if (!btn) return;
  state.cols = btn.dataset.cols;
  state.focusId = null;
  applyLayout();
  syncControls();
  save();
});

dom.themeToggle.addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  syncControls();
  save();
});

dom.openWhatnot.addEventListener('click', () => addStream(WHATNOT_HOME));
dom.openLogin.addEventListener('click', () => addStream(WHATNOT_LOGIN));
dom.openLoginEmpty.addEventListener('click', () => addStream(WHATNOT_LOGIN));

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;

  if (event.key >= '1' && event.key <= '9') {
    soloByIndex(Number(event.key) - 1);
    event.preventDefault();
  } else if (event.key === '0') {
    state.soloId = null;
    syncControls();
    applyAllAudio();
    event.preventDefault();
  } else if (event.key.toLowerCase() === 'm') {
    dom.masterMute.click();
    event.preventDefault();
  } else if (event.key === 'F11') {
    window.app.toggleFullscreen();
    event.preventDefault();
  } else if (event.key === 'Escape' && state.focusId) {
    state.focusId = null;
    applyLayout();
    event.preventDefault();
  }
});

load();
render();
