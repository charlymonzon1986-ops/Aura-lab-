const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

// Global reference to window to avoid garbage collection
let mainWindow;

function startExpressServer() {
  try {
    process.env.NODE_ENV = isDev ? 'development' : 'production';
    // Load the server. In CJS, this executes the top-level startServer()
    require('../dist-server/server.cjs');
  } catch (err) {
    console.error('Failed to start Express server:', err);
    if (!isDev) {
      dialog.showErrorBox('Error de Inicio', 'No se pudo iniciar el servidor interno: ' + err.message);
    }
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Aura Lab - Laboratorio Fotográfico Pro",
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../public/favicon.ico')
  });

  const url = 'http://localhost:3000';
  
  // Custom loader logic: try to load until successful or timeout
  const tryLoad = async (attempts = 0) => {
    try {
      await mainWindow.loadURL(url);
      mainWindow.show();
    } catch (e) {
      if (attempts < 20) { // Try for 10 seconds (20 * 500ms)
        setTimeout(() => tryLoad(attempts + 1), 500);
      } else {
        dialog.showErrorBox('Error de Conexión', 'No se pudo conectar con el motor de Aura Lab. Por favor, reinicia la aplicación.');
      }
    }
  };

  tryLoad();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startExpressServer();
  createWindow();

  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
