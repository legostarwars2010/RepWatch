#!/usr/bin/env node
/**
 * Migrate data from development Neon branch to production using Node.js only
 * No external dependencies required (pg_dump/psql)
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration (DEV_DB_URL or DEV_URL = source; DATABASE_URL = production)
const DEV_URL = process.env.DEV_DB_URL || process.env.DEV_URL;
const PROD_URL = process.env.DATABASE_URL;

// Validate environment variables
if (!DEV_URL) {
  console.error('❌ DEV_DB_URL or DEV_URL not set in .env file');
  process.exit(1);
}

if (!PROD_URL) {
  console.error('❌ DATABASE_URL not set in .env file');
  process.exit(1);
}

console.log('╔════════════════════════════════════════════════════╗');
console.log('║     NEON DATABASE MIGRATION: DEV → PRODUCTION      ║');
console.log('╚════════════════════════════════════════════════════╝\n');

console.log('📊 Database URLs:');
console.log('   DEV:  ', DEV_URL.split('@')[1]?.split('/')[0] || 'hidden');
console.log('   PROD: ', PROD_URL.split('@')[1]?.split('/')[0] || 'hidden');
console.log('');

// Confirm before proceeding
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('⚠️  This will OVERWRITE all production data. Type "yes" to continue: ', (answer) => {
  rl.close();
  
  if (answer.toLowerCase() !== 'yes') {
    console.log('❌ Migration cancelled');
    process.exit(0);
  }

  performMigration();
});

async function performMigration() {
  console.log('\n🚀 Starting migration...\n');

  const devPool = new Pool({ 
    connectionString: DEV_URL, 
    ssl: { rejectUnauthorized: false } 
  });
  
  const prodPool = new Pool({ 
    connectionString: PROD_URL, 
    ssl: { rejectUnauthorized: false } 
  });

  try {
    // Step 1: Get schema from dev
    console.log('📋 Step 1: Reading schema from development...');
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    console.log(`   Found ${migrationFiles.length} migration files`);

    // Step 2: Drop and recreate tables in production
    console.log('\n🗑️  Step 2: Clearing production database...');
    await prodPool.query('DROP TABLE IF EXISTS votes CASCADE');
    await prodPool.query('DROP TABLE IF EXISTS representatives CASCADE');
    await prodPool.query('DROP TABLE IF EXISTS issues CASCADE');
    await prodPool.query('DROP TABLE IF EXISTS bill_identifiers CASCADE');
    console.log('   ✓ Cleared production tables');

    // Step 3: Create base tables matching dev schema exactly
    console.log('\n🔨 Step 3: Creating schema in production...');
    
    // Create representatives table
    await prodPool.query(`
      CREATE TABLE IF NOT EXISTS representatives (
        id SERIAL PRIMARY KEY,
        bioguide_id TEXT NOT NULL UNIQUE,
        name TEXT,
        party TEXT,
        state TEXT,
        chamber TEXT,
        district INTEGER,
        contact_json JSONB,
        external_ids JSONB,
        phone TEXT,
        website TEXT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
      )`);
    console.log('   ✓ Created representatives table');

    // Create issues table (match dev: bill_summary, categories, ai_explanations, etc.)
    await prodPool.query(`
      CREATE TABLE IF NOT EXISTS issues (
        id SERIAL PRIMARY KEY,
        title TEXT,
        description TEXT,
        bill_id TEXT,
        vote_date DATE,
        ai_summary JSONB,
        ai_summary_updated_at TIMESTAMPTZ,
        external_ids JSONB,
        canonical_bill_id TEXT UNIQUE,
        source TEXT,
        last_synced TIMESTAMPTZ,
        chamber TEXT,
        bill_summary TEXT,
        categories TEXT[],
        ai_explanations JSONB,
        ai_prompt_version TEXT,
        ai_model TEXT,
        ai_last_latency_ms INTEGER,
        ai_last_tokens INTEGER,
        ai_last_error TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
    console.log('   ✓ Created issues table');

    // Create votes table (match dev: vote_metadata, congress, roll_number, canonical_bill_id)
    await prodPool.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        representative_id INTEGER REFERENCES representatives(id) ON DELETE CASCADE,
        issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
        vote TEXT,
        vote_date DATE,
        roll_call TEXT,
        chamber TEXT,
        session INTEGER,
        vote_metadata JSONB,
        created_at TIMESTAMP,
        canonical_bill_id TEXT,
        congress INTEGER,
        roll_number INTEGER,
        UNIQUE(representative_id, roll_call, chamber)
      )`);
    console.log('   ✓ Created votes table');

    // Create indexes
    await prodPool.query('CREATE INDEX IF NOT EXISTS idx_votes_rep ON votes(representative_id)');
    await prodPool.query('CREATE INDEX IF NOT EXISTS idx_votes_issue ON votes(issue_id)');
    await prodPool.query('CREATE INDEX IF NOT EXISTS idx_votes_date ON votes(vote_date)');
    await prodPool.query('CREATE INDEX IF NOT EXISTS idx_reps_state_district ON representatives(state, district)');
    await prodPool.query('CREATE INDEX IF NOT EXISTS idx_reps_bioguide ON representatives(bioguide_id)');
    console.log('   ✓ Created indexes');

    // Step 4: Copy data from tables
    console.log('\n📦 Step 4: Copying data from development...');
    
    const tables = [
      { name: 'representatives', order: ['id', 'name', 'party', 'state', 'district', 'chamber', 'bioguide_id'] },
      { name: 'issues', order: ['id', 'canonical_bill_id', 'title', 'description', 'chamber', 'vote_date', 'ai_summary', 'ai_summary_updated_at'] },
      { name: 'votes', order: ['id', 'representative_id', 'issue_id', 'vote', 'vote_date', 'roll_call', 'chamber'] }
    ];

    for (const table of tables) {
      console.log(`\n   📊 Migrating table: ${table.name}`);
      
      // Get data from dev
      const devData = await devPool.query(`SELECT * FROM ${table.name} ORDER BY id`);
      console.log(`      - Found ${devData.rows.length} rows in dev`);
      
      if (devData.rows.length === 0) {
        console.log('      - Skipping (no data)');
        continue;
      }

      // Insert in batches (multi-row INSERT for speed; votes table is large)
      const batchSize = table.name === 'votes' ? 500 : 500;
      const columns = devData.rows[0] ? Object.keys(devData.rows[0]) : [];
      
      for (let i = 0; i < devData.rows.length; i += batchSize) {
        const batch = devData.rows.slice(i, i + batchSize);
        const allValues = [];
        const valueChunks = [];
        let param = 1;
        for (const row of batch) {
          const vals = columns.map((c) => row[c]);
          allValues.push(...vals);
          valueChunks.push('(' + vals.map(() => `$${param++}`).join(', ') + ')');
        }
        const insertSQL = `
          INSERT INTO ${table.name} (${columns.join(', ')})
          VALUES ${valueChunks.join(', ')}
          ON CONFLICT (id) DO NOTHING
        `;
        await prodPool.query(insertSQL, allValues);
        console.log(`      - Inserted ${Math.min(i + batchSize, devData.rows.length)}/${devData.rows.length}`);
      }
      
      // Reset sequence
      const maxIdResult = await prodPool.query(`SELECT MAX(id) FROM ${table.name}`);
      const maxId = maxIdResult.rows[0].max;
      if (maxId) {
        await prodPool.query(`SELECT setval('${table.name}_id_seq', $1, true)`, [maxId]);
        console.log(`      ✓ Reset sequence to ${maxId}`);
      }
    }

    // Step 5: Verify counts
    console.log('\n🔍 Step 5: Verifying migration...');
    console.log('\n   Table counts:');
    console.log('   ┌─────────────────────┬─────────┬─────────┬────────┐');
    console.log('   │ Table               │ Dev     │ Prod    │ Match  │');
    console.log('   ├─────────────────────┼─────────┼─────────┼────────┤');
    
    let allMatch = true;
    for (const table of tables) {
      const devResult = await devPool.query(`SELECT COUNT(*) FROM ${table.name}`);
      const prodResult = await prodPool.query(`SELECT COUNT(*) FROM ${table.name}`);
      const devCount = parseInt(devResult.rows[0].count);
      const prodCount = parseInt(prodResult.rows[0].count);
      const match = devCount === prodCount ? '✓' : '✗';
      if (devCount !== prodCount) allMatch = false;
      
      console.log(`   │ ${table.name.padEnd(19)} │ ${devCount.toString().padEnd(7)} │ ${prodCount.toString().padEnd(7)} │ ${match.padEnd(6)} │`);
    }
    
    console.log('   └─────────────────────┴─────────┴─────────┴────────┘');
    
    await devPool.end();
    await prodPool.end();
    
    if (allMatch) {
      console.log('\n✅ Migration completed successfully!\n');
      console.log('💡 Production database is now in sync with development');
    } else {
      console.log('\n⚠️  Migration completed but some counts do not match');
      console.log('   Please verify the data manually');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    await devPool.end();
    await prodPool.end();
    process.exit(1);
  }
}
