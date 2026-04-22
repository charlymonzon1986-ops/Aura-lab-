// Using global initSqlJs from index.html script tag
let db: any = null;

// IndexedDB Helper
const DB_NAME = 'aura_lab_db';
const STORE_NAME = 'sqlite_store';
const DB_KEY = 'aura_local_db';

async function openIDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFromIDB() {
  const idb = await openIDB();
  return new Promise<Uint8Array | null>((resolve, reject) => {
    const transaction = idb.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(DB_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToIDB(data: Uint8Array) {
  const idb = await openIDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = idb.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(data, DB_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function initLocalDB() {
  if (db) return db;
  
  let SQL;
  try {
    const initSqlJsGlobal = (window as any).initSqlJs;
    if (!initSqlJsGlobal) {
      throw new Error("sql.js not loaded from script tag");
    }

    SQL = await initSqlJsGlobal({
      locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
    });
  } catch (err) {
    console.error("❌ Error initializing sql.js:", err);
    // Return a mock DB that doesn't crash but logs errors
    return {
      run: () => console.warn("SQL operation skipped: SQL not loaded"),
      exec: () => [],
      export: () => new Uint8Array()
    };
  }
  
  try {
    const saved = await getFromIDB();
    if (saved) {
      db = new SQL.Database(saved);
      console.log("💾 Local DB loaded from IndexedDB persistence");
    } else {
      db = new SQL.Database();
    }
  } catch (e) {
    console.warn("Failed to load local DB, starting fresh", e);
    db = new SQL.Database();
  }
  
  // Create tables if they don't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  
  console.log("✅ Local SQLite DB initialized");
  return db;
}

async function persistDB() {
  if (!db) return;
  try {
    const data = db.export();
    await saveToIDB(data);
  } catch (e) {
    console.error("Failed to persist local DB", e);
  }
}

export async function savePhotoLocally(id: string, photoData: any) {
  const database = await initLocalDB();
  database.run("INSERT OR REPLACE INTO photos (id, data) VALUES (?, ?)", [id, JSON.stringify(photoData)]);
  persistDB();
}

export async function getLocalPhotos() {
  const database = await initLocalDB();
  const res = database.exec("SELECT data FROM photos");
  if (res.length === 0) return [];
  return res[0].values.map((v: any) => JSON.parse(v[0]));
}

export async function clearLocalDB() {
  const database = await initLocalDB();
  database.run("DELETE FROM photos");
  persistDB();
}
