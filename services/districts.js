const path = require('path');
const map = require(path.join(__dirname, '..', 'data', 'district_map.json'));

function parseZip(address) {
  // crude: find 5-digit ZIP in address
  const m = address.match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function resolveDistrict({ address }) {
  if (!address) throw new Error('address required');
  const zip = parseZip(address || '');
  if (zip && map[zip]) return map[zip];
  return map['default'];
}

module.exports = { resolveDistrict };
