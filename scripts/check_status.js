#!/usr/bin/env node
require('dotenv').config();
const { pool } = require('../db/pool');

async function checkStatus() {
  const reps = await pool.query('SELECT state, COUNT(*) as count FROM representatives GROUP BY state ORDER BY state');
  console.log('\nRepresentatives by state:');
  reps.rows.forEach(row => console.log(`  ${row.state}: ${row.count}`));
  
  const votes = await pool.query('SELECT COUNT(*) as count FROM votes');
  console.log(`\nTotal votes: ${votes.rows[0].count}`);
  
  const issues = await pool.query('SELECT COUNT(*) as total, COUNT(ai_summary) as with_summary FROM issues');
  console.log(`\nIssues: ${issues.rows[0].total} total, ${issues.rows[0].with_summary} with AI summaries`);
  
  process.exit(0);
}

checkStatus().catch(e => { console.error(e); process.exit(1); });
