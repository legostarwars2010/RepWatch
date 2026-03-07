require('dotenv').config();
const { pool } = require('../db/pool');
const today = new Date().toISOString().slice(0, 10);
(async () => {
  const r = await pool.query(
    "DELETE FROM notification_events WHERE event_type = 'daily_digest' AND event_key LIKE $1",
    ['digest:%:' + today]
  );
  console.log('Cleared', r.rowCount, 'today digest event(s)');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
