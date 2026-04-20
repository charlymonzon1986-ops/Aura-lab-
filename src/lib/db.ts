// Using global initSqlJs from index.html script tag
// import initSqlJs from 'sql.js';

let db: any = null;

export async function initLocalDB() {
  if (db) return db;
  
  const initSqlJsGlobal = (window as any).initSqlJs;
  if (!initSqlJsGlobal) {
    throw new Error("sql.js not loaded from script tag");
  }

  const SQL = await initSqlJsGlobal({
    locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
  });
  
  // Issue 5.3 Fix: Try to load from localStorage
  try {
    const saved = localStorage.getItem('aura_local_db');
    if (saved) {
      const buffer = new Uint8Array(saved.split(',').map(Number));
      db = new SQL.Database(buffer);
      console.log("💾 Local DB loaded from persistence");
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

function persistDB() {
  if (!db) return;
  try {
    const data = db.export();
    localStorage.setItem('aura_local_db', data.toString());
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
