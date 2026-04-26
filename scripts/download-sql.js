import axios from 'axios';
import fs from 'fs';

async function download(url, dest) {
  console.log(`Downloading ${url}...`);
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(dest, response.data);
}

async function run() {
  const dir = './public/sql';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await download('https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/sql-wasm.js', './public/sql/sql-wasm.js');
  await download('https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/sql-wasm.wasm', './public/sql/sql-wasm.wasm');
  console.log('Done.');
}

run();
