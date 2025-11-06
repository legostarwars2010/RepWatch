#!/usr/bin/env node
/**
 * Ingest all 50 states one by one
 * Usage: node scripts/ingest_all_states.js
 */

require('dotenv').config();
const { spawn } = require('child_process');
const { pool } = require('../db/pool');

// All 50 states + DC
const ALL_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC'
];

async function getCompletedStates() {
  const result = await pool.query(`
    SELECT DISTINCT state 
    FROM representatives 
    ORDER BY state
  `);
  return result.rows.map(r => r.state);
}

async function ingestState(state) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Starting ingestion for ${state}...`);
    console.log('='.repeat(60) + '\n');
    
    const child = spawn('node', ['scripts/ingest_state.js', `--state=${state}`], {
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ ${state} completed successfully\n`);
        resolve();
      } else {
        console.log(`\n❌ ${state} failed with code ${code}\n`);
        reject(new Error(`State ${state} failed`));
      }
    });
    
    child.on('error', (err) => {
      console.error(`\n❌ Error spawning process for ${state}:`, err.message);
      reject(err);
    });
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║          INGEST ALL STATES PIPELINE                    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  const completed = await getCompletedStates();
  console.log(`Already completed states: ${completed.join(', ')}\n`);
  
  const remaining = ALL_STATES.filter(s => !completed.includes(s));
  console.log(`Remaining states to ingest: ${remaining.length}`);
  console.log(`States: ${remaining.join(', ')}\n`);
  
  if (remaining.length === 0) {
    console.log('✅ All states already ingested!\n');
    process.exit(0);
  }
  
  const confirm = process.argv.includes('--yes') || process.argv.includes('-y');
  
  if (!confirm) {
    console.log('⚠️  This will ingest all remaining states sequentially.');
    console.log('   This may take a significant amount of time.\n');
    console.log('   To proceed, run with --yes flag:\n');
    console.log('   node scripts/ingest_all_states.js --yes\n');
    process.exit(0);
  }
  
  console.log(`\n🚀 Starting ingestion of ${remaining.length} states...\n`);
  
  let successful = 0;
  let failed = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < remaining.length; i++) {
    const state = remaining[i];
    console.log(`\n[${i + 1}/${remaining.length}] Processing ${state}...`);
    
    try {
      await ingestState(state);
      successful++;
    } catch (error) {
      console.error(`Failed to ingest ${state}:`, error.message);
      failed++;
      
      // Ask if we should continue
      console.log('\n⚠️  Do you want to continue with remaining states? (continuing in 5 seconds...)');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Brief pause between states
    if (i < remaining.length - 1) {
      console.log('\n⏸️  Pausing for 2 seconds before next state...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Time elapsed: ${elapsed} minutes`);
  console.log('='.repeat(60) + '\n');
  
  // Final stats
  const stats = await pool.query(`
    SELECT 
      COUNT(DISTINCT state) as states,
      COUNT(DISTINCT id) as reps,
      (SELECT COUNT(*) FROM votes) as votes,
      (SELECT COUNT(*) FROM issues) as issues
    FROM representatives
  `);
  
  const s = stats.rows[0];
  console.log('📊 Database Statistics:');
  console.log(`   States: ${s.states}`);
  console.log(`   Representatives: ${s.reps}`);
  console.log(`   Votes: ${s.votes}`);
  console.log(`   Issues: ${s.issues}\n`);
  
  console.log('🎉 All states processed!\n');
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
