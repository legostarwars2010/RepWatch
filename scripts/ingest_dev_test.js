#!/usr/bin/env node
/**
 * Minimal pipeline for testing on dev: small batch of votes → titles → AI summaries.
 * Uses DEV_DB_URL when NODE_ENV=development (see .env).
 *
 * Prereq: Dev DB has representatives (run: node scripts/ingest_state.js --state=CA)
 *
 * Usage (from repo root):
 *   set NODE_ENV=development && node scripts/ingest_dev_test.js
 *   npm run ingest:dev
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const year = new Date().getFullYear();

function run(scriptName, args = '') {
  const scriptPath = path.join(__dirname, scriptName);
  execSync(`node "${scriptPath}" ${args}`.trim(), {
    stdio: 'inherit',
    cwd: projectRoot,
    env: { ...process.env }
  });
}

const isDev = process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'development';
if (!isDev) {
  console.warn('⚠️  NODE_ENV is not development; this script will use DATABASE_URL (production).');
  console.warn('   For dev, run: set NODE_ENV=development && node scripts/ingest_dev_test.js\n');
}

console.log('\n🕐 Dev pipeline (small batch) started\n');

try {
  console.log('━━━ Step 1: House votes (10 rolls) ━━━\n');
  run('ingest_house_votes.js', `--year=${year} --count=10`);

  console.log('\n━━━ Step 2: Bill titles (Congress.gov) ━━━\n');
  run('fetch_bill_summaries.js', '--new --limit=10');

  console.log('\n━━━ Step 3: AI summaries ━━━\n');
  run('generate_ai_summaries_for_votes.js', '--limit=10');

  console.log('\n✅ Dev pipeline finished.\n');
} catch (err) {
  console.error('\n❌ Dev pipeline failed:', err.message);
  process.exit(1);
}
