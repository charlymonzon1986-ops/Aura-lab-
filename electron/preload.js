const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Aquí puedes exponer funciones seguras del sistema hacia React
  // Ej: abrir cuadros de diálogo nativos para guardar archivos
  platform: process.platform
});
