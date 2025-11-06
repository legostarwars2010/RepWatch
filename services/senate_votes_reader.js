/**
 * Senate Votes Reader Adapter
 * 
 * Parses Senate roll-call XML into NormalizedVote format
 * Compatible with existing votes DTO schema
 */

const fs = require('fs').promises;
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { makeVoteKey, makeBillKey, extractBillReference } = require('../lib/vote_keys');

/**
 * Parse Senate roll-call XML
 * @param {string} xml - Raw XML string from Senate
 * @returns {Promise<NormalizedVote>}
 */
async function parseSenateXML(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: true
  });
  
  const result = parser.parse(xml);
  const rollCall = result.roll_call_vote || result.rollCallVote;
  
  if (!rollCall) {
    throw new Error('Invalid Senate XML: missing roll_call_vote element');
  }
  
  // Extract core metadata
  const congress = parseInt(rollCall.congress, 10);
  const session = parseInt(rollCall.session, 10);
  const rollNumber = parseInt(rollCall.vote_number || rollCall.voteNumber, 10);
  
  // Parse date
  const voteDate = parseSenateDate(rollCall.vote_date || rollCall.voteDate);
  
  // Generate vote key
  const voteKey = makeVoteKey('senate', voteDate, rollNumber);
  
  // Extract question/motion
  const question = rollCall.vote_question || rollCall.question || rollCall.vote_title || '';
  
  // Extract bill reference
  const billRef = extractBillReferenceFromSenate(rollCall);
  let billKey = null;
  if (billRef) {
    billKey = makeBillKey(congress, billRef.billType, billRef.billNumber);
  }
  
  // Extract result
  const result_text = rollCall.vote_result || rollCall.result || '';
  
  // Parse vote counts
  const voteCounts = parseSenateVoteCounts(rollCall);
  
  // Parse individual member votes
  const members = parseSenateMembers(rollCall);
  
  return {
    vote_key: voteKey,
    chamber: 'senate',
    congress,
    session,
    roll_number: rollNumber,
    date: voteDate,
    question,
    bill_reference: billRef ? formatBillNumber(billRef) : null,
    bill_key: billKey,
    result: result_text,
    yeas: voteCounts.yea,
    nays: voteCounts.nay,
    present: voteCounts.present,
    not_voting: voteCounts.notVoting,
    votes: members,
    source: 'first_party'
  };
}

/**
 * Parse Senate date to ISO format
 * @param {string} dateStr - Date string from Senate XML
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function parseSenateDate(dateStr) {
  if (!dateStr) {
    throw new Error('Missing date in Senate XML');
  }
  
  // Senate typically uses formats like "January 15, 2025" or "2025-01-15"
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  
  return date.toISOString().split('T')[0];
}

/**
 * Extract bill reference from Senate XML
 * @param {Object} rollCall - Parsed roll call object
 * @returns {{billType: string, billNumber: number}|null}
 */
function extractBillReferenceFromSenate(rollCall) {
  // Try explicit document fields
  if (rollCall.document) {
    const doc = rollCall.document;
    if (doc.document_type && doc.document_number) {
      return parseSenateDocumentType(doc.document_type, doc.document_number);
    }
  }
  
  // Try parsing from question text
  if (rollCall.vote_question || rollCall.question) {
    return extractBillReference(rollCall.vote_question || rollCall.question);
  }
  
  // Try vote_document_text
  if (rollCall.vote_document_text || rollCall.voteDocumentText) {
    return extractBillReference(rollCall.vote_document_text || rollCall.voteDocumentText);
  }
  
  return null;
}

/**
 * Parse Senate document type to bill reference
 * @param {string} docType - Document type (e.g., "S.", "H.R.", "PN", "Treaty", etc.)
 * @param {string|number} docNumber - Document number
 * @returns {{billType: string, billNumber: number}|null}
 */
function parseSenateDocumentType(docType, docNumber) {
  // Handle non-bill documents
  if (docType === 'PN' || docType === 'Treaty') {
    return null; // Presidential Nomination or Treaty - not a bill
  }
  
  // Normalize document type and parse bill number
  const typeStr = docType.trim().replace(/\.$/, ''); // Remove trailing period
  const billNum = parseInt(docNumber, 10);
  
  if (isNaN(billNum)) {
    return null;
  }
  
  // Map Senate document types to bill_type format
  // Senate uses: S., H.R., S.Res., H.Res., S.J.Res., H.J.Res., S.Con.Res., H.Con.Res.
  const typeMap = {
    'S': 's',
    'H R': 'hr',
    'HR': 'hr',
    'S Res': 'sres',
    'SRes': 'sres',
    'H Res': 'hres',
    'HRes': 'hres',
    'S J Res': 'sjres',
    'SJRes': 'sjres',
    'H J Res': 'hjres',
    'HJRes': 'hjres',
    'S Con Res': 'sconres',
    'SConRes': 'sconres',
    'H Con Res': 'hconres',
    'HConRes': 'hconres'
  };
  
  // Normalize spacing and case
  const normalized = typeStr.replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const billType = typeMap[normalized];
  
  if (billType) {
    return { billType, billNumber: billNum };
  }
  
  // If we can't map it, return null
  return null;
}

/**
 * Parse Senate vote counts
 * @param {Object} rollCall - Parsed roll call object
 * @returns {{yea: number, nay: number, present: number, notVoting: number}}
 */
function parseSenateVoteCounts(rollCall) {
  const count = rollCall.count || {};
  
  // Senate uses "Yeas" and "Nays"
  const yea = parseInt(count.yeas || count.Yeas || 0, 10);
  const nay = parseInt(count.nays || count.Nays || 0, 10);
  const present = parseInt(count.present || count.Present || 0, 10);
  const absent = parseInt(count.absent || count.Absent || 0, 10);
  
  // "Not Voting" includes absent
  const notVoting = absent + parseInt(count.not_voting || count['not-voting'] || 0, 10);
  
  return { yea, nay, present, notVoting };
}

/**
 * Parse Senate member votes
 * @param {Object} rollCall - Parsed roll call object
 * @returns {Array<{bioguide_id: string, vote: string}>}
 */
function parseSenateMembers(rollCall) {
  const members = [];
  
  const memberData = rollCall.members?.member;
  if (!memberData) {
    return members;
  }
  
  // Handle single member or array
  const memberArray = Array.isArray(memberData) ? memberData : [memberData];
  
  for (const member of memberArray) {
    const bioguideId = member.lis_member_id; // Senate uses lis_member_id
    const vote = normalizeSenateVote(member.vote_cast || member.voteCast);
    
    if (bioguideId && vote) {
      members.push({
        bioguide_id: bioguideId,
        vote
      });
    }
  }
  
  return members;
}

/**
 * Normalize Senate vote value
 * @param {string} voteValue - Raw vote value from Senate XML
 * @returns {string} Normalized: 'Yea', 'Nay', 'Present', 'Not Voting'
 */
function normalizeSenateVote(voteValue) {
  if (!voteValue) return 'Not Voting';
  
  const normalized = voteValue.toString().toLowerCase().trim();
  
  if (['yea', 'aye', 'yes', 'guilty'].includes(normalized)) return 'Yea';
  if (['nay', 'no', 'not guilty'].includes(normalized)) return 'Nay';
  if (['present'].includes(normalized)) return 'Present';
  if (['absent'].includes(normalized)) return 'Not Voting';
  
  return 'Not Voting';
}

/**
 * Format bill reference for display
 * @param {{billType: string, billNumber: number}} billRef
 * @returns {string}
 */
function formatBillNumber(billRef) {
  const typeMap = {
    'hr': 'H.R.',
    's': 'S.',
    'hjres': 'H.J.Res.',
    'sjres': 'S.J.Res.',
    'hconres': 'H.Con.Res.',
    'sconres': 'S.Con.Res.',
    'hres': 'H.Res.',
    'sres': 'S.Res.',
  };
  
  const displayType = typeMap[billRef.billType.toLowerCase()] || billRef.billType.toUpperCase();
  return `${displayType} ${billRef.billNumber}`;
}

/**
 * Read and parse Senate XML file
 * @param {string} filePath - Path to Senate XML file
 * @returns {Promise<NormalizedVote>}
 */
async function readSenateXMLFile(filePath) {
  const fs = require('fs').promises;
  const content = await fs.readFile(filePath, 'utf8');
  return parseSenateXML(content);
}

/**
 * Fetch Senate votes for a congress-session
 * @param {number} congress - Congress number
 * @param {number} session - Session number
 * @returns {Promise<Array<NormalizedVote>>}
 */
async function fetchSenateVotes(congress, session) {
  // This would fetch from Senate.gov
  // For now, placeholder for the actual implementation
  throw new Error('fetchSenateVotes not yet implemented - use readSenateXMLFile with local files');
}

module.exports = {
  parseSenateXML,
  readSenateXMLFile,
  fetchSenateVotes,
  normalizeSenateVote,
  parseSenateDate,
};
