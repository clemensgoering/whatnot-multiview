const { app, BrowserWindow, shell, ipcMain, session } = require('electron');
const path = require('path');

// Streams sollen ohne Klick starten - sonst muss man jede Kachel einzeln antippen.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Hardware-Decoding fuer mehrere parallele Videostreams.
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

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => { mainWindow = null; });
}

/*
 * Alle Kacheln teilen sich eine Session -> einmal einloggen reicht fuer alle Streams.
 *
 * Bewusst KEINE User-Agent-Faelschung mehr: ein vorgetaeuschter Chrome-UA passte
 * nicht zu den Client Hints (UA sagte Chrome 131, navigator.userAgentData sagte
 * Chromium 130). Genau diese Widerspruechlichkeit ist fuer Bot-Erkennung ein
 * staerkeres Alarmsignal als eine ehrliche Kennung.
 */
function configureStreamSession() {
  session.fromPartition('persist:whatnot');
}

app.whenReady().then(() => {
  configureStreamSession();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Login ueber Google/Apple/Facebook laeuft ueber ein Popup. Das muss in der App
// bleiben, sonst landet das Session-Cookie im Systembrowser statt in unserer
// Partition. Alles andere geht bewusst nach draussen.
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

ipcMain.handle('open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:/.test(url)) return shell.openExternal(url);
});

ipcMain.handle('toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});
