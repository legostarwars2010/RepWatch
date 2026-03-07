#!/usr/bin/env node
require('dotenv').config();
const { pool } = require('../db/pool');

async function main() {
  const res = await pool.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
    `,
    [['users', 'rep_subscriptions', 'notification_events', 'notification_state']]
  );
  console.log(res.rows);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

