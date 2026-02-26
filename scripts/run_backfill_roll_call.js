#!/usr/bin/env node
require('dotenv').config();
const { pool } = require('../db/pool');

const sql = `
UPDATE votes
SET roll_call = 'house-' || congress || '-' || to_char(vote_date, 'YYYY') || '-' || roll_number
WHERE chamber = 'house'
  AND vote_date IS NOT NULL
  AND roll_number IS NOT NULL
  AND roll_call ~ '^house-[0-9]+-[0-9]+$'
`;

pool.query(sql)
  .then((r) => {
    console.log('Backfill done. Rows updated:', r.rowCount);
    pool.end();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
