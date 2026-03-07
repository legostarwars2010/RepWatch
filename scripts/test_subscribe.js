#!/usr/bin/env node
require('dotenv').config();
const crypto = require('crypto');
const { pool } = require('../db/pool');

async function run() {
  const email = 'alidarvish110@gmail.com';
  const representativeIds = [36, 51];

  const validReps = await pool.query(
    'SELECT id FROM representatives WHERE id = ANY($1::int[])',
    [representativeIds]
  );
  const validIds = validReps.rows.map((r) => r.id);
  if (validIds.length === 0) {
    console.error('No valid representative IDs found');
    process.exit(1);
  }

  const unsubToken = crypto.randomBytes(24).toString('hex');
  const userResult = await pool.query(
    `INSERT INTO users (email, unsub_token)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET updated_at = now()
     RETURNING id, unsub_token`,
    [email, unsubToken]
  );
  const row = userResult.rows[0];
  const userId = row.id;
  const tokenToReturn = row.unsub_token;

  for (const repId of validIds) {
    await pool.query(
      `INSERT INTO rep_subscriptions (user_id, representative_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, representative_id) DO UPDATE SET paused_at = NULL, updated_at = now()`,
      [userId, repId]
    );
  }

  console.log('Subscribed:', email, 'to rep IDs:', validIds);
  console.log('Unsubscribe link:');
  console.log('  http://localhost:8080/api/unsubscribe?token=' + tokenToReturn);
  await pool.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
