#!/usr/bin/env node
/**
 * Ingest House votes from clerk.house.gov EVS XML API
 * Fetches votes by calendar year (Clerk uses evs/YYYY/rollNNN.xml).
 * roll_call is stored as house-{congress}-{year}-{roll_number} so years don't collide.
 *
 * Usage:
 *   node scripts/ingest_house_votes.js --year 2026 (fetch recent missing for current year)
 *   node scripts/ingest_house_votes.js --year 2026 --all (fetch all available for that year)
 *   node scripts/ingest_house_votes.js --catch-up (catch up 2025 + 2026 to today, then ensure issues)
 *   node scripts/ingest_house_votes.js --year 2025 --start-roll 200 --count 50
 */

require('dotenv').config();
const fetch = require('node-fetch');
const { pool } = require('../db/pool');
const { parseEVSXML } = require('../services/evs_house_reader');
const { normalizeBillToken } = require('../services/bill_normalize');

const CURRENT_YEAR = new Date().getFullYear();

// Parse command line arguments
const args = process.argv.slice(2);
const yearArg = args.find(arg => arg.startsWith('--year='));
const startRollArg = args.find(arg => arg.startsWith('--start-roll='));
const countArg = args.find(arg => arg.startsWith('--count='));
const allFlag = args.includes('--all');
const catchUpFlag = args.includes('--catch-up');

const YEAR = yearArg ? parseInt(yearArg.split('=')[1]) : CURRENT_YEAR;
const CONGRESS = YEAR >= 2025 ? 119 : 118;
const START_ROLL = startRollArg ? parseInt(startRollArg.split('=')[1]) : null;
const COUNT = countArg ? parseInt(countArg.split('=')[1]) : 50;

/**
 * Get the latest roll_number in DB for a given calendar year (vote_date in that year).
 */
async function getLatestRollInDB(year) {
  const y = Number(year);
  const result = await pool.query(
    `SELECT MAX(roll_number) as max_roll
     FROM votes
     WHERE congress = $1 AND chamber = 'house'
       AND vote_date >= $2 AND vote_date < $3`,
    [CONGRESS, `${y}-01-01`, `${y + 1}-01-01`]
  );
  const max = result.rows[0]?.max_roll;
  return max != null ? Number(max) : 0;
}

/**
 * Get the latest vote_date in DB for a given calendar year.
 */
async function getLatestVoteDateInDB(year) {
  const y = Number(year);
  const result = await pool.query(
    `SELECT MAX(vote_date)::text as max_date
     FROM votes
     WHERE congress = $1 AND chamber = 'house'
       AND vote_date >= $2 AND vote_date < $3`,
    [CONGRESS, `${y}-01-01`, `${y + 1}-01-01`]
  );
  return result.rows[0]?.max_date || null;
}

/**
 * Find the highest roll call number available on clerk.house.gov for a given year.
 */
async function findMaxRollNumber(year) {
  const y = year != null ? year : YEAR;
  console.log(`🔍 Finding latest available roll call number for ${y}...`);
  
  let testRoll = 500;
  let maxFound = 0;
  
  while (testRoll <= 2000) {
    const url = `https://clerk.house.gov/evs/${y}/roll${testRoll.toString().padStart(3, '0')}.xml`;
    try {
      const resp = await fetch(url, { timeout: 5000 });
      if (resp.ok) {
        maxFound = testRoll;
        testRoll = Math.floor(testRoll * 1.5);
      } else {
        break;
      }
    } catch (err) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit
  }
  
  if (maxFound === 0) {
    for (let i = 1; i <= 100; i++) {
      const url = `https://clerk.house.gov/evs/${y}/roll${i.toString().padStart(3, '0')}.xml`;
      try {
        const resp = await fetch(url, { timeout: 5000 });
        if (resp.ok) {
          maxFound = i;
        } else {
          break;
        }
      } catch (err) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Binary search between maxFound and testRoll to find exact max
  let low = maxFound;
  let high = testRoll;
  
  while (low <= high && high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const url = `https://clerk.house.gov/evs/${y}/roll${mid.toString().padStart(3, '0')}.xml`;
    
    try {
      const resp = await fetch(url, { timeout: 5000 });
      if (resp.ok) {
        maxFound = Math.max(maxFound, mid);
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    } catch (err) {
      high = mid - 1;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Probe a few higher roll numbers in case Clerk just published (only pull what's new)
  for (const extra of [1, 2, 3]) {
    const probeRoll = maxFound + extra;
    const url = `https://clerk.house.gov/evs/${y}/roll${probeRoll.toString().padStart(3, '0')}.xml`;
    try {
      const resp = await fetch(url, { timeout: 5000 });
      if (resp.ok) {
        maxFound = probeRoll;
        console.log(`   (found newer roll ${probeRoll})`);
      } else {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      break;
    }
  }

  console.log(`✅ Latest roll call on Clerk: ${maxFound}\n`);
  return maxFound;
}

/**
 * Fetch and parse a single vote for a given year.
 */
async function fetchVote(rollNumber, year) {
  const y = year != null ? year : YEAR;
  const url = `https://clerk.house.gov/evs/${y}/roll${rollNumber.toString().padStart(3, '0')}.xml`;
  
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      if (resp.status === 404) {
        return null; // Vote doesn't exist
      }
      throw new Error(`HTTP ${resp.status}`);
    }
    
    const xml = await resp.text();
    const parsed = parseEVSXML(xml);
    return parsed;
  } catch (err) {
    console.error(`   ⚠️  Error fetching roll ${rollNumber}: ${err.message}`);
    return null;
  }
}

/**
 * Upsert vote into database.
 * @param {Object} voteData - Parsed EVS vote
 * @param {number} ingestionYear - Year being ingested (for roll_call when date missing)
 */
async function upsertVote(voteData, ingestionYear) {
  const client = await pool.connect();
  const yearForRoll = ingestionYear != null ? ingestionYear : YEAR;
  
  try {
    await client.query('BEGIN');
    
    // Calculate canonical_bill_id if we have a bill reference
    let canonicalBillId = null;
    const rawRef = voteData.bill_reference;
    if (rawRef) {
      const refStr = typeof rawRef === 'object' ? (rawRef.billType ? `${rawRef.billType} ${rawRef.billNumber}` : JSON.stringify(rawRef)) : String(rawRef);
      canonicalBillId = normalizeBillToken(refStr);
    }
    
    // Try to find matching issue
    let issueId = null;
    if (canonicalBillId) {
      const issueRes = await client.query(
        `SELECT id FROM issues WHERE canonical_bill_id = $1 LIMIT 1`,
        [canonicalBillId]
      );
      if (issueRes.rows[0]) {
        issueId = issueRes.rows[0].id;
      }
    }
    
    // Upsert individual vote records for each member
    let insertedCount = 0;
    for (const member of voteData.votes) {
      // Find representative by bioguide_id
      const repRes = await client.query(
        `SELECT id FROM representatives WHERE bioguide_id = $1 LIMIT 1`,
        [member.bioguide_id]
      );
      
      if (repRes.rows[0]) {
        const repId = repRes.rows[0].id;
        
        // Store vote metadata as JSON
        const voteMetadata = {
          question: voteData.question,
          result: voteData.result,
          bill_reference: voteData.bill_reference
        };
        
        // roll_call includes year so 2025 roll 1 and 2026 roll 1 don't collide
        const voteYear = (voteData.date || '').substring(0, 4) || String(yearForRoll);
        const rollCall = `${voteData.chamber}-${voteData.congress}-${voteYear}-${voteData.roll_number}`;

        await client.query(
          `INSERT INTO votes (
            representative_id, issue_id, vote, vote_date, 
            roll_call, chamber, session, congress, roll_number, 
            canonical_bill_id, vote_metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (representative_id, roll_call, chamber)
          DO UPDATE SET
            issue_id = EXCLUDED.issue_id,
            vote = EXCLUDED.vote,
            vote_date = EXCLUDED.vote_date,
            congress = EXCLUDED.congress,
            roll_number = EXCLUDED.roll_number,
            canonical_bill_id = EXCLUDED.canonical_bill_id,
            vote_metadata = EXCLUDED.vote_metadata`,
          [
            repId,
            issueId,
            normalizeVoteForDB(member.vote),
            voteData.date,
            rollCall,
            voteData.chamber,
            voteData.session || null,
            voteData.congress,
            voteData.roll_number,
            canonicalBillId,
            JSON.stringify(voteMetadata)
          ]
        );
        insertedCount++;
      }
    }
    
    await client.query('COMMIT');
    return { issueId, memberCount: insertedCount };
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Normalize vote value to match database constraint
 * DB expects: 'yes', 'no', 'abstain', 'present', 'not voting'
 * EVS parser returns: 'Yea', 'Nay', 'Present', 'Not Voting'
 */
function normalizeVoteForDB(vote) {
  if (!vote) return 'not voting';
  const v = vote.toString().toLowerCase().trim();
  if (v === 'yea' || v === 'aye' || v === 'yes' || v === 'y') return 'yes';
  if (v === 'nay' || v === 'no' || v === 'n') return 'no';
  if (v === 'present' || v === 'p') return 'present';
  if (v === 'abstain') return 'abstain';
  return 'not voting';
}

/**
 * Create issues from votes that have canonical_bill_id but no issue_id, then link them.
 */
async function ensureIssuesFromVotes() {
  console.log('\n📌 Ensuring issues exist for all votes with bill references...');
  const client = await pool.connect();
  try {
    const distinct = await client.query(`
      SELECT DISTINCT canonical_bill_id, vote_metadata
      FROM votes
      WHERE canonical_bill_id IS NOT NULL
    `);
    let created = 0;
    for (const row of distinct.rows) {
      const meta = row.vote_metadata || {};
      const title = meta.question || `Bill ${row.canonical_bill_id}`;
      const description = meta.question || '';
      await client.query(
        `INSERT INTO issues (title, description, bill_id, canonical_bill_id, source)
         VALUES ($1, $2, $3, $4, 'house_clerk_evs')
         ON CONFLICT (canonical_bill_id) DO UPDATE SET
           title = COALESCE(issues.title, EXCLUDED.title),
           description = COALESCE(issues.description, EXCLUDED.description)
         RETURNING id`,
        [title, description, row.canonical_bill_id, row.canonical_bill_id]
      );
      created++;
    }
    const link = await client.query(`
      UPDATE votes v SET issue_id = i.id
      FROM issues i
      WHERE v.canonical_bill_id = i.canonical_bill_id AND v.issue_id IS NULL
    `);
    console.log(`   ✅ Issues ensured; ${link.rowCount} votes linked to issues.\n`);
  } finally {
    client.release();
  }
}

/**
 * Ingest House votes for a single calendar year.
 */
async function ingestVotesForYear(year) {
  const congress = year >= 2025 ? 119 : 118;
  let startRoll, endRoll;

  if (allFlag || catchUpFlag) {
    const maxRoll = await findMaxRollNumber(year);
    const latestInDB = await getLatestRollInDB(year);
    const latestDateInDB = await getLatestVoteDateInDB(year);
    console.log(`📊 [${year}] DB has up to roll ${latestInDB} (latest vote_date: ${latestDateInDB || 'none'}); Clerk has up to roll ${maxRoll}`);
    startRoll = maxRoll;
    endRoll = latestInDB + 1;
  } else if (START_ROLL) {
    startRoll = START_ROLL;
    endRoll = Math.max(1, START_ROLL - COUNT + 1);
  } else {
    const maxRoll = await findMaxRollNumber(year);
    const latestInDB = await getLatestRollInDB(year);
    const latestDateInDB = await getLatestVoteDateInDB(year);
    console.log(`📊 [${year}] DB has up to roll ${latestInDB} (latest vote_date: ${latestDateInDB || 'none'}); Clerk has up to roll ${maxRoll}`);
    startRoll = maxRoll;
    endRoll = Math.max(1, Math.max(latestInDB + 1, maxRoll - COUNT + 1));
  }

  const rolls = [];
  for (let i = startRoll; i >= endRoll; i--) rolls.push(i);

  if (rolls.length === 0) {
    const latestDateInDB = await getLatestVoteDateInDB(year);
    console.log(`✅ [${year}] No new votes to fetch. (DB latest vote_date: ${latestDateInDB || 'none'})\n`);
    return;
  }

  console.log(`🚀 [${year}] Fetching rolls ${rolls[0]} down to ${rolls[rolls.length - 1]} (${rolls.length} total)\n`);
  let processed = 0, succeeded = 0, failed = 0, skipped = 0;

  for (const rollNum of rolls) {
    processed++;
    if (processed % 10 === 0) {
      console.log(`   Progress: ${processed}/${rolls.length} (${succeeded} saved, ${skipped} skipped, ${failed} failed)`);
    }
    const voteData = await fetchVote(rollNum, year);
    if (!voteData) {
      skipped++;
      continue;
    }
    try {
      const result = await upsertVote(voteData, year);
      succeeded++;
      if (processed <= 5 || processed % 50 === 0) {
        console.log(`   ✅ Roll ${rollNum}: ${(voteData.question || '').substring(0, 60)}... (${result.memberCount} votes${result.issueId ? ', linked' : ''})`);
      }
    } catch (err) {
      failed++;
      console.error(`   ❌ Roll ${rollNum}: ${err.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const latestDateAfter = await getLatestVoteDateInDB(year);
  console.log(`\n📊 [${year}] Processed: ${processed}, Succeeded: ${succeeded}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`   Latest vote_date in DB for ${year}: ${latestDateAfter || 'none'}\n`);
}

/**
 * Main: catch-up (multiple years) or single-year ingestion, then ensure issues.
 */
async function main() {
  try {
    if (catchUpFlag) {
      console.log('╔════════════════════════════════════════════════════╗');
      console.log('║         HOUSE VOTES CATCH-UP (2025 → today)         ║');
      console.log('╚════════════════════════════════════════════════════╝\n');
      for (let y = 2025; y <= CURRENT_YEAR; y++) {
        console.log(`\n━━━ Year ${y} ━━━\n`);
        await ingestVotesForYear(y);
      }
      await ensureIssuesFromVotes();
    } else {
      console.log('╔════════════════════════════════════════════════════╗');
      console.log('║         HOUSE VOTES INGESTION PIPELINE            ║');
      console.log('╚════════════════════════════════════════════════════╝\n');
      console.log(`📋 Year: ${YEAR} (Congress ${YEAR >= 2025 ? 119 : 118})`);
      console.log(`📊 Mode: ${allFlag ? 'Fetch ALL' : `Fetch up to ${COUNT} recent`}\n`);
      await ingestVotesForYear(YEAR);
      await ensureIssuesFromVotes();
    }
    console.log('✅ Ingest complete.\n');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
