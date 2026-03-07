#!/usr/bin/env node
require('dotenv').config();
const { pool } = require('../db/pool');

async function main() {
  const [start, end] = process.argv.slice(2);
  if (!start) {
    console.error('Usage: node scripts/check_votes_by_date.js <YYYY-MM-DD> [<YYYY-MM-DD exclusive end>]');
    process.exit(1);
  }
  const endDate = end || start;
  try {
    const res = await pool.query(
      `
      SELECT
        vote_date::text,
        chamber,
        congress,
        COUNT(*) AS total_votes,
        COUNT(DISTINCT roll_call) AS unique_roll_calls,
        MIN(roll_number) AS min_roll_number,
        MAX(roll_number) AS max_roll_number
      FROM votes
      WHERE vote_date >= $1::date
        AND vote_date < ($2::date + INTERVAL '1 day')
      GROUP BY vote_date, chamber, congress
      ORDER BY vote_date, chamber, congress
      `,
      [start, endDate]
    );
    if (res.rows.length === 0) {
      console.log(`No votes found between ${start} and ${endDate} (inclusive).`);
    } else {
      console.log(JSON.stringify(res.rows, null, 2));
    }
  } catch (err) {
    console.error('Query error:', err);
  } finally {
    await pool.end();
  }
}

main();

