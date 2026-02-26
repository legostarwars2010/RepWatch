#!/usr/bin/env node
/**
 * Verify DB state before running catch-up (step 2).
 * Checks: roll_call format, vote date range, counts by year, representatives.
 */
require('dotenv').config();
const { pool } = require('../db/pool');

async function main() {
  console.log('\n=== Pre catch-up verification ===\n');

  // 1. roll_call format: should see house-119-YYYY-N (year in the middle)
  const formatCheck = await pool.query(`
    SELECT roll_call, vote_date, congress, roll_number
    FROM votes
    WHERE chamber = 'house'
    ORDER BY vote_date DESC
    LIMIT 5
  `);
  console.log('1. Sample of latest House votes (roll_call format):');
  if (formatCheck.rows.length === 0) {
    console.log('   (no house votes in DB yet)\n');
  } else {
    formatCheck.rows.forEach((r) => {
      const hasYear = /^house-\d+-\d{4}-\d+$/.test(r.roll_call);
      console.log(`   ${r.roll_call}  date=${r.vote_date}  ${hasYear ? '✓ format OK' : '⚠ old format'}`);
    });
    console.log('');
  }

  // 2. Any old-format roll_calls left? (should be 0 after backfill)
  const oldFormat = await pool.query(`
    SELECT COUNT(*) as n FROM votes
    WHERE chamber = 'house' AND roll_call ~ '^house-[0-9]+-[0-9]+$'
  `);
  const oldCount = parseInt(oldFormat.rows[0].n, 10);
  console.log('2. Old-format roll_call (house-119-N without year):', oldCount, oldCount === 0 ? '✓' : '⚠ run backfill');

  // 3. Date range and counts by year
  const byYear = await pool.query(`
    SELECT to_char(vote_date, 'YYYY') as year,
           COUNT(*) as votes,
           MIN(vote_date) as min_date,
           MAX(vote_date) as max_date,
           MAX(roll_number) as max_roll
    FROM votes
    WHERE chamber = 'house'
    GROUP BY to_char(vote_date, 'YYYY')
    ORDER BY year
  `);
  console.log('\n3. House votes by year:');
  if (byYear.rows.length === 0) {
    console.log('   (none)');
  } else {
    byYear.rows.forEach((r) => {
      console.log(`   ${r.year}: ${r.votes} votes, ${r.min_date} → ${r.max_date}, max roll=${r.max_roll}`);
    });
  }

  // 4. Representatives count (need these to link new votes)
  const reps = await pool.query(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE chamber = 'house') as house
    FROM representatives
  `);
  console.log('\n4. Representatives:', reps.rows[0].total, 'total,', reps.rows[0].house, 'House');

  // 5. Issues linked to votes
  const linked = await pool.query(`
    SELECT COUNT(*) as with_issue FROM votes WHERE issue_id IS NOT NULL
  `);
  const totalVotes = await pool.query(`SELECT COUNT(*) as n FROM votes`);
  console.log('\n5. Votes with issue_id:', linked.rows[0].with_issue, '/', totalVotes.rows[0].n);

  console.log('\n=== End verification ===\n');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
