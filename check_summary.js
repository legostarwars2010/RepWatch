require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DEV_DB_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT ai_summary, categories FROM issues WHERE canonical_bill_id='hr10515-118'")
  .then(r => {
    console.log(JSON.stringify(r.rows[0], null, 2));
    pool.end();
  });
