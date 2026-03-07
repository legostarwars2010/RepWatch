require('dotenv').config();
const { pool } = require('./db/pool');

async function checkConstraints() {
  const res = await pool.query(`
    SELECT conname, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'votes'::regclass
    AND contype = 'c'
  `);
  
  console.log('CHECK constraints on votes table:');
  res.rows.forEach(r => {
    console.log(`\n${r.conname}:`);
    console.log(`  ${r.pg_get_constraintdef}`);
  });
  
  await pool.end();
}

checkConstraints();
