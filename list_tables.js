require('dotenv').config();
const { pool } = require('./db/pool');

async function listTables() {
  const res = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log('ALL TABLES:');
  res.rows.forEach(r => console.log(`  - ${r.table_name}`));
  await pool.end();
}

listTables();
