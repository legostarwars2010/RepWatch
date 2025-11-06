/**
 * Deterministic Key System for Votes and Bills
 * 
 * Provides canonical key formats for matching votes to bills without database lookups.
 */

/**
 * Generate a deterministic vote key
 * @param {string} chamber - 'house' or 'senate'
 * @param {string|Date} date - Vote date (ISO string or Date object)
 * @param {number|string} rollNumber - Roll call number
 * @returns {string} Format: chamber:YYYY-MM-DD:roll_number
 */
function makeVoteKey(chamber, date, rollNumber) {
  const normalizedChamber = chamber.toLowerCase();
  
  // Normalize date to YYYY-MM-DD
  let dateStr;
  if (date instanceof Date) {
    dateStr = date.toISOString().split('T')[0];
  } else if (typeof date === 'string') {
    // Handle various formats
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid date: ${date}`);
    }
    dateStr = parsed.toISOString().split('T')[0];
  } else {
    throw new Error(`Invalid date type: ${typeof date}`);
  }
  
  // Normalize roll number to integer
  const rollNum = parseInt(rollNumber, 10);
  if (isNaN(rollNum) || rollNum < 1) {
    throw new Error(`Invalid roll number: ${rollNumber}`);
  }
  
  return `${normalizedChamber}:${dateStr}:${rollNum}`;
}

/**
 * Generate a deterministic bill key
 * @param {number|string} congress - Congress number (e.g., 119)
 * @param {string} billType - Bill type (hr, s, hjres, sjres, hconres, sconres, hres, sres)
 * @param {number|string} billNumber - Bill number
 * @returns {string} Format: congress:bill_type:bill_number
 */
function makeBillKey(congress, billType, billNumber) {
  const congressNum = parseInt(congress, 10);
  if (isNaN(congressNum) || congressNum < 1) {
    throw new Error(`Invalid congress number: ${congress}`);
  }
  
  // Normalize bill type to lowercase
  const normalizedType = billType.toLowerCase().replace(/\./g, '');
  
  // Validate bill type
  const validTypes = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];
  if (!validTypes.includes(normalizedType)) {
    throw new Error(`Invalid bill type: ${billType}. Must be one of: ${validTypes.join(', ')}`);
  }
  
  // Normalize bill number to integer
  const billNum = parseInt(billNumber, 10);
  if (isNaN(billNum) || billNum < 1) {
    throw new Error(`Invalid bill number: ${billNumber}`);
  }
  
  return `${congressNum}:${normalizedType}:${billNum}`;
}

/**
 * Parse a vote key back into components
 * @param {string} voteKey - Vote key in format chamber:YYYY-MM-DD:roll_number
 * @returns {{chamber: string, date: string, rollNumber: number}}
 */
function parseVoteKey(voteKey) {
  const parts = voteKey.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid vote key format: ${voteKey}`);
  }
  
  return {
    chamber: parts[0],
    date: parts[1],
    rollNumber: parseInt(parts[2], 10)
  };
}

/**
 * Parse a bill key back into components
 * @param {string} billKey - Bill key in format congress:bill_type:bill_number
 * @returns {{congress: number, billType: string, billNumber: number}}
 */
function parseBillKey(billKey) {
  const parts = billKey.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid bill key format: ${billKey}`);
  }
  
  return {
    congress: parseInt(parts[0], 10),
    billType: parts[1],
    billNumber: parseInt(parts[2], 10)
  };
}

/**
 * Extract bill reference from text (e.g., "H.R. 123", "S. 456")
 * @param {string} text - Text containing bill reference
 * @returns {{billType: string, billNumber: number}|null}
 */
function extractBillReference(text) {
  if (!text) return null;
  // Normalize common noisy characters but keep spacing for pattern matching
  const original = text;
  const t = String(text);

  // Try flexible patterns that allow optional dots and spaces between parts
  // House bills: H.R., HR, H R, H. R.
  let m = t.match(/\bH\s*\.?\s*R\s*\.?\s*(\d+)\b/i);
  if (m) return { billType: 'hr', billNumber: parseInt(m[1], 10) };

  // Senate bills: S., S
  m = t.match(/\bS\s*\.?\s*(\d+)\b/i);
  if (m) return { billType: 's', billNumber: parseInt(m[1], 10) };

  // House Joint Resolutions: H.J.Res., H J Res
  m = t.match(/\bH\s*\.?\s*J\s*\.?\s*Res\s*\.?\s*(\d+)\b/i);
  if (m) return { billType: 'hjres', billNumber: parseInt(m[1], 10) };

  // Senate Joint Resolutions
  m = t.match(/\bS\s*\.?\s*J\s*\.?\s*Res\s*\.?\s*(\d+)\b/i);
  if (m) return { billType: 'sjres', billNumber: parseInt(m[1], 10) };

  // House Concurrent Resolutions
  m = t.match(/\bH\s*\.?\s*Con\s*\.?\s*Res\s*\.?\s*(\d+)\b/i);
  if (m) return { billType: 'hconres', billNumber: parseInt(m[1], 10) };

  // Senate Concurrent Resolutions
  m = t.match(/\bS\s*\.?\s*Con\s*\.?\s*Res\s*\.?\s*(\d+)\b/i);
  if (m) return { billType: 'sconres', billNumber: parseInt(m[1], 10) };

  // Simple house/senate resolutions
  m = t.match(/\bH\s*\.?\s*Res\s*\.?\s*(\d+)\b/i);
  if (m) return { billType: 'hres', billNumber: parseInt(m[1], 10) };

  m = t.match(/\bS\s*\.?\s*Res\s*\.?\s*(\d+)\b/i);
  if (m) return { billType: 'sres', billNumber: parseInt(m[1], 10) };

  // Fallback: try to match compact forms like HR123 or S123
  m = t.match(/\bHR\s*(\d+)\b/i) || t.match(/\bHR(\d+)\b/i);
  if (m) return { billType: 'hr', billNumber: parseInt(m[1], 10) };

  m = t.match(/\bS(\d+)\b/i);
  if (m) return { billType: 's', billNumber: parseInt(m[1], 10) };

  return null;
}

/**
 * Extract roll number from text (e.g., "Roll no. 123", "Roll Call 456")
 * @param {string} text - Text containing roll reference
 * @returns {number|null}
 */
function extractRollNumber(text) {
  if (!text) return null;
  
  const patterns = [
    /\bRoll\s+no\.?\s+(\d+)/i,
    /\bRoll\s+Call\s+(?:no\.?\s+)?(\d+)/i,
    /\bRecord\s+Vote\s+(?:no\.?\s+)?(\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  return null;
}

module.exports = {
  makeVoteKey,
  makeBillKey,
  parseVoteKey,
  parseBillKey,
  extractBillReference,
  extractRollNumber,
};
