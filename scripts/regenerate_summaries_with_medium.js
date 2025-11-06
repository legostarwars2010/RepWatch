#!/usr/bin/env node
/**
 * Re-generate AI summaries for all issues to include medium_summary
 */

require('dotenv').config();
const { Pool } = require('pg');
const { summarizeIssue } = require('../services/llm_wrappers');

const pool = new Pool({
  connectionString: process.env.DEV_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function regenerateSummaries() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║     RE-GENERATE AI SUMMARIES WITH MEDIUM LENGTH    ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    // Get all issues
    const { rows: issues } = await pool.query(`
      SELECT id, canonical_bill_id, title, description, vote_date
      FROM issues
      ORDER BY id
    `);

    console.log(`Found ${issues.length} issues to process\n`);

    let processed = 0;
    let errors = 0;

    for (const issue of issues) {
      try {
        console.log(`\n[${processed + 1}/${issues.length}] ${issue.canonical_bill_id}`);
        console.log(`   ${issue.title?.substring(0, 60)}...`);

        // Generate new summary with medium_summary
        const { json, meta } = await summarizeIssue(issue);
        
        // Update database
        await pool.query(
          `UPDATE issues 
           SET ai_summary = $1, ai_summary_updated_at = NOW() 
           WHERE id = $2`,
          [json, issue.id]
        );

        console.log(`   ✓ Generated (${meta?.latencyMs}ms)`);
        console.log(`   - Short: ${json.short_summary?.substring(0, 80)}...`);
        console.log(`   - Medium: ${json.medium_summary?.substring(0, 80)}...`);
        
        processed++;

        // Rate limiting - wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (err) {
        console.error(`   ✗ Error: ${err.message}`);
        errors++;
      }
    }

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log(`║  COMPLETE: ${processed} processed, ${errors} errors`);
    console.log('╚════════════════════════════════════════════════════╝\n');

    await pool.end();
  } catch (err) {
    console.error('Fatal error:', err);
    await pool.end();
    process.exit(1);
  }
}

regenerateSummaries();
