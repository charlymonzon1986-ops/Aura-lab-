import initSqlJs from 'sql.js';

let db: any = null;

export async function initLocalDB() {
  if (db) return db;
  
  const SQL = await initSqlJs({
    locateFile: file => {
      // Try local first, then fallback to unpkg CDN
      return `/sqljs/${file}`;
    }
  }).catch(err => {
    console.warn("Local WASM failed, trying CDN fallback...", err);
    return initSqlJs({
      locateFile: file => `https://unpkg.com/sql.js@1.14.1/dist/${file}`
    });
  });
  
  db = new SQL.Database();
  
  // Create tables
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

export async function savePhotoLocally(id: string, photoData: any) {
  const database = await initLocalDB();
  database.run("INSERT OR REPLACE INTO photos (id, data) VALUES (?, ?)", [id, JSON.stringify(photoData)]);
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
}
