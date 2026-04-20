const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // Native file dialogs
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:save', options),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:open', options),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // Engine logs (one-way from main → renderer)
  onEngineLogs: (callback) => {
    ipcRenderer.on('engine:log', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('engine:log');
  },
});
