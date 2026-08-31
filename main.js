const { app, BrowserWindow, dialog, shell, ipcMain, session } = require('electron');
const path = require('path');
const updater = require('./updater');

// Streams should start without a click, otherwise every tile needs tapping first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Hardware decoding for several parallel video streams.
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d0f13',
    autoHideMenuBar: true,
    title: 'Whatnot MultiView',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });

  updater.attach((channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  });
}

/*
 * All tiles share one session, so a single login covers every stream.
 *
 * Deliberately NO user-agent spoofing: a faked Chrome UA did not match the
 * client hints (the UA claimed Chrome 131 while navigator.userAgentData
 * reported Chromium 130). That contradiction is a stronger bot signal than an
 * honest identity, and it tripped both Google sign-in and Whatnot's fraud check.
 */
function configureStreamSession() {
  const streamSession = session.fromPartition('persist:whatnot');
  // Injects the volume hook at document-start; see webview-preload.js for why
  // the level cannot be taken from the media elements on these pages.
  streamSession.setPreloads([path.join(__dirname, 'webview-preload.js')]);
}

app.whenReady().then(() => {
  configureStreamSession();
  createWindow();

  // One quiet check a few seconds in, so it never competes with the first paint.
  setTimeout(() => { updater.check(); }, 8000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Google/Apple/Facebook sign-in runs through a popup. It has to stay inside the
// app, otherwise the session cookie lands in the system browser instead of our
// partition. Everything else is deliberately sent outward.
const POPUP_HOSTS = ['whatnot.com', 'accounts.google.com', 'appleid.apple.com', 'facebook.com'];

function isLoginPopup(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return POPUP_HOSTS.some((host) => hostname === host || hostname.endsWith('.' + host));
  } catch (e) {
    return false;
  }
}

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (contents.getType() === 'webview' && isLoginPopup(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 760,
          autoHideMenuBar: true,
          backgroundColor: '#0d0f13',
        },
      };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const AUTH_COOKIES = ['__Secure-claims', '__Secure-urs', 'usid', 'cas_session'];

ipcMain.handle('whatnot-signed-in', async () => {
  try {
    const jar = session.fromPartition('persist:whatnot').cookies;
    const found = await jar.get({ domain: '.whatnot.com' });
    const names = new Set(found.map((c) => c.name));
    return AUTH_COOKIES.some((name) => names.has(name));
  } catch (e) {
    return false;
  }
});

ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('update-check', () => updater.check(true));
ipcMain.handle('update-download', () => updater.download());
ipcMain.handle('update-install', () => updater.install());
ipcMain.handle('update-state', () => updater.getState());

ipcMain.handle('open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:/.test(url)) return shell.openExternal(url);
});

// Packaged users have no npm scripts, so signing out has to be reachable in the UI.
ipcMain.handle('reset-session', async () => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Sign out', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Sign out of Whatnot',
    message: 'Clear the stored Whatnot session?',
    detail: 'Cookies and site storage for all tiles are deleted. Your stream list is kept.',
  });
  if (response !== 0) return false;
  await session.fromPartition('persist:whatnot').clearStorageData();
  return true;
});

ipcMain.handle('toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});
