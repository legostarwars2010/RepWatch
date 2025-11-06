/**
 * EVS House Reader Adapter
 * 
 * Parses House Clerk EVS XML/JSON into NormalizedVote format
 * Compatible with existing votes DTO schema
 */

const { XMLParser } = require('fast-xml-parser');
const { makeVoteKey, makeBillKey, extractBillReference, extractRollNumber } = require('../lib/vote_keys');

/**
 * Normalized Vote DTO (matches current schema)
 * @typedef {Object} NormalizedVote
 * @property {string} vote_key - chamber:YYYY-MM-DD:roll_number
 * @property {string} chamber - 'house' or 'senate'
 * @property {number} congress - Congress number
 * @property {number} session - Session number
 * @property {number} roll_number - Roll call number
 * @property {string} vote_date - ISO date string
 * @property {string} question - Motion/question text
 * @property {string|null} bill_number - Bill reference (e.g., "H.R. 123")
 * @property {string|null} bill_key - congress:bill_type:bill_number
 * @property {string} result - 'Passed', 'Failed', 'Agreed to', etc.
 * @property {number} yea_count - Yes votes
 * @property {number} nay_count - No votes
 * @property {number} present_count - Present votes
 * @property {number} not_voting_count - Not voting count
 * @property {Array<{bioguide_id: string, vote: string}>} members - Individual votes
 * @property {Object} metadata - Additional EVS-specific data
 */

/**
 * Parse EVS XML (House Clerk format)
 * @param {string} xml - Raw XML string from House Clerk EVS
 * @returns {NormalizedVote}
 */
function parseEVSXML(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: true
  });
  
  const result = parser.parse(xml);
  const rollcall = result['rollcall-vote'] || result.rollcall_vote || result.rollcall;
  
  if (!rollcall) {
    throw new Error('Invalid EVS XML: missing rollcall-vote element');
  }

  // Extract metadata
  const metadata = rollcall['vote-metadata'] || rollcall.vote_metadata || rollcall.metadata || rollcall;
  
  const congress = parseInt(metadata.congress, 10);
  const chamber = 'house';
  const rollNumber = parseInt(metadata['rollcall-num'] || metadata.rollcall_num || metadata.roll_number, 10);
  
  // Parse date (format: "DD-MMM-YYYY" like "19-Sep-2025")
  const actionDate = metadata['action-date'] || metadata.action_date || metadata.date;
  const voteDate = parseEVSDate(actionDate);
  
  // Generate vote key
  const voteKey = makeVoteKey(chamber, voteDate, rollNumber);
  
  // Extract question and bill reference
  const question = metadata['vote-question'] || metadata.vote_question || metadata.question || '';
  const legisNum = metadata['legis-num'] || metadata.legis_num || metadata.bill_number || '';
  const billReference = extractBillReference(legisNum) || extractBillReference(question);

  let billKey = null;
  if (billReference) {
    // extractBillReference returns {billType, billNumber} or null
    if (typeof billReference === 'object') {
      billKey = makeBillKey(congress, billReference.billType, billReference.billNumber);
    } else if (typeof billReference === 'string') {
      // Try to parse string form into components
      const parsedRef = extractBillReference(String(billReference));
      if (parsedRef) {
        billKey = makeBillKey(congress, parsedRef.billType, parsedRef.billNumber);
      }
    }
  }
  
  // Extract result
  const result_text = metadata['vote-result'] || metadata.vote_result || metadata.result || '';
  
  // Parse vote data
  const voteData = rollcall['vote-data'] || rollcall.vote_data || rollcall.votes || {};
  const recordedVotes = voteData['recorded-vote'] || voteData.recorded_vote || voteData.member || [];
  const voteArray = Array.isArray(recordedVotes) ? recordedVotes : [recordedVotes];
  
  // Count votes
  let yeas = 0, nays = 0, present = 0, notVoting = 0;
  const votes = [];
  
  for (const rv of voteArray) {
    // Extract legislator info
    const legislator = rv.legislator || rv;
    const nameId = legislator['@_name-id'] || legislator.name_id || legislator['@_id'];
    const name = legislator['#text'] || legislator.name || legislator['@_name'] || '';
    const party = legislator['@_party'] || legislator.party;
    const state = legislator['@_state'] || legislator.state;
    
    // Extract vote value
    const voteValue = rv.vote || rv['@_vote'] || '';
    const normalizedVote = normalizeVoteValue(voteValue);
    
    // Count by type
    if (normalizedVote === 'Yea') yeas++;
    else if (normalizedVote === 'Nay') nays++;
    else if (normalizedVote === 'Present') present++;
    else notVoting++;
    
    votes.push({
      bioguide_id: nameId,
      name,
      party,
      state,
      vote: normalizedVote
    });
  }
  
  return {
    vote_key: voteKey,
    chamber,
    congress,
    roll_number: rollNumber,
    date: voteDate,
    question,
    bill_reference: billReference,
    bill_key: billKey,
    result: result_text,
    yeas,
    nays,
    present,
    not_voting: notVoting,
    votes,
    source: 'first_party'
  };
}

/**
 * Parse EVS JSON (House Clerk format)
 * @param {Object|string} json - EVS JSON object or string
 * @returns {NormalizedVote}
 */
function parseEVSJSON(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  
  // Extract core vote metadata
  const congress = parseInt(data.congress || data.Congress, 10);
  const session = parseInt(data.session || data.Session, 10);
  const rollNumber = parseInt(data.rollnumber || data.rollNumber || data['roll-number'], 10);
  
  // Parse date
  const voteDate = parseEVSDate(data.date || data.action_date || data.actionDate);
  
  // Generate vote key
  const voteKey = makeVoteKey('house', voteDate, rollNumber);
  
  // Extract question/motion
  const question = data.question || data.vote_question || data.voteQuestion || '';
  
  // Extract bill reference
  const billRef = extractBillReferenceFromEVS(data);
  let billKey = null;
  if (billRef) {
    const { makeBillKey } = require('../lib/vote_keys');
    billKey = makeBillKey(congress, billRef.billType, billRef.billNumber);
  }
  
  // Extract result
  const result = data.result || data.vote_result || data.voteResult || '';
  
  // Parse vote counts
  const voteCounts = parseVoteCounts(data);
  
  // Parse individual member votes
  const members = parseMemberVotes(data);
  
  return {
    vote_key: voteKey,
    chamber: 'house',
    congress,
    session,
    roll_number: rollNumber,
    vote_date: voteDate,
    question,
    bill_number: billRef ? `${billRef.billType.toUpperCase()} ${billRef.billNumber}` : null,
    bill_key: billKey,
    result,
    yea_count: voteCounts.yea,
    nay_count: voteCounts.nay,
    present_count: voteCounts.present,
    not_voting_count: voteCounts.notVoting,
    members,
    metadata: {
      source: 'evs_house',
      legis_num: data.legis_num || data.legislativeNumber,
      vote_type: data.vote_type || data.voteType,
      raw_date: data.date,
    }
  };
}

/**
 * Parse EVS date to ISO format
 * @param {string} dateStr - Date string from EVS
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function parseEVSDate(dateStr) {
  if (!dateStr) {
    throw new Error('Missing date in EVS data');
  }
  
  // Handle various EVS date formats
  // Common format from House Clerk: "DD-MMM-YYYY" (e.g., "19-Sep-2025")
  const ddMmmYyyy = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/;
  const match = dateStr.match(ddMmmYyyy);
  
  if (match) {
    const [, day, monthStr, year] = match;
    const monthMap = {
      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
      'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
      'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };
    const month = monthMap[monthStr.toLowerCase()];
    if (!month) {
      throw new Error(`Invalid month: ${monthStr}`);
    }
    return `${year}-${month}-${day.padStart(2, '0')}`;
  }
  
  // Try standard Date parsing as fallback
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  
  return date.toISOString().split('T')[0];
}

/**
 * Extract bill reference from EVS data
 * @param {Object} data - EVS data object
 * @returns {{billType: string, billNumber: number}|null}
 */
function extractBillReferenceFromEVS(data) {
  // Try explicit fields first
  if (data.bill_number || data.billNumber) {
    const { extractBillReference } = require('../lib/vote_keys');
    return extractBillReference(data.bill_number || data.billNumber);
  }
  
  // Try parsing from question text
  if (data.question) {
    const { extractBillReference } = require('../lib/vote_keys');
    return extractBillReference(data.question);
  }
  
  // Try legis_num field
  if (data.legis_num) {
    const { extractBillReference } = require('../lib/vote_keys');
    return extractBillReference(data.legis_num);
  }
  
  return null;
}

/**
 * Parse vote counts from EVS data
 * @param {Object} data - EVS data object
 * @returns {{yea: number, nay: number, present: number, notVoting: number}}
 */
function parseVoteCounts(data) {
  // EVS uses various field names
  const yea = parseInt(
    data.yea_total || data.yeaTotal || data.yea || data.Yea || data.ayes || 0,
    10
  );
  
  const nay = parseInt(
    data.nay_total || data.nayTotal || data.nay || data.Nay || data.noes || 0,
    10
  );
  
  const present = parseInt(
    data.present_total || data.presentTotal || data.present || data.Present || 0,
    10
  );
  
  const notVoting = parseInt(
    data.not_voting_total || data.notVotingTotal || data.not_voting || data['not-voting'] || 0,
    10
  );
  
  return { yea, nay, present, notVoting };
}

/**
 * Parse individual member votes from EVS data
 * @param {Object} data - EVS data object
 * @returns {Array<{bioguide_id: string, vote: string}>}
 */
function parseMemberVotes(data) {
  const members = [];
  
  // EVS typically has vote_data or recorded_vote arrays
  const voteData = data.vote_data || data.voteData || data.recorded_vote || data.recordedVote || [];
  
  for (const record of voteData) {
    const bioguideId = record.bioguide_id || record.bioguideId || record.legislator?.bioguide_id;
    const vote = normalizeVoteValue(record.vote || record.votecast || record.voteCast);
    
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
 * Normalize vote value to standard format
 * @param {string} voteValue - Raw vote value from EVS
 * @returns {string} Normalized: 'Yea', 'Nay', 'Present', 'Not Voting'
 */
function normalizeVoteValue(voteValue) {
  if (!voteValue) return 'Not Voting';
  
  const normalized = voteValue.toString().toLowerCase().trim();
  
  if (['yea', 'aye', 'yes', 'y'].includes(normalized)) return 'Yea';
  if (['nay', 'no', 'n'].includes(normalized)) return 'Nay';
  if (['present', 'p'].includes(normalized)) return 'Present';
  
  return 'Not Voting';
}

/**
 * Read and parse multiple EVS files
 * @param {string|Array<string>} filePathOrGlob - File path or glob pattern
 * @returns {Promise<Array<NormalizedVote>>}
 */
async function readEVSFiles(filePathOrGlob) {
  const fs = require('fs').promises;
  const path = require('path');
  const glob = require('glob');
  
  // Resolve glob pattern or directory
  let files = [];
  if (Array.isArray(filePathOrGlob)) {
    files = filePathOrGlob;
  } else {
    // Check if it's a directory
    try {
      const stats = await fs.stat(filePathOrGlob);
      if (stats.isDirectory()) {
        // Read all .xml and .json files from directory
        const dirFiles = await fs.readdir(filePathOrGlob);
        files = dirFiles
          .filter(f => f.endsWith('.xml') || f.endsWith('.json'))
          .map(f => path.join(filePathOrGlob, f));
      } else {
        files = [filePathOrGlob];
      }
    } catch (err) {
      // Not a file or directory, try as glob pattern
      if (filePathOrGlob.includes('*')) {
        files = await new Promise((resolve, reject) => {
          glob(filePathOrGlob, (err, matches) => {
            if (err) reject(err);
            else resolve(matches);
          });
        });
      } else {
        files = [filePathOrGlob];
      }
    }
  }
  
  const votes = [];
  
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      const ext = path.extname(file).toLowerCase();
      
      let vote;
      if (ext === '.json') {
        vote = parseEVSJSON(content);
      } else if (ext === '.xml') {
        vote = parseEVSXML(content);
      } else {
        console.warn(`Unsupported file type: ${file}`);
        continue;
      }
      
      votes.push(vote);
    } catch (error) {
      console.error(`Error parsing ${file}:`, error.message);
    }
  }
  
  return votes;
}

module.exports = {
  parseEVSJSON,
  parseEVSXML,
  readEVSFiles,
  parseEVSDate,
  normalizeVoteValue,
};
