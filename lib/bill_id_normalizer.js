/**
 * Bill Normalization Library
 * Converts various bill reference formats to canonical IDs
 */

/**
 * Bill type mappings for normalization
 */
const BILL_TYPE_MAPPINGS = {
  // House bills
  'hr': 'hr',
  'h.r.': 'hr',
  'h.r': 'hr',
  'h r': 'hr',
  'hb': 'hr',
  'house bill': 'hr',
  
  // Senate bills
  's': 's',
  's.': 's',
  'sb': 's',
  'senate bill': 's',
  
  // House Joint Resolutions
  'hjres': 'hjres',
  'h.j.res.': 'hjres',
  'h.j.res': 'hjres',
  'h j res': 'hjres',
  'hjr': 'hjres',
  
  // Senate Joint Resolutions
  'sjres': 'sjres',
  's.j.res.': 'sjres',
  's.j.res': 'sjres',
  's j res': 'sjres',
  'sjr': 'sjres',
  
  // House Concurrent Resolutions
  'hconres': 'hconres',
  'h.con.res.': 'hconres',
  'h.con.res': 'hconres',
  'h con res': 'hconres',
  'hcr': 'hconres',
  
  // Senate Concurrent Resolutions
  'sconres': 'sconres',
  's.con.res.': 'sconres',
  's.con.res': 'sconres',
  's con res': 'sconres',
  'scr': 'sconres',
  
  // House Resolutions
  'hres': 'hres',
  'h.res.': 'hres',
  'h.res': 'hres',
  'h res': 'hres',
  
  // Senate Resolutions
  'sres': 'sres',
  's.res.': 'sres',
  's.res': 'sres',
  's res': 'sres',
};

/**
 * Normalize a bill reference to canonical format
 * @param {string} billRef - Raw bill reference (e.g., "H R 2766", "HB82", "S. 58")
 * @param {number} congress - Congress number (e.g., 118, 119)
 * @returns {object|null} - { canonical: "hr2766-118", type: "hr", number: 2766, congress: 118 } or null
 */
function normalizeBillId(billRef, congress = null) {
  if (!billRef) return null;
  
  // Clean the input
  let cleaned = String(billRef)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');  // normalize spaces
  
  // Try to extract congress from the reference if not provided
  // e.g., "hr2766-118" already has congress
  const congressMatch = cleaned.match(/[- ]+(\d{3})$/);
  if (congressMatch && !congress) {
    congress = parseInt(congressMatch[1]);
    cleaned = cleaned.replace(/[- ]+\d{3}$/, ''); // remove congress from string
  }
  
  // Pattern 1: Standard format "H R 2766", "S 58", "H.R. 1234"
  // Matches: letter(s) + optional punctuation + number
  const standardMatch = cleaned.match(/^([a-z]+[\.\s]*(?:[a-z]+[\.\s]*)*?)[\s\.\-]*(\d+)$/);
  if (standardMatch) {
    const typeRaw = standardMatch[1].replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    const number = parseInt(standardMatch[2]);
    const type = BILL_TYPE_MAPPINGS[typeRaw];
    
    if (type && number) {
      const canonical = congress ? `${type}${number}-${congress}` : `${type}${number}`;
      return { canonical, type, number, congress };
    }
  }
  
  // Pattern 2: Compact format "hr2766", "s58"
  const compactMatch = cleaned.match(/^([a-z]+)(\d+)$/);
  if (compactMatch) {
    const type = BILL_TYPE_MAPPINGS[compactMatch[1]];
    const number = parseInt(compactMatch[2]);
    
    if (type && number) {
      const canonical = congress ? `${type}${number}-${congress}` : `${type}${number}`;
      return { canonical, type, number, congress };
    }
  }
  
  // Pattern 3: Legiscan format "HB82", "SB58" (House Bill, Senate Bill)
  const legiscanMatch = cleaned.match(/^([hs])b(\d+)$/);
  if (legiscanMatch) {
    const type = legiscanMatch[1] === 'h' ? 'hr' : 's';
    const number = parseInt(legiscanMatch[2]);
    
    if (type && number) {
      const canonical = congress ? `${type}${number}-${congress}` : `${type}${number}`;
      return { canonical, type, number, congress };
    }
  }
  
  return null;
}

/**
 * Normalize multiple bill references
 * @param {string[]} billRefs - Array of bill references
 * @param {number} congress - Congress number
 * @returns {Array} - Array of normalized results
 */
function normalizeBillIds(billRefs, congress = null) {
  return billRefs
    .map(ref => normalizeBillId(ref, congress))
    .filter(result => result !== null);
}

/**
 * Parse bill info from Legiscan data structure
 * @param {object} legiscanBill - Bill object from Legiscan API
 * @returns {object|null} - Normalized bill info
 */
function parseLegiscanBill(legiscanBill) {
  if (!legiscanBill) return null;
  
  // Legiscan provides bill_number like "HB82"
  const billNumber = legiscanBill.bill_number;
  
  // Extract congress from session data
  let congress = null;
  if (legiscanBill.session && legiscanBill.session.session_name) {
    const congressMatch = legiscanBill.session.session_name.match(/(\d{3})(?:th|st|nd|rd)\s+Congress/);
    if (congressMatch) {
      congress = parseInt(congressMatch[1]);
    }
  }
  
  return normalizeBillId(billNumber, congress);
}

/**
 * Parse bill info from House clerk XML structure
 * @param {object} voteMetadata - vote-metadata from clerk XML
 * @returns {object|null} - Normalized bill info
 */
function parseClerkHouseBill(voteMetadata) {
  if (!voteMetadata) return null;
  
  const legisNum = voteMetadata['legis-num'] || voteMetadata.legis_num;
  const congress = voteMetadata.congress;
  
  return normalizeBillId(legisNum, congress);
}

/**
 * Parse bill info from Congress.gov API structure
 * @param {object} billData - Bill object from Congress.gov API
 * @returns {object|null} - Normalized bill info
 */
function parseCongressApiBill(billData) {
  if (!billData) return null;
  
  const type = (billData.type || '').toLowerCase();
  const number = billData.number;
  const congress = billData.congress;
  
  if (!type || !number) return null;
  
  const normalizedType = BILL_TYPE_MAPPINGS[type];
  if (!normalizedType) return null;
  
  const canonical = congress ? `${normalizedType}${number}-${congress}` : `${normalizedType}${number}`;
  return { canonical, type: normalizedType, number, congress };
}

/**
 * Test the normalization with various formats
 */
function testNormalization() {
  const testCases = [
    { input: 'H R 2766', congress: 118, expected: 'hr2766-118' },
    { input: 'S 58', congress: 118, expected: 's58-118' },
    { input: 'H.R. 1234', congress: 119, expected: 'hr1234-119' },
    { input: 'HB82', congress: 119, expected: 'hr82-119' },
    { input: 'SB123', congress: 118, expected: 's123-118' },
    { input: 'hr2766-118', congress: null, expected: 'hr2766-118' },
    { input: 'H J RES 5', congress: 118, expected: 'hjres5-118' },
    { input: 'S.J.RES. 12', congress: 118, expected: 'sjres12-118' },
  ];
  
  console.log('Bill Normalization Tests:\n');
  testCases.forEach(({ input, congress, expected }) => {
    const result = normalizeBillId(input, congress);
    const actual = result ? result.canonical : null;
    const pass = actual === expected ? '✅' : '❌';
    console.log(`${pass} "${input}" (congress ${congress}) => "${actual}" (expected "${expected}")`);
  });
}

module.exports = {
  normalizeBillId,
  normalizeBillIds,
  parseLegiscanBill,
  parseClerkHouseBill,
  parseCongressApiBill,
  testNormalization,
  BILL_TYPE_MAPPINGS
};
