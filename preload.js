const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('probro', {
  onOpenUrl: (cb) => ipcRenderer.on('open-url', (_e, url) => cb(url))
});
