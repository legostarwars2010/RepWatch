#!/usr/bin/env node
/**
 * Backfill senate vote_metadata with rich fields (vote_title, document_text,
 * vote_result_text) by re-fetching Senate.gov XML for each distinct roll_call.
 *
 * Much faster than a full re-ingest: fetches ONLY the XML header, in parallel
 * batches of 8, skipping member vote parsing. Then creates issues for all
 * senate vote types (nominations, amendments, procedural) and links them.
 *
 * Usage:
 *   node scripts/backfill_senate_vote_metadata.js             # all missing vote_title
 *   node scripts/backfill_senate_vote_metadata.js --all       # force all senate rolls
 *   node scripts/backfill_senate_vote_metadata.js --dry-run   # preview only
 */

require('dotenv').config();
const fetch    = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');
const { pool } = require('../db/pool');

const CONCURRENCY = 8;
const SLEEP_MS    = 120; // polite rate limiting per batch

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: true });
const allFlag  = process.argv.includes('--all');
const dryRun   = process.argv.includes('--dry-run');

// Parse 'senate-119-2025-42' → { congress: 119, year: 2025, session: 1, roll: 42 }
function parseRollCall(rollCall) {
  const m = rollCall.match(/^senate-(\d+)-(\d+)-(\d+)$/);
  if (!m) return null;
  const congress = parseInt(m[1]);
  const year     = parseInt(m[2]);
  const roll     = parseInt(m[3]);
  const session  = year % 2 === 1 ? 1 : 2;
  return { congress, year, session, roll };
}

function senateUrl(congress, session, roll) {
  const folder = `vote${congress}${session}`;
  const padded = String(roll).padStart(5, '0');
  return `https://www.senate.gov/legislative/LIS/roll_call_votes/${folder}/vote_${congress}_${session}_${padded}.xml`;
}

async function fetchVoteMeta(rollCall) {
  const parts = parseRollCall(rollCall);
  if (!parts) return null;
  const url = senateUrl(parts.congress, parts.session, parts.roll);
  try {
    const resp = await fetch(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'RepWatch/1.0 (civic data)', 'Accept': 'application/xml,text/xml,*/*' }
    });
    if (!resp.ok) return null;
    const xml = await resp.text();
    if (xml.trim().startsWith('<!')) return null;

    const result  = parser.parse(xml);
    const rc      = result.roll_call_vote || result.rollCallVote;
    if (!rc) return null;

    return {
      vote_title:       rc.vote_title || rc.vote_question_text || rc.question || '',
      document_text:    rc.vote_document_text || '',
      vote_result_text: rc.vote_result_text   || '',
      question:         rc.question           || '',
    };
  } catch { return null; }
}

async function runInBatches(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch  = items.slice(i, i + concurrency);
    const chunk  = await Promise.all(batch.map(fn));
    results.push(...chunk);
    if (i + concurrency < items.length) await new Promise(r => setTimeout(r, SLEEP_MS));
  }
  return results;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   BACKFILL SENATE VOTE METADATA (parallel)         ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  if (dryRun) console.log('⚠️  DRY RUN — no writes\n');

  // Get all distinct roll_calls that need backfilling
  const whereClause = allFlag
    ? "chamber = 'senate'"
    : "chamber = 'senate' AND (vote_metadata->>'vote_title' IS NULL OR vote_metadata->>'vote_title' = vote_metadata->>'question')";

  const { rows } = await pool.query(
    `SELECT DISTINCT roll_call FROM votes WHERE ${whereClause} ORDER BY roll_call DESC`
  );
  const rollCalls = rows.map(r => r.roll_call);
  console.log(`Found ${rollCalls.length} senate rolls to backfill\n`);

  if (rollCalls.length === 0) {
    console.log('Nothing to do.\n');
    return;
  }

  // Fetch in parallel batches
  let fetched = 0, failed = 0;
  const updates = [];

  await runInBatches(rollCalls, async (rollCall) => {
    const meta = await fetchVoteMeta(rollCall);
    if (!meta) { failed++; return; }
    fetched++;
    updates.push({ rollCall, meta });
    if (fetched % 50 === 0) {
      console.log(`   Fetched ${fetched}/${rollCalls.length} ...`);
    }
  }, CONCURRENCY);

  console.log(`\n✅ Fetched: ${fetched}, Failed: ${failed}\n`);
  if (dryRun || updates.length === 0) {
    console.log(dryRun ? 'Dry run — skipping writes.\n' : 'Nothing to write.\n');
    return;
  }

  // Write updates to DB
  console.log(`📝 Writing ${updates.length} vote_metadata updates...`);
  const client = await pool.connect();
  try {
    let written = 0;
    for (const { rollCall, meta } of updates) {
      // Merge new fields into existing vote_metadata (preserve existing fields)
      await client.query(`
        UPDATE votes
        SET vote_metadata = vote_metadata || $1::jsonb
        WHERE roll_call = $2 AND chamber = 'senate'
      `, [JSON.stringify({
        vote_title:       meta.vote_title,
        document_text:    meta.document_text    || null,
        vote_result_text: meta.vote_result_text || null,
      }), rollCall]);
      written++;
    }
    console.log(`✅ Updated vote_metadata for ${written} rolls\n`);

    // ── Create / update issues for all senate votes ────────────────────────
    console.log('📌 Creating issues for all senate vote types...');

    // 1. Bill-linked issues
    const billVotes = await client.query(`
      SELECT DISTINCT canonical_bill_id, vote_metadata
      FROM votes
      WHERE canonical_bill_id IS NOT NULL
        AND canonical_bill_id NOT LIKE 'senate-roll:%'
        AND chamber = 'senate'
    `);
    for (const row of billVotes.rows) {
      const vm   = row.vote_metadata || {};
      const stub = vm.vote_title || vm.question || `Bill ${row.canonical_bill_id}`;
      const desc = vm.document_text || stub;
      await client.query(
        `INSERT INTO issues (title, description, bill_id, canonical_bill_id, source)
         VALUES ($1, $2, $3, $3, 'senate_gov_xml')
         ON CONFLICT (canonical_bill_id) DO UPDATE SET
           title       = COALESCE(NULLIF(issues.title,''), EXCLUDED.title),
           description = COALESCE(NULLIF(issues.description,''), EXCLUDED.description)`,
        [stub, desc, row.canonical_bill_id]
      );
    }

    // 2. Non-bill votes — assign synthetic canonical_bill_id and create issues
    const nonBill = await client.query(`
      SELECT DISTINCT ON (roll_call) roll_call, vote_metadata
      FROM votes
      WHERE (canonical_bill_id IS NULL OR canonical_bill_id LIKE 'senate-roll:%')
        AND chamber = 'senate'
      ORDER BY roll_call, id
    `);
    for (const row of nonBill.rows) {
      const vm          = row.vote_metadata || {};
      const title       = vm.vote_title || vm.question || row.roll_call;
      const desc        = vm.document_text || vm.vote_result_text || title;
      const syntheticId = `senate-roll:${row.roll_call}`;

      await client.query(
        `INSERT INTO issues (title, description, canonical_bill_id, bill_id, source)
         VALUES ($1, $2, $3, $3, 'senate_gov_xml')
         ON CONFLICT (canonical_bill_id) DO UPDATE SET
           title       = EXCLUDED.title,
           description = COALESCE(NULLIF(issues.description,''), EXCLUDED.description)`,
        [title, desc, syntheticId]
      );
    }

    // Stamp synthetic canonical_bill_id onto vote rows
    await client.query(`
      UPDATE votes SET canonical_bill_id = 'senate-roll:' || roll_call
      WHERE chamber = 'senate' AND canonical_bill_id IS NULL
    `);

    // Link all senate votes to issues
    const linked = await client.query(`
      UPDATE votes v SET issue_id = i.id
      FROM issues i
      WHERE v.canonical_bill_id = i.canonical_bill_id
        AND v.chamber = 'senate'
        AND (v.issue_id IS NULL OR v.issue_id != i.id)
    `);
    console.log(`✅ ${linked.rowCount} senate votes linked to issues\n`);

  } finally {
    client.release();
  }

  console.log('✅ Backfill complete.\n');
}

main()
  .catch(e => { console.error('Fatal:', e.message); process.exit(1); })
  .finally(() => pool.end());
