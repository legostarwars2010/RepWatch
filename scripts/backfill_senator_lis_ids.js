#!/usr/bin/env node
/**
 * Backfill LIS member IDs into existing senator rows.
 *
 * Senators inserted before ingest_state.js was updated only have
 * { bioguide: "..." } in external_ids, missing the lis key required
 * for matching Senate roll-call XML during vote ingestion.
 *
 * This script reads legislators-current.yaml and updates every senator
 * row in representatives whose external_ids lacks a lis value.
 *
 * Usage: node scripts/backfill_senator_lis_ids.js
 *        node scripts/backfill_senator_lis_ids.js --dry-run
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { pool } = require('../db/pool');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║      BACKFILL SENATOR LIS IDs                      ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  if (dryRun) console.log('⚠️  DRY RUN — no changes will be written\n');

  const yamlPath = path.resolve(__dirname, '..', 'data', 'legislators-current.yaml');
  const legislators = yaml.load(fs.readFileSync(yamlPath, 'utf8'));

  // Build a lookup: bioguide_id → full id block (only for senators)
  const senatorIds = {};
  for (const leg of legislators) {
    const term = leg.terms[leg.terms.length - 1];
    if (term.type === 'sen' && leg.id?.bioguide && leg.id?.lis) {
      senatorIds[leg.id.bioguide] = { ...leg.id };
    }
  }
  console.log(`Found ${Object.keys(senatorIds).length} current senators with LIS IDs in YAML\n`);

  // Fetch all senator rows from DB
  const { rows } = await pool.query(
    "SELECT id, bioguide_id, name, external_ids FROM representatives WHERE chamber = 'senate'"
  );
  console.log(`Found ${rows.length} senator rows in DB\n`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const row of rows) {
    const fullIds = senatorIds[row.bioguide_id];

    if (!fullIds) {
      console.log(`  ⚠️  No YAML entry for ${row.name} (${row.bioguide_id})`);
      notFound++;
      continue;
    }

    const existingLis = row.external_ids?.lis;
    if (existingLis) {
      skipped++;
      continue;
    }

    console.log(`  → ${row.name} (${row.bioguide_id}): adding lis=${fullIds.lis}`);

    if (!dryRun) {
      await pool.query(
        'UPDATE representatives SET external_ids = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(fullIds), row.id]
      );
    }
    updated++;
  }

  console.log(`\n━━━ Summary ━━━`);
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped (already had lis): ${skipped}`);
  console.log(`  Not found in YAML: ${notFound}`);
  if (dryRun) console.log('\n  (dry run — no rows changed)');
  console.log();
}

main()
  .catch(err => { console.error('Fatal:', err.message); process.exit(1); })
  .finally(() => pool.end());
