#!/usr/bin/env node
require('dotenv').config();
const { pool } = require('../db/pool');

async function main() {
  // Get distinct roll_numbers we have for 2025 house
  const res = await pool.query(`
    SELECT DISTINCT roll_number
    FROM votes
    WHERE chamber = 'house' AND vote_date >= '2025-01-01' AND vote_date < '2026-01-01'
    ORDER BY roll_number
  `);
  const have = new Set(res.rows.map((r) => Number(r.roll_number)));

  const min = 283,
    max = 362;
  const missing = [];
  for (let r = min; r <= max; r++) {
    if (!have.has(r)) missing.push(r);
  }

  console.log('\n2025 House rolls 283–362:\n');
  console.log('  Total in range:', have.size, 'distinct rolls');
  console.log('  Expected:', max - min + 1, '(283 to 362 inclusive)');
  if (missing.length === 0) {
    console.log('  Missing: none ✓\n');
  } else {
    console.log('  Missing:', missing.length, '→', missing.join(', '), '\n');
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
