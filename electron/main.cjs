const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

const { fork } = require('child_process');

// Global reference to window and server process
let mainWindow;
let serverProcess;

function startExpressServer() {
  const serverPath = path.join(__dirname, '../dist-server/server.cjs');
  
  console.log('🚀 Starting Aura Lab Engine from:', serverPath);
  
  // Fork the server into a separate process so it doesn't block the UI thread
  serverProcess = fork(serverPath, [], {
    env: { 
      ...process.env, 
      NODE_ENV: isDev ? 'development' : 'production',
      ELECTRON_RUN_AS_NODE: '1'
    },
    stdio: ['inherit', 'pipe', 'pipe', 'ipc']
  });

  serverProcess.stdout.setEncoding('utf8');
  serverProcess.stderr.setEncoding('utf8');

  let engineLogs = "";
  serverProcess.stdout.on('data', (data) => {
    const s = data.toString();
    console.log(`[Engine] ${s}`);
    engineLogs += "\n[INFO] " + s;
  });

  serverProcess.stderr.on('data', (data) => {
    const s = data.toString();
    console.error(`[Engine Error] ${s}`);
    engineLogs += "\n[ERROR] " + s;
  });

  serverProcess.on('error', (err) => {
    console.error('❌ Failed to start server process:', err);
    dialog.showErrorBox('Error Fatal de Motor', `No se pudo iniciar el proceso del motor: ${err.message}`);
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(`📡 Server process exited with code ${code} and signal ${signal}`);
    if (code !== 0 && code !== null) {
      dialog.showErrorBox(
        'Motor Detenido', 
        `El motor de Aura Lab se cerró inesperadamente (Código: ${code}).\n\nLogs:\n${engineLogs || 'No hay logs disponibles.'}`
      );
    }
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Aura Lab - Laboratorio Fotográfico Pro",
    show: false,
    backgroundColor: '#09090b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../public/favicon.ico')
  });

  // Habilitar menú básico
  mainWindow.setMenuBarVisibility(false);
  
  // Bug 1.1 fix: in dev mode the Express server is never started, so polling
  // localhost:3000 just causes a 30-second silent timeout. Load the Vite dev
  // server (port 5173) directly instead.
  if (isDev) {
    const devUrl = 'http://localhost:5173';
    try {
      await mainWindow.loadURL(devUrl);
      mainWindow.show();
      console.log('✅ Dev mode: loaded Vite dev server at', devUrl);
    } catch (e) {
      dialog.showErrorBox('Error Dev Mode', `No se pudo conectar al servidor de Vite en ${devUrl}.\nAsegurate de correr "npm run dev" antes de abrir Electron.`);
      app.quit();
    }
    return;
  }

  const url = 'http://localhost:3000';

  // Custom loader logic: try to load until successful or timeout
  const tryLoad = async (attempts = 0) => {
    try {
      const response = await fetch(url + '/api/version');
      if (response.ok) {
        await mainWindow.loadURL(url);
        mainWindow.show();
        console.log(`✅ Aura Lab Engine conectado tras ${attempts} intentos`);
      } else {
        throw new Error("Server starting...");
      }
    } catch (e) {
      if (attempts < 60) { // Esperar hasta 30 segundos
        setTimeout(() => tryLoad(attempts + 1), 500);
      } else {
        dialog.showMessageBoxSync({
          type: 'error',
          title: 'Error de Motor',
          message: 'No se pudo establecer conexión con el motor interno de Aura Lab.',
          detail: `Intentos: ${attempts}\nLogs del Motor:\n${engineLogs || 'Sin logs disponibles.'}\n\nPor favor, verifica si un antivirus está bloqueando el puerto 3000 o intenta reiniciar como administrador.`,
          buttons: ['Aceptar']
        });
        app.quit();
      }
    }
  };

  tryLoad();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (!isDev) {
    startExpressServer();
  }
  createWindow();

  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

process.on('exit', () => {
  if (serverProcess) serverProcess.kill();
});

// Bug 1.4 fix: register IPC handlers so preload channels work
const { version } = require('../package.json');
ipcMain.handle('app:get-version', () => version);
ipcMain.handle('dialog:save', (_e, options) => dialog.showSaveDialog(options));
ipcMain.handle('dialog:open', (_e, options) => dialog.showOpenDialog(options));
ipcMain.handle('shell:open-external', (_e, url) => shell.openExternal(url));
