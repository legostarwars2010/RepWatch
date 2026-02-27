#!/usr/bin/env node
/**
 * Full daily pipeline: House votes → real bill titles (Congress.gov) → AI summaries.
 * Run once per day (e.g. via cron, Render cron job, or GitHub Actions).
 *
 * Requires: DATABASE_URL, CONGRESS_API_KEY, and LLM config for summaries.
 *
 * Usage:
 *   node scripts/daily_ingest.js
 *   node scripts/daily_ingest.js --year=2026
 *   node scripts/daily_ingest.js --votes-only   # skip titles and AI summaries
 *
 * Schedule (cron, daily at 6 AM UTC):
 *   0 6 * * * cd /path/to/RepWatch && node scripts/daily_ingest.js
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const currentYear = new Date().getFullYear();
const votesOnly = process.argv.includes('--votes-only');

function run(scriptName, args = '') {
  const scriptPath = path.join(__dirname, scriptName);
  execSync(`node "${scriptPath}" ${args}`.trim(), {
    stdio: 'inherit',
    cwd: projectRoot,
    env: { ...process.env }
  });
}

console.log(`\n🕐 Daily ingest started at ${new Date().toISOString()}\n`);

try {
  // Step 1: Ingest new House votes and ensure issues
  console.log('━━━ Step 1: House votes ━━━\n');
  run('ingest_house_votes.js', `--year=${currentYear}`);

  if (votesOnly) {
    console.log('\n✅ Daily ingest (votes only) finished.\n');
    process.exit(0);
  }

  // Step 2: Fetch real bill titles and CRS summaries from Congress.gov (required for display)
  console.log('\n━━━ Step 2: Bill titles (Congress.gov) ━━━\n');
  run('fetch_bill_summaries.js', '--new --limit=50');

  // Step 3: Generate AI summaries for issues that don't have one yet
  console.log('\n━━━ Step 3: AI summaries ━━━\n');
  run('generate_ai_summaries_for_votes.js', '--limit=50');

  console.log('\n✅ Daily ingest finished successfully.\n');
} catch (err) {
  console.error('\n❌ Daily ingest failed:', err.message);
  process.exit(1);
}
