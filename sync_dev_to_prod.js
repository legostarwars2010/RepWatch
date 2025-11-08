#!/usr/bin/env node
/**
 * Copy enhanced AI summaries and bill data from DEV to PROD
 * This OVERWRITES production data with dev data
 */

require('dotenv').config();
const { Pool } = require('pg');

const devPool = new Pool({
  connectionString: process.env.DEV_DB_URL,
  ssl: { rejectUnauthorized: false }
});

const prodPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function syncDevToProd() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   SYNC DEV DATABASE TO PRODUCTION (OVERWRITE)     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  try {
    // Step 1: Run migrations on prod to add missing columns
    console.log('Step 1: Applying migrations to production...');
    const fs = require('fs').promises;
    const path = require('path');
    
    const migration006 = await fs.readFile(path.join(__dirname, 'db', 'migrations', '006_add_bill_summary.sql'), 'utf8');
    await prodPool.query(migration006);
    console.log('✅ Migration 006 (bill_summary) applied');
    
    const migration007 = await fs.readFile(path.join(__dirname, 'db', 'migrations', '007_add_categories.sql'), 'utf8');
    await prodPool.query(migration007);
    console.log('✅ Migration 007 (categories) applied\n');
    
    // Step 2: Get all enhanced issues from dev
    console.log('Step 2: Fetching enhanced data from DEV...');
    const { rows: devIssues } = await devPool.query(`
      SELECT 
        canonical_bill_id,
        title,
        description,
        bill_summary,
        ai_summary,
        categories
      FROM issues
      WHERE canonical_bill_id IS NOT NULL
    `);
    console.log(`✅ Found ${devIssues.length} issues in DEV\n`);
    
    // Step 3: Update each issue in prod
    console.log('Step 3: Updating PRODUCTION database...');
    let updated = 0;
    let errors = 0;
    
    for (const issue of devIssues) {
      try {
        const result = await prodPool.query(
          `UPDATE issues 
           SET 
             title = $1,
             description = $2,
             bill_summary = $3,
             ai_summary = $4,
             categories = $5,
             ai_summary_updated_at = NOW()
           WHERE canonical_bill_id = $6`,
          [
            issue.title,
            issue.description,
            issue.bill_summary,
            issue.ai_summary,
            issue.categories,
            issue.canonical_bill_id
          ]
        );
        
        if (result.rowCount > 0) {
          updated++;
          if (updated % 10 === 0) {
            console.log(`   Updated ${updated}/${devIssues.length}...`);
          }
        }
      } catch (err) {
        console.error(`   ✗ Error updating ${issue.canonical_bill_id}: ${err.message}`);
        errors++;
      }
    }
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log(`║  SYNC COMPLETE: ${updated} updated, ${errors} errors`);
    console.log('╚════════════════════════════════════════════════════╝\n');
    
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    console.error(err.stack);
  } finally {
    await devPool.end();
    await prodPool.end();
  }
}

syncDevToProd();
