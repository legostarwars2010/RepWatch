#!/usr/bin/env node
/**
 * Fetch and populate bill summaries from Congress.gov for all issues
 * This enriches the data we feed to the LLM for better AI summaries
 */

require('dotenv').config();
const { Pool } = require('pg');
const { fetchBillStatus } = require('../services/congress_api');

// Use DEV database
const pool = new Pool({
  connectionString: process.env.DEV_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function populateBillSummaries() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   FETCH BILL SUMMARIES FROM CONGRESS.GOV          ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    // Get all issues without bill_summary
    const { rows: issues } = await pool.query(`
      SELECT id, canonical_bill_id, title
      FROM issues
      WHERE canonical_bill_id IS NOT NULL
        AND bill_summary IS NULL
      ORDER BY id
      LIMIT 100
    `);

    console.log(`Found ${issues.length} issues to fetch\n`);

    let fetched = 0;
    let errors = 0;

    for (const issue of issues) {
      try {
        console.log(`[${fetched + 1}/${issues.length}] ${issue.canonical_bill_id}`);
        console.log(`   Title: ${issue.title?.substring(0, 60)}...`);

        // Fetch bill data from Congress.gov
        const billData = await fetchBillStatus(issue.canonical_bill_id);
        
        if (billData) {
          // Update database with summary and/or full text
          await pool.query(
            `UPDATE issues 
             SET bill_summary = $1,
                 title = COALESCE(NULLIF(title, ''), $2),
                 description = COALESCE(NULLIF(description, ''), $3)
             WHERE id = $4`,
            [
              billData.fullText || billData.summary, 
              billData.title,
              billData.summary,
              issue.id
            ]
          );

          console.log(`   ✓ Title: ${billData.title?.substring(0, 60)}...`);
          if (billData.fullText) {
            console.log(`   ✓ Full text: ${billData.fullText.length} characters`);
          } else if (billData.summary) {
            console.log(`   ✓ Summary: ${billData.summary.substring(0, 80)}...`);
          }
          fetched++;
        } else {
          console.log(`   ⚠️  No data available`);
        }

        // Rate limiting - wait 2 seconds between requests
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (err) {
        console.error(`   ✗ Error: ${err.message}`);
        errors++;
      }
    }

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log(`║  COMPLETE: ${fetched} fetched, ${errors} errors`);
    console.log('╚════════════════════════════════════════════════════╝\n');

  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await pool.end();
  }
}

populateBillSummaries();
