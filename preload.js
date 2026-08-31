const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('app', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  resetSession: () => ipcRenderer.invoke('reset-session'),
  appVersion: () => ipcRenderer.invoke('app-version'),
  signedIn: () => ipcRenderer.invoke('whatnot-signed-in'),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateDownload: () => ipcRenderer.invoke('update-download'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  updateState: () => ipcRenderer.invoke('update-state'),
  onUpdateState: (fn) => ipcRenderer.on('update-state', (_e, s) => fn(s)),
});
