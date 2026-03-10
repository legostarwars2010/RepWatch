#!/usr/bin/env node
/**
 * Ingest Senate votes from senate.gov roll-call XML API.
 *
 * Senate URL pattern:
 *   https://www.senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{padded_roll}.xml
 *   e.g. vote1191/vote_119_1_00001.xml  (119th Congress, Session 1, Roll 1)
 *
 * Senators are matched by external_ids->>'lis' (e.g. "S275").
 * Votes stored with chamber='senate', roll_call='senate-{congress}-{year}-{roll}'.
 *
 * Usage:
 *   node scripts/ingest_senate_votes.js                          # fetch recent ~50 for current year
 *   node scripts/ingest_senate_votes.js --year=2025 --all        # fetch all of 2025
 *   node scripts/ingest_senate_votes.js --year=2025 --count=100  # fetch latest 100 for 2025
 *   node scripts/ingest_senate_votes.js --catch-up               # catch up 2025 + 2026
 *   node scripts/ingest_senate_votes.js --year=2026 --start-roll=50 --count=10
 */

require('dotenv').config();
const fetch = require('node-fetch');
const { pool } = require('../db/pool');
const { parseSenateXML } = require('../services/senate_votes_reader');
const { normalizeBillToken } = require('../services/bill_normalize');

const CURRENT_YEAR = new Date().getFullYear();

const args = process.argv.slice(2);
const yearArg    = args.find(a => a.startsWith('--year='));
const startArg   = args.find(a => a.startsWith('--start-roll='));
const countArg   = args.find(a => a.startsWith('--count='));
const allFlag    = args.includes('--all');
const catchUpFlag = args.includes('--catch-up');

const YEAR       = yearArg  ? parseInt(yearArg.split('=')[1])  : CURRENT_YEAR;
const START_ROLL = startArg ? parseInt(startArg.split('=')[1]) : null;
const COUNT      = countArg ? parseInt(countArg.split('=')[1]) : 50;

// Senate uses congress + session. Session 1 = odd year of congress, Session 2 = even year.
function yearToCongressSession(year) {
  // 119th Congress: 2025 (session 1) and 2026 (session 2)
  // 118th Congress: 2023 (session 1) and 2024 (session 2)
  const congress = year >= 2025 ? 119 : year >= 2023 ? 118 : 117;
  const session  = year % 2 === 1 ? 1 : 2;
  return { congress, session };
}

function senateVoteUrl(congress, session, rollNumber) {
  const folder = `vote${congress}${session}`;
  const padded = String(rollNumber).padStart(5, '0');
  return `https://www.senate.gov/legislative/LIS/roll_call_votes/${folder}/vote_${congress}_${session}_${padded}.xml`;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getLatestRollInDB(year) {
  const { congress } = yearToCongressSession(year);
  const y = Number(year);
  const result = await pool.query(
    `SELECT MAX(roll_number) AS max_roll
     FROM votes
     WHERE congress = $1 AND chamber = 'senate'
       AND vote_date >= $2 AND vote_date < $3`,
    [congress, `${y}-01-01`, `${y + 1}-01-01`]
  );
  const max = result.rows[0]?.max_roll;
  return max != null ? Number(max) : 0;
}

async function getLatestVoteDateInDB(year) {
  const { congress } = yearToCongressSession(year);
  const y = Number(year);
  const result = await pool.query(
    `SELECT MAX(vote_date)::text AS max_date
     FROM votes
     WHERE congress = $1 AND chamber = 'senate'
       AND vote_date >= $2 AND vote_date < $3`,
    [congress, `${y}-01-01`, `${y + 1}-01-01`]
  );
  return result.rows[0]?.max_date || null;
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchVote(rollNumber, year) {
  const { congress, session } = yearToCongressSession(year);
  const url = senateVoteUrl(congress, session, rollNumber);

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'RepWatch/1.0 (civic data project)', 'Accept': 'application/xml,text/xml,*/*' }
    });
    if (!resp.ok) {
      if (resp.status === 404) return null;
      throw new Error(`HTTP ${resp.status}`);
    }
    const xml = await resp.text();
    // Senate sometimes returns an HTML error page for missing rolls
    if (xml.trim().startsWith('<!')) return null;
    return await parseSenateXML(xml);
  } catch (err) {
    console.error(`   ⚠️  Error fetching senate roll ${rollNumber} (${year}): ${err.message}`);
    return null;
  }
}

/**
 * Find the highest roll call number available on senate.gov for a given year
 * using exponential probing then binary search (same pattern as house ingest).
 */
async function findMaxRollNumber(year) {
  const { congress, session } = yearToCongressSession(year);
  console.log(`🔍 Finding latest senate roll for ${year} (congress=${congress}, session=${session})...`);

  let maxFound = 0;
  let testRoll = 200;

  // Exponential probe upward
  while (testRoll <= 2000) {
    const url = senateVoteUrl(congress, session, testRoll);
    try {
      const resp = await fetch(url, { timeout: 6000, headers: { 'User-Agent': 'RepWatch/1.0' } });
      const text = resp.ok ? await resp.text() : '';
      if (resp.ok && !text.trim().startsWith('<!')) {
        maxFound = testRoll;
        testRoll = Math.floor(testRoll * 1.5);
      } else {
        break;
      }
    } catch {
      break;
    }
    await sleep(150);
  }

  if (maxFound === 0) {
    // Linear probe from 1 for low-volume early sessions
    for (let i = 1; i <= 100; i++) {
      const url = senateVoteUrl(congress, session, i);
      try {
        const resp = await fetch(url, { timeout: 6000, headers: { 'User-Agent': 'RepWatch/1.0' } });
        const text = resp.ok ? await resp.text() : '';
        if (resp.ok && !text.trim().startsWith('<!')) {
          maxFound = i;
        } else {
          break;
        }
      } catch {
        break;
      }
      await sleep(150);
    }
  }

  // Binary search between maxFound and testRoll
  let low = maxFound, high = testRoll;
  while (low <= high && high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const url = senateVoteUrl(congress, session, mid);
    try {
      const resp = await fetch(url, { timeout: 6000, headers: { 'User-Agent': 'RepWatch/1.0' } });
      const text = resp.ok ? await resp.text() : '';
      if (resp.ok && !text.trim().startsWith('<!')) {
        maxFound = Math.max(maxFound, mid);
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    } catch {
      high = mid - 1;
    }
    await sleep(150);
  }

  // Probe a few extra in case of very recent additions
  for (const extra of [1, 2, 3]) {
    const probeRoll = maxFound + extra;
    const url = senateVoteUrl(congress, session, probeRoll);
    try {
      const resp = await fetch(url, { timeout: 6000, headers: { 'User-Agent': 'RepWatch/1.0' } });
      const text = resp.ok ? await resp.text() : '';
      if (resp.ok && !text.trim().startsWith('<!')) {
        maxFound = probeRoll;
        console.log(`   (found newer roll ${probeRoll})`);
      } else {
        break;
      }
    } catch {
      break;
    }
    await sleep(150);
  }

  console.log(`✅ Latest senate roll on senate.gov: ${maxFound}\n`);
  return maxFound;
}

// ─── DB write ──────────────────────────────────────────────────────────────────

/**
 * Normalize parsed senate vote value to DB constraint values:
 * 'yes', 'no', 'abstain', 'present', 'not voting'
 */
function normalizeVoteForDB(vote) {
  if (!vote) return 'not voting';
  const v = vote.toString().toLowerCase().trim();
  if (v === 'yea' || v === 'aye' || v === 'yes') return 'yes';
  if (v === 'nay'  || v === 'no')                  return 'no';
  if (v === 'present')                              return 'present';
  if (v === 'abstain')                              return 'abstain';
  return 'not voting';
}

/**
 * Upsert all member votes for a single parsed roll call.
 * Senators are matched by external_ids->>'lis' (e.g. "S275").
 */
async function upsertVote(voteData, ingestionYear) {
  const client = await pool.connect();
  // Silence stale-connection errors so they don't crash the process
  client.on('error', () => {});
  const year = ingestionYear != null ? ingestionYear : YEAR;

  try {
    await client.query('BEGIN');

    // Canonical bill ID from bill_key (format: "congress:type:number")
    let canonicalBillId = null;
    if (voteData.bill_key) {
      // bill_key is "congress:type:number" — convert to "type+number-congress" canonical form
      const parts = voteData.bill_key.split(':');
      if (parts.length === 3) {
        const raw = `${parts[1]}${parts[2]}-${parts[0]}`;
        canonicalBillId = normalizeBillToken(raw) || raw;
      }
    } else if (voteData.bill_reference) {
      canonicalBillId = normalizeBillToken(voteData.bill_reference);
    }

    // Try to link to an existing issue
    let issueId = null;
    if (canonicalBillId) {
      const issueRes = await client.query(
        'SELECT id FROM issues WHERE canonical_bill_id = $1 LIMIT 1',
        [canonicalBillId]
      );
      if (issueRes.rows[0]) issueId = issueRes.rows[0].id;
    }

    // roll_call format mirrors house: senate-{congress}-{year}-{roll_number}
    const rollCall = `senate-${voteData.congress}-${year}-${voteData.roll_number}`;

    const voteMetadata = {
      question:         voteData.question,
      // vote_title is the most descriptive: "Motion to Invoke Cloture: Motion to Proceed to S. 5"
      // The UI uses this as the display title when no issue title is available
      vote_title:       voteData.vote_title || voteData.question,
      document_text:    voteData.document_text || null,
      vote_result_text: voteData.vote_result_text || null,
      result:           voteData.result,
      bill_reference:   voteData.bill_reference,
      yeas:             voteData.yeas,
      nays:             voteData.nays,
    };

    let insertedCount = 0;

    for (const member of voteData.votes) {
      // member.bioguide_id actually holds the LIS member ID (e.g. "S275")
      const lisId = member.bioguide_id;
      if (!lisId) continue;

      const repRes = await client.query(
        "SELECT id FROM representatives WHERE external_ids->>'lis' = $1 LIMIT 1",
        [lisId]
      );
      if (!repRes.rows[0]) continue;

      const repId = repRes.rows[0].id;

      await client.query(
        `INSERT INTO votes (
           representative_id, issue_id, vote, vote_date,
           roll_call, chamber, session, congress, roll_number,
           canonical_bill_id, vote_metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (representative_id, roll_call, chamber)
         DO UPDATE SET
           issue_id          = EXCLUDED.issue_id,
           vote              = EXCLUDED.vote,
           vote_date         = EXCLUDED.vote_date,
           congress          = EXCLUDED.congress,
           roll_number       = EXCLUDED.roll_number,
           canonical_bill_id = EXCLUDED.canonical_bill_id,
           vote_metadata     = EXCLUDED.vote_metadata`,
        [
          repId,
          issueId,
          normalizeVoteForDB(member.vote),
          voteData.date,
          rollCall,
          'senate',
          voteData.session || null,
          voteData.congress,
          voteData.roll_number,
          canonicalBillId,
          JSON.stringify(voteMetadata),
        ]
      );
      insertedCount++;
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
 * Create stub issues for all senate votes and link them.
 *
 * Bill-linked votes (canonical_bill_id IS NOT NULL):
 *   keyed by canonical_bill_id — fetch_bill_summaries.js will overwrite the stub
 *   title with the real Congress.gov name later.
 *
 * Non-bill votes (nominations, amendments, procedural — canonical_bill_id IS NULL):
 *   keyed by a synthetic roll-based bill_id so each unique roll gets one issue.
 *   Title comes from vote_metadata.vote_title which is human-readable.
 */
async function ensureIssuesFromVotes() {
  console.log('\n📌 Ensuring issues exist for all senate votes...');
  const client = await pool.connect();
  client.on('error', () => {});
  try {
    // ── 1. Bill-linked votes ──────────────────────────────────────────────────
    const billVotes = await client.query(`
      SELECT DISTINCT canonical_bill_id, vote_metadata
      FROM votes
      WHERE canonical_bill_id IS NOT NULL AND chamber = 'senate'
    `);

    for (const row of billVotes.rows) {
      const meta  = row.vote_metadata || {};
      // Prefer descriptive vote_title; real bill name will be filled by fetch_bill_summaries.js
      const stub  = meta.vote_title || meta.question || `Bill ${row.canonical_bill_id}`;
      const desc  = meta.document_text || stub;
      await client.query(
        `INSERT INTO issues (title, description, bill_id, canonical_bill_id, source)
         VALUES ($1, $2, $3, $4, 'senate_gov_xml')
         ON CONFLICT (canonical_bill_id) DO UPDATE SET
           title       = COALESCE(NULLIF(issues.title,''), EXCLUDED.title),
           description = COALESCE(NULLIF(issues.description,''), EXCLUDED.description)`,
        [stub, desc, row.canonical_bill_id, row.canonical_bill_id]
      );
    }

    // ── 2. Non-bill votes (nominations, amendments, procedural) ──────────────
    // Use a synthetic canonical_bill_id = 'senate-roll:{roll_call}' so we can
    // use ON CONFLICT (canonical_bill_id) which has a guaranteed unique index.
    const nonBillVotes = await client.query(`
      SELECT DISTINCT ON (roll_call) roll_call, vote_metadata
      FROM votes
      WHERE canonical_bill_id IS NULL AND chamber = 'senate'
      ORDER BY roll_call, id
    `);

    for (const row of nonBillVotes.rows) {
      const meta       = row.vote_metadata || {};
      const title      = meta.vote_title || meta.question || row.roll_call;
      const desc       = meta.document_text || meta.vote_result_text || title;
      const syntheticId = `senate-roll:${row.roll_call}`;

      await client.query(
        `INSERT INTO issues (title, description, canonical_bill_id, bill_id, source)
         VALUES ($1, $2, $3, $3, 'senate_gov_xml')
         ON CONFLICT (canonical_bill_id) DO UPDATE SET
           title       = COALESCE(NULLIF(issues.title,''), EXCLUDED.title),
           description = COALESCE(NULLIF(issues.description,''), EXCLUDED.description)`,
        [title, desc, syntheticId]
      );
    }

    // Stamp the synthetic canonical_bill_id onto the votes rows so the
    // standard bill-link JOIN works for them going forward.
    await client.query(`
      UPDATE votes SET canonical_bill_id = 'senate-roll:' || roll_call
      WHERE chamber = 'senate' AND canonical_bill_id IS NULL
    `);

    // ── 3. Link votes → issues ────────────────────────────────────────────────
    const linked1 = await client.query(`
      UPDATE votes v SET issue_id = i.id
      FROM issues i
      WHERE v.canonical_bill_id = i.canonical_bill_id
        AND v.issue_id IS NULL
        AND v.chamber = 'senate'
    `);

    console.log(`   ✅ ${linked1.rowCount} senate votes linked to issues.\n`);
  } finally {
    client.release();
  }
}

// ─── Core loop ─────────────────────────────────────────────────────────────────

async function ingestVotesForYear(year) {
  let startRoll, endRoll;

  if (allFlag || catchUpFlag) {
    const maxRoll    = await findMaxRollNumber(year);
    const latestInDB = await getLatestRollInDB(year);
    const latestDate = await getLatestVoteDateInDB(year);
    console.log(`📊 [${year}] DB has up to roll ${latestInDB} (latest date: ${latestDate || 'none'}); senate.gov has up to roll ${maxRoll}`);
    startRoll = maxRoll;
    endRoll   = latestInDB + 1;
  } else if (START_ROLL) {
    startRoll = START_ROLL;
    endRoll   = Math.max(1, START_ROLL - COUNT + 1);
  } else {
    const maxRoll    = await findMaxRollNumber(year);
    const latestInDB = await getLatestRollInDB(year);
    const latestDate = await getLatestVoteDateInDB(year);
    console.log(`📊 [${year}] DB has up to roll ${latestInDB} (latest date: ${latestDate || 'none'}); senate.gov has up to roll ${maxRoll}`);
    startRoll = maxRoll;
    endRoll   = Math.max(1, Math.max(latestInDB + 1, maxRoll - COUNT + 1));
  }

  const rolls = [];
  for (let i = startRoll; i >= endRoll; i--) rolls.push(i);

  if (rolls.length === 0) {
    const latestDate = await getLatestVoteDateInDB(year);
    console.log(`✅ [${year}] No new senate votes to fetch. (DB latest: ${latestDate || 'none'})\n`);
    return;
  }

  console.log(`🚀 [${year}] Fetching senate rolls ${rolls[0]} → ${rolls[rolls.length - 1]} (${rolls.length} total)\n`);
  let processed = 0, succeeded = 0, failed = 0, skipped = 0;

  for (const rollNum of rolls) {
    processed++;
    if (processed % 10 === 0) {
      console.log(`   Progress: ${processed}/${rolls.length} (${succeeded} saved, ${skipped} skipped, ${failed} failed)`);
    }

    const voteData = await fetchVote(rollNum, year);
    if (!voteData) { skipped++; continue; }

    let saved = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await upsertVote(voteData, year);
        succeeded++;
        if (processed <= 5 || processed % 50 === 0) {
          console.log(`   ✅ Roll ${rollNum}: ${(voteData.question || '').substring(0, 60)} (${result.memberCount} votes${result.issueId ? ', linked' : ''})`);
        }
        saved = true;
        break;
      } catch (err) {
        if (attempt < 3 && /connection terminated|terminating connection|Connection terminated/i.test(err.message)) {
          console.warn(`   ⚠️  Roll ${rollNum}: connection dropped, retrying (${attempt}/3)…`);
          await sleep(2000);
        } else {
          failed++;
          console.error(`   ❌ Roll ${rollNum}: ${err.message}`);
          break;
        }
      }
    }
    if (!saved && failed === 0) failed++;

    await sleep(200); // be polite to senate.gov
  }

  const latestDateAfter = await getLatestVoteDateInDB(year);
  console.log(`\n📊 [${year}] Processed: ${processed}, Succeeded: ${succeeded}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`   Latest vote_date in DB for ${year}: ${latestDateAfter || 'none'}\n`);
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  try {
    if (catchUpFlag) {
      console.log('╔════════════════════════════════════════════════════╗');
      console.log('║      SENATE VOTES CATCH-UP (2025 → today)          ║');
      console.log('╚════════════════════════════════════════════════════╝\n');
      for (let y = 2025; y <= CURRENT_YEAR; y++) {
        console.log(`\n━━━ Year ${y} ━━━\n`);
        await ingestVotesForYear(y);
      }
      await ensureIssuesFromVotes();
    } else {
      console.log('╔════════════════════════════════════════════════════╗');
      console.log('║      SENATE VOTES INGESTION PIPELINE               ║');
      console.log('╚════════════════════════════════════════════════════╝\n');
      const { congress, session } = yearToCongressSession(YEAR);
      console.log(`📋 Year: ${YEAR} (Congress ${congress}, Session ${session})`);
      console.log(`📊 Mode: ${allFlag ? 'Fetch ALL' : `Fetch up to ${COUNT} recent`}\n`);
      await ingestVotesForYear(YEAR);
      await ensureIssuesFromVotes();
    }
    console.log('✅ Senate ingest complete.\n');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

main();
