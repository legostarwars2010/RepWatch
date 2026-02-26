#!/usr/bin/env node
/**
 * Daily House votes ingest: fetch any new votes for the current year and ensure issues.
 * Run once per day (e.g. via cron, Render cron job, or GitHub Actions).
 *
 * Usage:
 *   node scripts/daily_ingest.js
 *   node scripts/daily_ingest.js --year=2026
 *
 * Schedule (cron, daily at 6 AM UTC):
 *   0 6 * * * cd /path/to/RepWatch && node scripts/daily_ingest.js
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'ingest_house_votes.js');
const projectRoot = path.resolve(__dirname, '..');
const currentYear = new Date().getFullYear();

console.log(`\n🕐 Daily ingest started at ${new Date().toISOString()}\n`);
try {
  execSync(`node "${scriptPath}" --year=${currentYear}`, {
    stdio: 'inherit',
    cwd: projectRoot,
    env: { ...process.env }
  });
  console.log('\n✅ Daily ingest finished successfully.\n');
} catch (err) {
  console.error('\n❌ Daily ingest failed:', err.message);
  process.exit(1);
}
