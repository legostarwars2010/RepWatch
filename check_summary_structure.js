#!/usr/bin/env node
require('dotenv').config();
const { pool } = require('./db/pool');

async function checkSummaries() {
  const result = await pool.query(`
    SELECT ai_summary 
    FROM issues 
    WHERE ai_summary IS NOT NULL 
    LIMIT 1
  `);
  
  if (result.rows.length > 0) {
    console.log('Sample ai_summary structure:');
    console.log(JSON.stringify(result.rows[0].ai_summary, null, 2));
  } else {
    console.log('No issues with ai_summary found');
  }
  
  process.exit(0);
}

checkSummaries().catch(e => { 
  console.error(e); 
  process.exit(1); 
});
