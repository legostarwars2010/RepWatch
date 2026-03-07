require('dotenv').config();
const { pool } = require('./db/pool');

async function checkVotesTable() {
  const res = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'votes'
    ORDER BY ordinal_position
  `);
  console.log('VOTES TABLE SCHEMA:');
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

checkVotesTable();
