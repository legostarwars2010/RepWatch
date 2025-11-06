#!/usr/bin/env node
/**
 * Migrate data from development Neon branch to production
 * 
 * This script:
 * 1. Dumps all data from the development database
 * 2. Creates the necessary tables in production
 * 3. Imports all data to production
 * 
 * Prerequisites:
 * - pg_dump and psql must be installed
 * - Both DEV_URL and DATABASE_URL must be set in .env
 */

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const DEV_URL = process.env.DEV_URL;
const PROD_URL = process.env.DATABASE_URL;
const BACKUP_DIR = path.join(__dirname, '..', 'tmp', 'db_backup');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');

// Validate environment variables
if (!DEV_URL) {
  console.error('❌ DEV_URL not set in .env file');
  process.exit(1);
}

if (!PROD_URL) {
  console.error('❌ DATABASE_URL not set in .env file');
  process.exit(1);
}

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

console.log('╔════════════════════════════════════════════════════╗');
console.log('║     NEON DATABASE MIGRATION: DEV → PRODUCTION      ║');
console.log('╚════════════════════════════════════════════════════╝\n');

console.log('📊 Database URLs:');
console.log('   DEV:  ', DEV_URL.split('@')[1]?.split('/')[0] || 'hidden');
console.log('   PROD: ', PROD_URL.split('@')[1]?.split('/')[0] || 'hidden');
console.log('');

// Confirm before proceeding
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('⚠️  This will OVERWRITE production data. Continue? (yes/no): ', (answer) => {
  readline.close();
  
  if (answer.toLowerCase() !== 'yes') {
    console.log('❌ Migration cancelled');
    process.exit(0);
  }

  performMigration();
});

function performMigration() {
  console.log('\n🚀 Starting migration...\n');

  try {
    // Step 1: Dump schema from dev
    console.log('📦 Step 1: Exporting schema from development...');
    const schemaFile = path.join(BACKUP_DIR, `schema_${TIMESTAMP}.sql`);
    execSync(`pg_dump "${DEV_URL}" --schema-only --no-owner --no-acl -f "${schemaFile}"`, {
      stdio: 'inherit'
    });
    console.log('   ✓ Schema exported to:', schemaFile);

    // Step 2: Dump data from dev
    console.log('\n📦 Step 2: Exporting data from development...');
    const dataFile = path.join(BACKUP_DIR, `data_${TIMESTAMP}.sql`);
    execSync(`pg_dump "${DEV_URL}" --data-only --no-owner --no-acl -f "${dataFile}"`, {
      stdio: 'inherit'
    });
    console.log('   ✓ Data exported to:', dataFile);

    // Step 3: Apply schema to production
    console.log('\n🔨 Step 3: Creating schema in production...');
    execSync(`psql "${PROD_URL}" -f "${schemaFile}"`, {
      stdio: 'inherit'
    });
    console.log('   ✓ Schema created in production');

    // Step 4: Import data to production
    console.log('\n📥 Step 4: Importing data to production...');
    execSync(`psql "${PROD_URL}" -f "${dataFile}"`, {
      stdio: 'inherit'
    });
    console.log('   ✓ Data imported to production');

    // Step 5: Verify counts
    console.log('\n🔍 Step 5: Verifying migration...');
    const { Pool } = require('pg');
    
    const devPool = new Pool({ connectionString: DEV_URL, ssl: { rejectUnauthorized: false } });
    const prodPool = new Pool({ connectionString: PROD_URL, ssl: { rejectUnauthorized: false } });

    (async () => {
      try {
        const tables = ['representatives', 'votes', 'issues'];
        console.log('\n   Table counts:');
        console.log('   ┌─────────────────────┬─────────┬─────────┐');
        console.log('   │ Table               │ Dev     │ Prod    │');
        console.log('   ├─────────────────────┼─────────┼─────────┤');
        
        for (const table of tables) {
          const devResult = await devPool.query(`SELECT COUNT(*) FROM ${table}`);
          const prodResult = await prodPool.query(`SELECT COUNT(*) FROM ${table}`);
          const devCount = devResult.rows[0].count;
          const prodCount = prodResult.rows[0].count;
          const match = devCount === prodCount ? '✓' : '✗';
          console.log(`   │ ${table.padEnd(19)} │ ${devCount.toString().padEnd(7)} │ ${prodCount.toString().padEnd(7)} │ ${match}`);
        }
        
        console.log('   └─────────────────────┴─────────┴─────────┘');
        
        await devPool.end();
        await prodPool.end();
        
        console.log('\n✅ Migration completed successfully!\n');
        console.log('💡 Backup files saved in:', BACKUP_DIR);
        
      } catch (err) {
        console.error('Error during verification:', err);
        process.exit(1);
      }
    })();

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}
