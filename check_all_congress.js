require('dotenv').config();
const { pool } = require('./db/pool');

async function checkAllVotes() {
  const res = await pool.query(`
    SELECT 
      congress,
      chamber,
      COUNT(DISTINCT roll_call) as unique_rolls,
      MIN(CAST(roll_call AS INTEGER)) as min_roll,
      MAX(CAST(roll_call AS INTEGER)) as max_roll,
      COUNT(*) as total_records
    FROM votes
    WHERE roll_call ~ '^[0-9]+$'
    GROUP BY congress, chamber
    ORDER BY congress DESC, chamber
  `);
  
  console.log('All votes by Congress:');
  console.table(res.rows);
  
  await pool.end();
}

checkAllVotes();
