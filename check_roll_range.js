require('dotenv').config();
const { pool } = require('./db/pool');

async function checkRollRange() {
  const res = await pool.query(`
    SELECT 
      MIN(roll_number) as min_roll,
      MAX(roll_number) as max_roll,
      COUNT(DISTINCT roll_number) as unique_rolls,
      MAX(roll_number) - MIN(roll_number) + 1 as expected_count,
      MAX(roll_number) - MIN(roll_number) + 1 - COUNT(DISTINCT roll_number) as missing_count
    FROM votes
    WHERE congress = 119 AND chamber = 'house'
  `);
  
  console.log('119th Congress House Vote Coverage:');
  console.table(res.rows);
  
  // Find specific gaps
  const gaps = await pool.query(`
    WITH RECURSIVE numbers AS (
      SELECT (SELECT MIN(roll_number) FROM votes WHERE congress = 119 AND chamber = 'house') as n
      UNION ALL
      SELECT n + 1 FROM numbers WHERE n < (SELECT MAX(roll_number) FROM votes WHERE congress = 119 AND chamber = 'house')
    )
    SELECT n as missing_roll
    FROM numbers
    WHERE NOT EXISTS (
      SELECT 1 FROM votes WHERE congress = 119 AND chamber = 'house' AND roll_number = n
    )
    ORDER BY n
    LIMIT 20
  `);
  
  console.log('\nMissing roll call numbers (first 20):');
  if (gaps.rows.length > 0) {
    console.log(gaps.rows.map(r => r.missing_roll).join(', '));
  } else {
    console.log('None! Complete coverage.');
  }
  
  await pool.end();
}

checkRollRange();
