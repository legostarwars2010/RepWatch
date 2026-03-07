require('dotenv').config();
const { pool } = require('./db/pool');

async function checkSchema() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name IN ('votes', 'vote_records', 'issues')
    ORDER BY table_name, ordinal_position
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

checkSchema();
