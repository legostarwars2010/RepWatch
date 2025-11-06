const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'data', 'legiscan_cache');
if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true });

function cachePath(key) {
  return path.join(BASE, encodeURIComponent(key) + '.json');
}

function readCache(key) {
  const p = cachePath(key);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { return null; }
}

function writeCache(key, obj) {
  const p = cachePath(key);
  fs.writeFileSync(p, JSON.stringify(obj));
}

module.exports = { readCache, writeCache };
