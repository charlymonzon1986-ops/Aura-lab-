const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');

let mainWindow = null;
const SERVER_PORT = 3742;

// ─── Data directory ──────────────────────────────────────────────────────────
function getDataDir() {
  const dataDir = path.join(app.getPath('userData'), 'aura-lab-data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}
function getPhotosDir() {
  const dir = path.join(getDataDir(), 'photos');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getThumbsDir() {
  const dir = path.join(getDataDir(), 'thumbs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getDbPath() { return path.join(getDataDir(), 'database.json'); }

// ─── JSON Database ───────────────────────────────────────────────────────────
function loadDb() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    const initial = { photos: [], presets: [], folders: [] };
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
  catch { return { photos: [], presets: [], folders: [] }; }
}
function saveDb(data) { fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2)); }
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ─── RAW conversion using sharp ──────────────────────────────────────────────
const RAW_EXTENSIONS = ['.arw', '.cr2', '.cr3', '.nef', '.dng', '.orf', '.raf', '.rw2', '.pef', '.srw'];

async function convertRawToJpeg(rawPath, outputPath) {
  // Try sharp first (handles DNG and some RAW natively)
  try {
    const sharp = require('sharp');
    await sharp(rawPath, { failOnError: false })
      .rotate() // auto-rotate from EXIF
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    return true;
  } catch (err) {
    console.log('sharp failed for RAW, trying dcraw fallback:', err.message);
  }

  // Fallback: try dcraw via child_process (if installed)
  try {
    const { execSync } = require('child_process');
    // -e = extract embedded thumbnail, -c = write to stdout
    execSync(`dcraw -e -c "${rawPath}" > "${outputPath}"`, { timeout: 30000 });
    return true;
  } catch {}

  // Last resort: extract embedded JPEG thumbnail using manual parsing
  try {
    return extractEmbeddedJpeg(rawPath, outputPath);
  } catch (err) {
    console.error('All RAW conversion methods failed:', err.message);
    return false;
  }
}

// Extract embedded JPEG from RAW files (works for most Sony ARW, Canon CR2, Nikon NEF)
function extractEmbeddedJpeg(rawPath, outputPath) {
  const buf = fs.readFileSync(rawPath);
  
  // Search for JPEG SOI marker (FF D8) followed by FF E0 or FF E1 (JFIF/EXIF)
  let bestOffset = -1;
  let bestSize = 0;
  
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] === 0xFF && buf[i+1] === 0xD8 && 
        buf[i+2] === 0xFF && (buf[i+3] === 0xE0 || buf[i+3] === 0xE1 || buf[i+3] === 0xDB)) {
      // Find matching EOI (FF D9)
      for (let j = buf.length - 2; j > i + 1000; j--) {
        if (buf[j] === 0xFF && buf[j+1] === 0xD9) {
          const size = j - i + 2;
          if (size > bestSize) {
            bestSize = size;
            bestOffset = i;
          }
          break;
        }
      }
    }
  }
  
  if (bestOffset !== -1 && bestSize > 50000) { // at least 50KB to be a real preview
    const jpegData = buf.slice(bestOffset, bestOffset + bestSize);
    fs.writeFileSync(outputPath, jpegData);
    console.log(`✅ Extracted embedded JPEG from RAW: ${bestSize} bytes`);
    return true;
  }
  
  console.warn('No embedded JPEG found in RAW file');
  return false;
}

// ─── IPC: Photos ─────────────────────────────────────────────────────────────
ipcMain.handle('db:getPhotos', () => loadDb().photos || []);

ipcMain.handle('db:addPhoto', (_, photo) => {
  const db = loadDb();
  const newPhoto = { ...photo, id: generateId(), createdAt: new Date().toISOString() };
  db.photos.unshift(newPhoto);
  saveDb(db);
  return newPhoto;
});

ipcMain.handle('db:updatePhoto', (_, id, updates) => {
  const db = loadDb();
  const idx = db.photos.findIndex(p => p.id === id);
  if (idx !== -1) {
    db.photos[idx] = { ...db.photos[idx], ...updates };
    saveDb(db);
    return db.photos[idx];
  }
  return null;
});

ipcMain.handle('db:deletePhoto', (_, id) => {
  const db = loadDb();
  const photo = db.photos.find(p => p.id === id);
  if (photo) {
    if (photo.localPath && fs.existsSync(photo.localPath)) try { fs.unlinkSync(photo.localPath); } catch {}
    if (photo.thumbnailPath && fs.existsSync(photo.thumbnailPath)) try { fs.unlinkSync(photo.thumbnailPath); } catch {}
  }
  db.photos = db.photos.filter(p => p.id !== id);
  saveDb(db);
  return true;
});

// ─── IPC: Presets ─────────────────────────────────────────────────────────────
ipcMain.handle('db:getPresets', () => loadDb().presets || []);
ipcMain.handle('db:addPreset', (_, preset) => {
  const db = loadDb();
  const newPreset = { ...preset, id: generateId(), createdAt: new Date().toISOString() };
  db.presets.unshift(newPreset);
  saveDb(db);
  return newPreset;
});
ipcMain.handle('db:deletePreset', (_, id) => {
  const db = loadDb();
  db.presets = db.presets.filter(p => p.id !== id);
  saveDb(db);
  return true;
});

// ─── IPC: Plan (licencia local) ───────────────────────────────────────────────
function getPlanPath() { return path.join(getDataDir(), 'license.json'); }

function loadPlan() {
  const p = getPlanPath();
  if (!fs.existsSync(p)) return { plan: 'free', activatedAt: null };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return { plan: 'free', activatedAt: null }; }
}

function savePlan(plan) {
  fs.writeFileSync(getPlanPath(), JSON.stringify({ plan, activatedAt: new Date().toISOString() }, null, 2));
}

ipcMain.handle('plan:get', () => loadPlan().plan);
ipcMain.handle('plan:set', (_, plan) => {
  const valid = ['free', 'pro', 'studio'];
  if (!valid.includes(plan)) return false;
  savePlan(plan);
  return true;
});

// ─── IPC: Folders ─────────────────────────────────────────────────────────────
ipcMain.handle('db:getFolders', () => loadDb().folders || []);
ipcMain.handle('db:addFolder', (_, name) => {
  const db = loadDb();
  const folder = { id: generateId(), name, createdAt: new Date().toISOString() };
  db.folders.push(folder);
  saveDb(db);
  return folder;
});
ipcMain.handle('db:deleteFolder', (_, id) => {
  const db = loadDb();
  db.folders = db.folders.filter(f => f.id !== id);
  db.photos = db.photos.map(p => p.folderId === id ? { ...p, folderId: null } : p);
  saveDb(db);
  return true;
});

// ─── IPC: File operations ─────────────────────────────────────────────────────
ipcMain.handle('file:savePhoto', async (_, fileBuffer, fileName) => {
  const photosDir = getPhotosDir();
  const ext = path.extname(fileName).toLowerCase();
  const safeName = Date.now() + '_' + path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const destPath = path.join(photosDir, safeName);
  const buf = Buffer.from(fileBuffer);
  fs.writeFileSync(destPath, buf);

  // If RAW file → generate JPEG thumbnail
  let thumbnailPath = null;
  let previewUrl = null;
  if (RAW_EXTENSIONS.includes(ext)) {
    const thumbName = safeName.replace(/\.[^.]+$/, '_thumb.jpg');
    thumbnailPath = path.join(getThumbsDir(), thumbName);
    const ok = await convertRawToJpeg(destPath, thumbnailPath);
    if (!ok || !fs.existsSync(thumbnailPath)) {
      thumbnailPath = null; // conversion failed, UI will show placeholder
    } else {
      previewUrl = `auralab://local/${encodeURIComponent(thumbnailPath.replace(/\\/g, '/'))}`;
    }
  }

  return { 
    localPath: destPath, 
    fileName: safeName, 
    thumbnailPath,
    previewUrl,
    isRaw: RAW_EXTENSIONS.includes(ext)
  };
});

ipcMain.handle('file:readPhoto', async (_, localPath) => {
  if (!fs.existsSync(localPath)) return null;
  const buffer = fs.readFileSync(localPath);
  return buffer.toString('base64');
});

ipcMain.handle('file:getDataDir', () => getDataDir());

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Todas las imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp', 'arw', 'cr2', 'cr3', 'nef', 'dng', 'orf', 'raf', 'rw2'] }
    ]
  });
  return result.filePaths;
});

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.filePaths[0] || null;
});

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#09090b',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    },
    icon: path.join(__dirname, '../public/icon.png'),
    title: 'Aura Lab'
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  protocol.handle('auralab', (request) => {
    const filePath = decodeURIComponent(request.url.replace('auralab://local/', ''));
    return net.fetch(url.pathToFileURL(filePath).toString());
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
