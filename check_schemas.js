#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('pg');

async function checkSchemas() {
  console.log('Checking dev and prod database schemas...\n');
  
  const devPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  const prodPool = new Pool({
    connectionString: process.env.PROD_DATABASE_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    // Check dev structure
    console.log('=== DEV DATABASE ===');
    const devIssues = await devPool.query(`
      SELECT 
        column_name, 
        data_type 
      FROM information_schema.columns 
      WHERE table_name = 'issues' 
      ORDER BY ordinal_position
    `);
    console.log('Issues table columns:', devIssues.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
    
    const devCount = await devPool.query('SELECT COUNT(*) as count FROM issues WHERE ai_summary IS NOT NULL');
    console.log(`Issues with ai_summary: ${devCount.rows[0].count}`);
    
    const devSample = await devPool.query(`
      SELECT ai_summary 
      FROM issues 
      WHERE ai_summary IS NOT NULL 
      LIMIT 1
    `);
    console.log('Sample ai_summary keys:', Object.keys(devSample.rows[0]?.ai_summary || {}));
    console.log('Has medium_summary?', devSample.rows[0]?.ai_summary?.medium_summary ? 'YES' : 'NO');
    
    console.log('\n=== PROD DATABASE ===');
    const prodIssues = await prodPool.query(`
      SELECT 
        column_name, 
        data_type 
      FROM information_schema.columns 
      WHERE table_name = 'issues' 
      ORDER BY ordinal_position
    `);
    console.log('Issues table columns:', prodIssues.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
    
    const prodCount = await prodPool.query('SELECT COUNT(*) as count FROM issues WHERE ai_summary IS NOT NULL');
    console.log(`Issues with ai_summary: ${prodCount.rows[0].count}`);
    
    const prodSample = await prodPool.query(`
      SELECT ai_summary 
      FROM issues 
      WHERE ai_summary IS NOT NULL 
      LIMIT 1
    `);
    console.log('Sample ai_summary keys:', Object.keys(prodSample.rows[0]?.ai_summary || {}));
    console.log('Has medium_summary?', prodSample.rows[0]?.ai_summary?.medium_summary ? 'YES' : 'NO');
    
    console.log('\n=== COMPARISON ===');
    const devCols = new Set(devIssues.rows.map(r => r.column_name));
    const prodCols = new Set(prodIssues.rows.map(r => r.column_name));
    
    const missingInProd = [...devCols].filter(c => !prodCols.has(c));
    const missingInDev = [...prodCols].filter(c => !devCols.has(c));
    
    if (missingInProd.length > 0) {
      console.log('⚠️  Columns in DEV but not PROD:', missingInProd.join(', '));
    }
    if (missingInDev.length > 0) {
      console.log('⚠️  Columns in PROD but not DEV:', missingInDev.join(', '));
    }
    
    if (devCols.size === prodCols.size && missingInProd.length === 0) {
      console.log('✅ Schemas match! Safe to copy data.');
    } else {
      console.log('❌ Schema mismatch detected!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await devPool.end();
    await prodPool.end();
    process.exit(0);
  }
}

checkSchemas();
