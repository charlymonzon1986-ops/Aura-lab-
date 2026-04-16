const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

// Importar tu servidor Express (ajustado para funcionar dentro de Electron)
// Nota: Importamos el servidor dinámicamente o lo iniciamos como proceso
function startExpressServer() {
  // En producción, podrías cargar el server ya compilado o usar ts-node/register
  // Para simplicidad en el build, asumimos que el server se encarga de servir el frontend
  process.env.NODE_ENV = isDev ? 'development' : 'production';
  require('../dist-server/server.cjs'); 
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Aura Lab Desktop",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../public/favicon.ico')
  });

  if (isDev) {
    // En desarrollo usamos el servidor de Vite
    win.loadURL('http://localhost:3000');
  } else {
    // En producción cargamos el servidor local de Express que ya sirve el index.html
    win.loadURL('http://localhost:3000');
  }
}

app.whenReady().then(() => {
  startExpressServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
