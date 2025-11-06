const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');

async function run(){
  const migrationsDir = path.join(__dirname,'..','migrations');
  if(!fs.existsSync(migrationsDir)){
    console.log('No migrations directory found:', migrationsDir);
    process.exit(0);
  }
  const files = fs.readdirSync(migrationsDir).filter(f=>f.endsWith('.sql')).sort();
  if(files.length===0){ console.log('No .sql migrations to run'); process.exit(0); }

  for(const f of files){
    const p = path.join(migrationsDir,f);
    console.log('Running migration:', f);
    const sql = fs.readFileSync(p,'utf8');
    try{
      await pool.query(sql);
      console.log(' -> ok');
    }catch(e){
      console.warn(' -> error (continuing):', e && e.message);
    }
  }

  await pool.end();
  console.log('Migrations complete');
}

run().catch(e=>{ console.error('Migration runner failed', e); process.exit(1); });
