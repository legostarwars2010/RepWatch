require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DEV_DB_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='issues' ORDER BY ordinal_position")
  .then(r => {
    console.log('Columns in issues table:');
    console.log(r.rows.map(x => x.column_name).join(', '));
    pool.end();
  });
