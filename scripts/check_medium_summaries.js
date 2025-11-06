require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DEV_URL,
  ssl: { rejectUnauthorized: false }
});

// Check if any issues have been updated with medium_summary
pool.query(`
  SELECT 
    canonical_bill_id,
    title,
    ai_summary->>'short_summary' as short_summary,
    ai_summary->>'medium_summary' as medium_summary,
    ai_summary_updated_at
  FROM issues
  WHERE ai_summary->>'medium_summary' IS NOT NULL
  ORDER BY ai_summary_updated_at DESC
  LIMIT 5
`)
.then(result => {
  console.log(`\nFound ${result.rows.length} issues with medium_summary:\n`);
  result.rows.forEach((row, i) => {
    console.log(`${i+1}. ${row.canonical_bill_id}`);
    console.log(`   Short: ${row.short_summary?.substring(0, 60)}...`);
    console.log(`   Medium: ${row.medium_summary?.substring(0, 60)}...`);
    console.log(`   Updated: ${row.ai_summary_updated_at}\n`);
  });
  pool.end();
})
.catch(err => {
  console.error(err);
  pool.end();
});
