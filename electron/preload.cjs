const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to renderer (React app)
contextBridge.exposeInMainWorld('electronAPI', {
  // ── Database ──────────────────────────────────────────────────────────────
  db: {
    getPhotos:    ()           => ipcRenderer.invoke('db:getPhotos'),
    addPhoto:     (photo)      => ipcRenderer.invoke('db:addPhoto', photo),
    updatePhoto:  (id, upd)    => ipcRenderer.invoke('db:updatePhoto', id, upd),
    deletePhoto:  (id)         => ipcRenderer.invoke('db:deletePhoto', id),
    getPresets:   ()           => ipcRenderer.invoke('db:getPresets'),
    addPreset:    (preset)     => ipcRenderer.invoke('db:addPreset', preset),
    deletePreset: (id)         => ipcRenderer.invoke('db:deletePreset', id),
    getFolders:   ()           => ipcRenderer.invoke('db:getFolders'),
    addFolder:    (name)       => ipcRenderer.invoke('db:addFolder', name),
    deleteFolder: (id)         => ipcRenderer.invoke('db:deleteFolder', id),
  },
  // ── Files ─────────────────────────────────────────────────────────────────
  file: {
    savePhoto:   (buf, name)   => ipcRenderer.invoke('file:savePhoto', buf, name),
    readPhoto:   (localPath)   => ipcRenderer.invoke('file:readPhoto', localPath),
    getDataDir:  ()            => ipcRenderer.invoke('file:getDataDir'),
  },
  // ── Dialogs ───────────────────────────────────────────────────────────────
  dialog: {
    openFile:    ()            => ipcRenderer.invoke('dialog:openFile'),
    openFolder:  ()            => ipcRenderer.invoke('dialog:openFolder'),
  },
  // ── Plan ──────────────────────────────────────────────────────────────────
  plan: {
    get: () => ipcRenderer.invoke('plan:get'),
    set: (plan) => ipcRenderer.invoke('plan:set', plan),
  },
  // ── Utility ───────────────────────────────────────────────────────────────
  isElectron: true,
});
