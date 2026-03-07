require('dotenv').config();
const { pool } = require('./db/pool');

async function checkVotesContent() {
  // Check a few sample votes
  const sample = await pool.query(`
    SELECT id, roll_call, chamber, vote_date, congress, roll_number, canonical_bill_id
    FROM votes
    ORDER BY id DESC
    LIMIT 10
  `);
  
  console.log('Sample of most recent votes:');
  console.table(sample.rows);
  
  // Count total
  const count = await pool.query('SELECT COUNT(*) FROM votes');
  console.log(`\nTotal votes in table: ${count.rows[0].count}`);
  
  // Check congress values
  const congressCheck = await pool.query(`
    SELECT 
      congress,
      COUNT(*) as count
    FROM votes
    GROUP BY congress
    ORDER BY congress DESC
  `);
  
  console.log('\nVotes by congress value:');
  console.table(congressCheck.rows);
  
  await pool.end();
}

checkVotesContent();
