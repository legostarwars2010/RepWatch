const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');

// Simple in-memory LRU with TTL
class LRUCacheTTL {
  constructor(max = 500, ttlMs = 15 * 60 * 1000) {
    this.max = max;
    this.ttlMs = ttlMs;
    this.map = new Map();
  }
  _now() {
    return Date.now();
  }
  get(key) {
    const v = this.map.get(key);
    if (!v) return null;
    if (v.expireAt < this._now()) {
      this.map.delete(key);
      return null;
    }
    // touch
    this.map.delete(key);
    this.map.set(key, v);
    return v.value;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expireAt: this._now() + this.ttlMs });
    while (this.map.size > this.max) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }
}

// Load zip->cd mapping
function loadZipCsv() {
  const csvPath = path.resolve(__dirname, '..', 'data', 'zip_to_cd118.csv');
  if (!fs.existsSync(csvPath)) return new Map();
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  // assume header: zip, state, cd118
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim());
    if (parts.length < 3) continue;
    const zip = parts[0].replace(/^"|"$/g, '').slice(0,5);
    const state = parts[1].replace(/^"|"$/g, '');
    const cd = parts[2].replace(/^"|"$/g, '');
    if (!map.has(zip)) map.set(zip, []);
    map.get(zip).push({ state, district: cd });
  }
  return map;
}

const zipMap = loadZipCsv() || new Map();
const cache = new LRUCacheTTL(1000, 15 * 60 * 1000);
console.log(`District resolver: zip map entries = ${zipMap.size} (zip_to_cd118.csv ${zipMap.size>0? 'loaded':'not found'})`);

// Load district centroids from NTAD-like CSV as a fallback when TIGERweb fails
function loadDistrictCentroids() {
  const csvPath = path.resolve(__dirname, '..', 'data', 'NTAD_Congressional_Districts_1009129779752246747.csv');
  if (!fs.existsSync(csvPath)) return [];
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim());
  const idxLat = header.indexOf('INTPTLAT');
  const idxLon = header.indexOf('INTPTLON');
  // prefer STATEFP (FIPS) if present, otherwise fall back to STATE
  const idxStateFp = header.indexOf('STATEFP');
  const idxState = idxStateFp !== -1 ? idxStateFp : header.indexOf('STATE');
  // Try CD119FP first (for 119th Congress), then fall back to DISTRICT
  let idxDistrict = header.indexOf('CD119FP');
  if (idxDistrict === -1) idxDistrict = header.indexOf('CD118FP');
  if (idxDistrict === -1) idxDistrict = header.indexOf('DISTRICT');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    // guard: must have those indices
    if (parts.length <= Math.max(idxLat, idxLon, idxState, idxDistrict)) continue;
    const lat = parseFloat(parts[idxLat]);
    const lon = parseFloat(parts[idxLon]);
    const rawState = parts[idxState] ? parts[idxState].replace(/^"|"$/g, '').trim() : '';
    const rawDistrict = parts[idxDistrict] ? parts[idxDistrict].replace(/^"|"$/g, '').trim() : '';
    // normalize district: '00' or '0' -> 'AL' (at-large), if numeric strip leading zeros, otherwise keep as-is
    let district = rawDistrict || '';
    if (district === '00' || district === '0') {
      district = 'AL';
    } else if (/^\d+$/.test(district)) {
      district = String(Number(district));
    } else {
      // keep non-numeric codes as-is (e.g., 'D' or other flags)
      district = district;
    }
    const state = rawState;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      out.push({ lat, lon, state, district });
    }
  }
  return out;
}

const districtCentroids = loadDistrictCentroids();
console.log(`District resolver: loaded ${districtCentroids.length} centroids from NTAD CSV`);

function haversineDistanceKm(aLat, aLon, bLat, bLon) {
  const toRad = v => v * Math.PI / 180;
  const R = 6371; // km
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const sinDlat = Math.sin(dLat/2);
  const sinDlon = Math.sin(dLon/2);
  const a = sinDlat*sinDlat + sinDlon*sinDlon * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function nearestDistrictByCentroid(lat, lon) {
  if (!districtCentroids || districtCentroids.length === 0) return null;
  let best = null;
  let bestDist = Infinity;
  for (const d of districtCentroids) {
    const dist = haversineDistanceKm(lat, lon, d.lat, d.lon);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  if (!best) return null;
  // convert STATE FIPS to postal code if possible
  const fipsToPostal = {
    '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY','60':'AS','66':'GU','69':'MP','72':'PR','78':'VI'
  };
  const statePostal = (best.state && best.state.length === 2 && fipsToPostal[best.state]) ? fipsToPostal[best.state] : best.state;
  return { state: statePostal, district: best.district, chamber: 'house', source: 'centroid_fallback', approx_km: bestDist };
}

async function resolveByZip(zip) {
  if (!zip) return null;
  const key = `zip:${zip}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const z5 = String(zip).slice(0,5);
  const entries = zipMap.get(z5) || [];
  if (entries.length === 1) {
    const res = { state: entries[0].state, district: entries[0].district, chamber: 'house', source: 'zip' };
    cache.set(key, res);
    return res;
  }
  if (entries.length > 1) {
    // pick most common (by frequency)
    const freq = {};
    for (const e of entries) {
      const k2 = `${e.state}:${e.district}`;
      freq[k2] = (freq[k2] || 0) + 1;
    }
    const sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]);
    const [best, count] = sorted[0];
    const [state, district] = best.split(':');
    const res = { state, district, chamber: 'house', source: 'zip_most_common', confidence: count/entries.length };
    cache.set(key, res);
    return res;
  }
  cache.set(key, null);
  return null;
}

async function geocodeAddress(address) {
  const q = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1`;
  const r = await fetch(url, { headers: { 'User-Agent': 'RepWatch/1.0 (contact: none)' } });
  if (!r.ok) return null;
  const j = await r.json();
  if (!Array.isArray(j) || j.length === 0) return null;
  const loc = j[0];
  return { lat: loc.lat, lon: loc.lon, display_name: loc.display_name };
}

async function queryTigerWebCD119(lat, lon) {
  // Use Census TIGERweb MapServer query for 119th Congressional Districts
  // Layer 54 has the current (119th) Congressional Districts
  const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/54/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&outFields=STATE,BASENAME&f=json`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || !j.features || j.features.length === 0) return null;
  const props = j.features[0].attributes;
  // STATE is FIPS code (numeric), BASENAME is district number (e.g., '7', '5')
  const stateFips = String(props.STATE).padStart(2, '0');
  let cd = String(props.BASENAME || '');
  
  // Map FIPS to postal code
  const fipsToPostal = {
    '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL',
    '13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME',
    '24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH',
    '34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
    '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI',
    '56':'WY','60':'AS','66':'GU','69':'MP','72':'PR','78':'VI'
  };
  const state = fipsToPostal[stateFips];
  
  // Normalize: '00' or '0' means at-large
  if (cd === '00' || cd === '0') cd = 'AL';
  
  return { state, district: cd, chamber: 'house', source: 'tigerweb' };
}

async function resolveAddress(addressOrZip) {
  const key = `addr:${addressOrZip}`;
  const cached = cache.get(key);
  if (cached) return cached;
  // If looks like a 5-digit zip, try zip path first
  const zipMatch = String(addressOrZip).match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zipRes = await resolveByZip(zipMatch[1]);
    if (zipRes) {
      cache.set(key, zipRes);
      return zipRes;
    }
  }
  // Geocode with Nominatim
  const g = await geocodeAddress(addressOrZip);
  if (!g) {
    cache.set(key, null);
    return null;
  }
  const t = await queryTigerWebCD119(g.lat, g.lon);
  if (t) {
    cache.set(key, t);
    return t;
  }
  // tigerweb failed — use nearest-centroid fallback
  const fallback = nearestDistrictByCentroid(parseFloat(g.lat), parseFloat(g.lon));
  cache.set(key, fallback);
  return fallback;
}

module.exports = { resolveByZip, resolveAddress, cache };
