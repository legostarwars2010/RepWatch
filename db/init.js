const { pool } = require("./pool");

async function waitForDb(maxRetries = 15) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      console.log(`⏳ DB not ready (attempt ${i}/${maxRetries}) -> ${err.code || err.message}`);
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
