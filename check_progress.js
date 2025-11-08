require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DEV_DB_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query(`
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN categories IS NOT NULL THEN 1 END) as with_categories,
    COUNT(CASE WHEN bill_summary IS NOT NULL THEN 1 END) as with_bill_text
  FROM issues
`)
  .then(r => {
    console.log('Summary Generation Progress:');
    console.log('============================');
    console.log(`Total issues: ${r.rows[0].total}`);
    console.log(`With bill text: ${r.rows[0].with_bill_text}`);
    console.log(`With new categories: ${r.rows[0].with_categories}`);
    console.log(`Remaining to process: ${r.rows[0].with_bill_text - r.rows[0].with_categories}`);
    pool.end();
  });
