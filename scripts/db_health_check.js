#!/usr/bin/env node
/**
 * Full DB health check before pushing to main.
 * Run: NODE_ENV=development node scripts/db_health_check.js
 * Exits 0 if all critical checks pass, 1 otherwise.
 */
require('dotenv').config();
const { pool } = require('../db/pool');

const issues = [];
const warnings = [];

function fail(msg) {
  issues.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

async function run() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║              DATABASE HEALTH CHECK                 ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    // ---- 1. Tables exist ----
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('representatives', 'issues', 'votes')
      ORDER BY table_name
    `);
    const names = tables.rows.map((r) => r.table_name);
    if (!names.includes('representatives')) fail('Missing table: representatives');
    if (!names.includes('issues')) fail('Missing table: issues');
    if (!names.includes('votes')) fail('Missing table: votes');
    console.log('1. Tables:', names.length === 3 ? '✓ representatives, issues, votes' : names.join(', ') || '✗ missing');

    // ---- 2. Row counts ----
    const repsCount = await pool.query('SELECT COUNT(*) as n FROM representatives');
    const issuesCount = await pool.query('SELECT COUNT(*) as n FROM issues');
    const votesCount = await pool.query('SELECT COUNT(*) as n FROM votes');
    const r = parseInt(repsCount.rows[0].n, 10);
    const i = parseInt(issuesCount.rows[0].n, 10);
    const v = parseInt(votesCount.rows[0].n, 10);

    console.log('2. Row counts:');
    console.log('   representatives:', r, r >= 400 ? '✓' : r > 0 ? '⚠' : '✗');
    console.log('   issues:', i, i > 0 ? '✓' : '✗');
    console.log('   votes:', v, v > 1000 ? '✓' : v > 0 ? '⚠' : '✗');
    if (r < 100) warn('Low representative count');
    if (v < 1000) warn('Low vote count');

    // ---- 3. Representatives: House count ----
    const house = await pool.query("SELECT COUNT(*) as n FROM representatives WHERE chamber = 'house'");
    const houseCount = parseInt(house.rows[0].n, 10);
    console.log('3. House reps:', houseCount, houseCount >= 400 ? '✓' : '⚠');
    if (houseCount < 400) warn('Expected ~435 House reps');

    // ---- 4. roll_call format (no old format) ----
    const oldRoll = await pool.query(`
      SELECT COUNT(*) as n FROM votes
      WHERE chamber = 'house' AND roll_call ~ '^house-[0-9]+-[0-9]+$'
    `);
    const oldN = parseInt(oldRoll.rows[0].n, 10);
    console.log('4. roll_call format:', oldN === 0 ? '✓ all have year in roll_call' : `✗ ${oldN} rows with old format`);
    if (oldN > 0) fail(`${oldN} votes have old roll_call format (run backfill)`);

    // ---- 5. 2025 House roll coverage (283-362) ----
    const rollRes = await pool.query(`
      SELECT DISTINCT roll_number FROM votes
      WHERE chamber = 'house' AND vote_date >= '2025-01-01' AND vote_date < '2026-01-01'
    `);
    const have = new Set(rollRes.rows.map((row) => Number(row.roll_number)));
    const minR = 283, maxR = 362;
    const missing = [];
    for (let n = minR; n <= maxR; n++) if (!have.has(n)) missing.push(n);
    console.log('5. 2025 House rolls 283-362:', missing.length === 0 ? `✓ ${have.size} rolls` : `⚠ ${missing.length} missing (e.g. ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''})`);
    if (missing.length > 10) warn(`Many 2025 rolls missing: ${missing.length}`);

    // ---- 6. Issues: titles and summaries ----
    const withTitle = await pool.query('SELECT COUNT(*) as n FROM issues WHERE title IS NOT NULL AND title != \'\'');
    const withBillSummary = await pool.query('SELECT COUNT(*) as n FROM issues WHERE bill_summary IS NOT NULL');
    const withAiSummary = await pool.query('SELECT COUNT(*) as n FROM issues WHERE ai_summary IS NOT NULL');
    const motionTitles = await pool.query(`
      SELECT COUNT(*) as n FROM issues WHERE title LIKE 'On Passage%' OR title LIKE 'On Motion%' OR title LIKE 'On Agreeing%'
    `);
    const realTitles = parseInt(withTitle.rows[0].n, 10) - parseInt(motionTitles.rows[0].n, 10);
    console.log('6. Issues content:');
    console.log('   with title:', withTitle.rows[0].n);
    console.log('   with bill_summary (Congress.gov):', withBillSummary.rows[0].n, parseInt(withBillSummary.rows[0].n, 10) >= 100 ? '✓' : '⚠');
    console.log('   with ai_summary:', withAiSummary.rows[0].n);
    console.log('   real bill titles (not motion text):', realTitles, realTitles >= 100 ? '✓' : '⚠');
    if (parseInt(withBillSummary.rows[0].n, 10) < 50) warn('Few issues have bill_summary');
    if (parseInt(motionTitles.rows[0].n, 10) > 50) warn('Many issues still have motion-text titles');

    // ---- 7. Referential integrity ----
    const badRep = await pool.query(`
      SELECT COUNT(*) as n FROM votes v
      LEFT JOIN representatives r ON v.representative_id = r.id
      WHERE r.id IS NULL
    `);
    const badIssue = await pool.query(`
      SELECT COUNT(*) as n FROM votes v
      LEFT JOIN issues i ON v.issue_id = i.id
      WHERE v.issue_id IS NOT NULL AND i.id IS NULL
    `);
    const orphanVotes = parseInt(badRep.rows[0].n, 10);
    const brokenIssue = parseInt(badIssue.rows[0].n, 10);
    console.log('7. Referential integrity:');
    console.log('   votes with invalid representative_id:', orphanVotes, orphanVotes === 0 ? '✓' : '✗');
    console.log('   votes with invalid issue_id:', brokenIssue, brokenIssue === 0 ? '✓' : '✗');
    if (orphanVotes > 0) fail(`${orphanVotes} votes reference missing representative`);
    if (brokenIssue > 0) fail(`${brokenIssue} votes reference missing issue`);

    // ---- 8. Votes linked to issues ----
    const withIssue = await pool.query('SELECT COUNT(*) as n FROM votes WHERE issue_id IS NOT NULL');
    const totalV = parseInt(votesCount.rows[0].n, 10);
    const linked = parseInt(withIssue.rows[0].n, 10);
    console.log('8. Votes linked to issue:', linked, '/', totalV, totalV > 0 ? `(${Math.round((linked / totalV) * 100)}%)` : '');

    // ---- 9. Unique constraints (votes) ----
    const constraints = await pool.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'votes'::regclass AND contype = 'u'
    `);
    const hasUnique = constraints.rows.some((c) => c.conname && (c.conname.includes('roll') || c.conname.includes('representative')));
    console.log('9. Votes unique constraint:', hasUnique ? '✓' : '⚠ (check schema)');

    // ---- 10. Date range ----
    const range = await pool.query(`
      SELECT MIN(vote_date) as min_d, MAX(vote_date) as max_d FROM votes
    `);
    console.log('10. Vote date range:', range.rows[0].min_d, '→', range.rows[0].max_d);

    // ---- Summary ----
    console.log('\n--- Summary ---');
    if (warnings.length) {
      console.log('Warnings:', warnings.length);
      warnings.forEach((w) => console.log('  ⚠', w));
    }
    if (issues.length) {
      console.log('Failures:', issues.length);
      issues.forEach((f) => console.log('  ✗', f));
      console.log('\n❌ Health check FAILED. Fix the above before pushing to main.\n');
      await pool.end();
      process.exit(1);
    }
    console.log('\n✅ Health check PASSED. DB is ready for main.\n');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Health check error:', err.message);
    await pool.end();
    process.exit(1);
  }
}

run();
