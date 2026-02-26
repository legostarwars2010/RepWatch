#!/usr/bin/env node
/**
 * Fetch real bill titles (and optional summary/text) from Congress.gov and update issues.
 * Replaces motion-text titles like "On Passage" / "On Motion to Recommit" with official bill names.
 * Requires CONGRESS_API_KEY (api.congress.gov).
 *
 * Usage: node scripts/fetch_bill_summaries.js [--limit=N]
 */

require('dotenv').config();
const { pool } = require('../db/pool');
const { fetchBillStatus } = require('../services/congress_api');

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   FETCH REAL BILL TITLES FROM CONGRESS.GOV        ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  if (!process.env.CONGRESS_API_KEY) {
    console.error('CONGRESS_API_KEY is not set. Get a key at https://api.congress.gov/sign-up/');
    process.exit(1);
  }

  try {
    // Issues we want to enrich (canonical_bill_id like HR4758, S284; Congress.gov accepts with or without -119)
    const { rows: issues } = await pool.query(
      `SELECT id, canonical_bill_id, title
       FROM issues
       WHERE canonical_bill_id IS NOT NULL
       ORDER BY id
       LIMIT $1`,
      [LIMIT]
    );

    console.log(`Fetching up to ${issues.length} issues (limit ${LIMIT})\n`);

    let fetched = 0;
    let errors = 0;

    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      try {
        const billData = await fetchBillStatus(issue.canonical_bill_id);

        if (billData && (billData.title || billData.summary || billData.fullText)) {
          // Prefer real bill title over motion text ("On Passage", etc.)
          await pool.query(
            `UPDATE issues
             SET title = COALESCE($2, title),
                 description = COALESCE($3, description),
                 bill_summary = COALESCE($4, bill_summary)
             WHERE id = $1`,
            [
              issue.id,
              billData.title || null,
              billData.summary || null,
              billData.fullText || billData.summary || null
            ]
          );
          fetched++;
          console.log(`[${i + 1}/${issues.length}] ✓ ${issue.canonical_bill_id} → ${(billData.title || '').substring(0, 55)}...`);
        } else {
          console.log(`[${i + 1}/${issues.length}] ⚠ ${issue.canonical_bill_id} (no data)`);
        }

        await new Promise((r) => setTimeout(r, 1200));
      } catch (err) {
        errors++;
        console.error(`[${i + 1}/${issues.length}] ✗ ${issue.canonical_bill_id}: ${err.message}`);
      }
    }

    console.log(`\nDone: ${fetched} updated, ${errors} errors.\n`);
  } catch (err) {
    console.error('Fatal:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
