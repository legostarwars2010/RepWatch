#!/usr/bin/env node
require('dotenv').config();
const { pool } = require('../db/pool');

const name = process.argv[2] || 'pelosi';
pool.query(
  `SELECT id, name, state, district, chamber FROM representatives WHERE LOWER(name) LIKE LOWER($1) ORDER BY name LIMIT 20`,
  [`%${name}%`]
).then((r) => {
  console.log(`Matches for "${name}":`, r.rows.length);
  r.rows.forEach((row) => console.log(' ', row.name, row.state, row.chamber));
  return pool.query('SELECT COUNT(*) as total FROM representatives');
}).then((r) => {
  console.log('\nTotal representatives in DB:', r.rows[0].total);
  pool.end();
}).catch((e) => { console.error(e); process.exit(1); });
