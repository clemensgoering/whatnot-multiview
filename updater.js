/*
 * Update checking against the GitHub releases of this repository.
 *
 * ## Why this is not simply autoUpdater with the defaults on
 *
 * Squirrel.Mac refuses to install an update whose bundle is not code-signed, and
 * these builds are not signed. So on macOS the machinery silently cannot work,
 * and pretending otherwise would leave a "downloading…" that never finishes.
 * There, this falls back to telling the user and opening the releases page.
 *
 * Windows and Linux install unsigned updates happily. The Windows code-signature
 * check has to be turned off in the builder config for the same reason.
 *
 * Nothing installs itself behind the user's back: an update is downloaded only
 * after they ask for it, and applied when they next quit. This app is used while
 * bidding on live auctions - a surprise restart is expensive.
 */
const { app, shell } = require('electron');

const RELEASES_URL = 'https://github.com/clemensgoering/whatnot-multiview/releases/latest';

/** macOS cannot install unsigned updates, so it only ever gets told about them. */
const CAN_SELF_UPDATE = process.platform !== 'darwin';

let updater = null;
let sendToWindow = () => {};
/*
 * A check the user did not ask for must fail quietly. Releases before the
 * updater existed carry no latest.yml, so the automatic check legitimately
 * fails for anyone still on one - and greeting them with "Update failed" on
 * every launch would be worse than saying nothing.
 */
let manualCheck = false;
let state = { status: 'idle', version: null, notes: null, percent: 0, error: null };

function push(next) {
  state = { ...state, ...next };
  sendToWindow('update-state', state);
}

function load() {
  if (updater) return updater;
  // Required lazily: importing it in dev where no update config exists is noisy.
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => push({ status: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => push({ status: 'current', version: app.getVersion() }));
  autoUpdater.on('update-available', (info) => push({
    status: CAN_SELF_UPDATE ? 'available' : 'available-manual',
    version: info.version,
    notes: typeof info.releaseNotes === 'string' ? info.releaseNotes.slice(0, 2000) : null,
  }));
  autoUpdater.on('download-progress', (p) => push({
    status: 'downloading',
    percent: Math.round(p.percent),
  }));
  autoUpdater.on('update-downloaded', (info) => push({ status: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => {
    const message = String(err && err.message ? err.message : err).slice(0, 300);
    push(manualCheck ? { status: 'error', error: message } : { status: 'idle', error: message });
  });

  updater = autoUpdater;
  return updater;
}

/** A dev run has no update metadata; say so rather than throwing. */
function unavailable() {
  push({ status: 'dev', version: app.getVersion() });
  return state;
}

async function check(manual = false) {
  if (!app.isPackaged) return unavailable();
  manualCheck = Boolean(manual);
  try {
    await load().checkForUpdates();
  } catch (e) {
    const message = String(e.message || e).slice(0, 300);
    push(manualCheck ? { status: 'error', error: message } : { status: 'idle', error: message });
  }
  return state;
}

async function download() {
  if (!app.isPackaged) return unavailable();
  if (!CAN_SELF_UPDATE) {
    shell.openExternal(RELEASES_URL);
    return state;
  }
  try {
    push({ status: 'downloading', percent: 0 });
    await load().downloadUpdate();
  } catch (e) {
    push({ status: 'error', error: String(e.message || e).slice(0, 300) });
  }
  return state;
}

function install() {
  if (!app.isPackaged || !CAN_SELF_UPDATE) {
    shell.openExternal(RELEASES_URL);
    return false;
  }
  // isSilent false, isForceRunAfter true: the user asked for this, so show the
  // installer and come back up afterwards.
  load().quitAndInstall(false, true);
  return true;
}

function attach(send) {
  sendToWindow = send;
}

module.exports = {
  attach,
  check,
  download,
  install,
  getState: () => state,
  RELEASES_URL,
  CAN_SELF_UPDATE,
};
