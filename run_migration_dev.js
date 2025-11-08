#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

async function runMigrationOnDev() {
  const pool = new Pool({
    connectionString: process.env.DEV_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Running migration on DEV database...\n');
    
    const migrationPath = path.join(__dirname, 'db', 'migrations', '007_add_categories.sql');
    const sql = await fs.readFile(migrationPath, 'utf8');
    
    await pool.query(sql);
    console.log('✅ Migration applied to DEV database');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

runMigrationOnDev();
