const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  resetSession: () => ipcRenderer.invoke('reset-session'),
});
