#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

async function runMigrationOnProd() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Running migration on PRODUCTION database...\n');
    
    // Run 006 first
    const migration006Path = path.join(__dirname, 'db', 'migrations', '006_add_bill_summary.sql');
    const sql006 = await fs.readFile(migration006Path, 'utf8');
    
    await pool.query(sql006);
    console.log('✅ Migration 006 (bill_summary) applied to PRODUCTION database');
    
    // Run 007 next
    const migration007Path = path.join(__dirname, 'db', 'migrations', '007_add_categories.sql');
    const sql007 = await fs.readFile(migration007Path, 'utf8');
    
    await pool.query(sql007);
    console.log('✅ Migration 007 (categories) applied to PRODUCTION database');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

runMigrationOnProd();
