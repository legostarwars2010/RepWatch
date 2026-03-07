require('dotenv').config();
const { pool } = require('./db/pool');

async function checkCurrentVotes() {
  const res = await pool.query(`
    SELECT 
      MIN(roll_number) as min_roll,
      MAX(roll_number) as max_roll,
      COUNT(DISTINCT roll_number) as unique_rolls,
      COUNT(*) as total_vote_records
    FROM votes
    WHERE congress = 119 AND chamber = 'house'
  `);
  
  console.log('119th Congress House Votes:');
  console.log(JSON.stringify(res.rows[0], null, 2));
  
  // Check for gaps
  const gapRes = await pool.query(`
    WITH roll_numbers AS (
      SELECT DISTINCT CAST(roll_call AS INTEGER) as roll
      FROM votes
      WHERE congress = 119 AND chamber = 'house'
      AND roll_call ~ '^[0-9]+$'
    )
    SELECT 
      roll + 1 as gap_start,
      (SELECT MIN(r2.roll) FROM roll_numbers r2 WHERE r2.roll > r1.roll) - 1 as gap_end
    FROM roll_numbers r1
    WHERE NOT EXISTS (
      SELECT 1 FROM roll_numbers r2 WHERE r2.roll = r1.roll + 1
    )
    AND (SELECT MIN(r2.roll) FROM roll_numbers r2 WHERE r2.roll > r1.roll) IS NOT NULL
    ORDER BY gap_start
    LIMIT 10
  `);
  
  console.log('\nGaps in roll call coverage:');
  if (gapRes.rows.length === 0) {
    console.log('No gaps found!');
  } else {
    gapRes.rows.forEach(gap => {
      const size = gap.gap_end - gap.gap_start + 1;
      console.log(`  Roll ${gap.gap_start} to ${gap.gap_end} (${size} missing)`);
    });
  }
  
  await pool.end();
}

checkCurrentVotes();
