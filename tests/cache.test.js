// Ensure dotenv is loaded for test processes so process.env contains values from `.env`
try { require('dotenv').config(); } catch (e) { /* optional */ }

const hasDb = Boolean(process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);
if (!hasDb) {
  console.warn('Skipping cache tests: no DATABASE_URL / NEON_DATABASE_URL set in environment');
}

const { pool } = hasDb ? require('../db/pool') : { pool: null };
const { getCachedSummary, setCachedSummary } = hasDb ? require('../models/issues') : { getCachedSummary: null, setCachedSummary: null };

describe('issues cache', () => {
  if (!hasDb) {
    test('skipped - no database configured', () => {
      expect(true).toBe(true);
    });
    return;
  }
  let issueId;

  beforeAll(async () => {
    const r = await pool.query('SELECT id FROM issues LIMIT 1');
    if (r.rows.length) issueId = r.rows[0].id;
    else {
      const ins = await pool.query("INSERT INTO issues (title, bill_id) VALUES ('test', 'TEST-1') RETURNING id");
      issueId = ins.rows[0].id;
    }
  });

  test('set and get cached summary', async () => {
    await setCachedSummary(issueId, { summary: 'hello', key_points: ['a','b'] });
    const cached = await getCachedSummary(issueId);
    expect(cached).toBeTruthy();
    expect(cached.ai_summary.summary).toBe('hello');
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });
});
