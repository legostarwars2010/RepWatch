const { pool } = require("./pool");

async function waitForDb(maxRetries = 15) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      // Try a direct connect to capture driver-level errors as well
      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
      } finally {
        client.release();
      }
      return;
    } catch (err) {
      // Log the full error object for diagnostics (including errno/code and stack)
      console.log(`⏳ DB not ready (attempt ${i}/${maxRetries}) ->`, err);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error("DB unreachable after retries");
}

async function initDb() {
  try {
    await waitForDb();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS representatives (
        id SERIAL PRIMARY KEY,
        name TEXT,
        chamber TEXT,
        state TEXT,
        district TEXT,
        party TEXT,
        contact_json JSONB
      )`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS issues (
        id SERIAL PRIMARY KEY,
        title TEXT,
        description TEXT,
        bill_id TEXT,
        vote_date DATE
      )`);

    // Add columns for AI cached summaries if they don't exist
    await pool.query(`
      ALTER TABLE issues
      ADD COLUMN IF NOT EXISTS ai_summary JSONB,
      ADD COLUMN IF NOT EXISTS ai_summary_updated_at TIMESTAMPTZ
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS vote_records (
        id SERIAL PRIMARY KEY,
        rep_id INTEGER REFERENCES representatives(id) ON DELETE CASCADE,
        issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
        vote TEXT,
        explanation TEXT
      )`);

    console.log("✅ Tables initialized.");
  } catch (err) {
    console.error("❌ DB Init Failed:", err);
  }
}

module.exports = { initDb };
