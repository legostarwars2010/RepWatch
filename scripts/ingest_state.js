#!/usr/bin/env node
/**
 * Ingest a single state: representatives + their recent votes
 * Usage: node scripts/ingest_state.js --state CA
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const fetch = require('node-fetch');
const { XMLParser } = require('fast-xml-parser');
const { pool } = require('../db/pool');
const { parseClerkHouseBill } = require('../lib/bill_id_normalizer');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// Parse command line arguments
const args = process.argv.slice(2);
const stateArg = args.find(arg => arg.startsWith('--state='));
const STATE = stateArg ? stateArg.split('=')[1].toUpperCase() : null;
const VOTES_TO_FETCH = 50; // Recent votes to fetch

if (!STATE) {
  console.error('❌ Error: Please specify a state with --state=XX (e.g., --state=CA)');
  process.exit(1);
}

console.log('╔════════════════════════════════════════════════════╗');
console.log('║          INGEST STATE PIPELINE                     ║');
console.log('╚════════════════════════════════════════════════════╝\n');
console.log(`🏛️  State: ${STATE}\n`);

/**
 * Step 1: Ingest representatives for the state
 */
async function ingestRepresentatives() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 1: Ingest Representatives\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const yamlPath = path.resolve(__dirname, '..', 'data', 'legislators-current.yaml');
  const yamlContent = fs.readFileSync(yamlPath, 'utf8');
  const legislators = yaml.load(yamlContent);
  
  // Filter by state
  const stateReps = legislators.filter(leg => {
    const term = leg.terms[leg.terms.length - 1];
    return term.state === STATE && term.end >= '2025-01-01';
  });
  
  console.log(`Found ${stateReps.length} current representatives for ${STATE}\n`);
  
  if (stateReps.length === 0) {
    console.log('⚠️  No representatives found for this state\n');
    return [];
  }
  
  const inserted = [];
  
  for (const leg of stateReps) {
    const bio = leg.id;
    const term = leg.terms[leg.terms.length - 1];
    
    const name = `${leg.name.first} ${leg.name.last}`;
    const party = term.party === 'Republican' ? 'Republican' : 
                  term.party === 'Democrat' ? 'Democrat' : 'Independent';
    const chamber = term.type === 'sen' ? 'senate' : 'house';
    const district = term.district ? parseInt(term.district) : null;
    
    const contactJson = {
      address: term.address || null,
      phone: term.phone || null,
      fax: term.fax || null,
      contact_form: term.contact_form || null,
      office: term.office || null
    };
    
    try {
      const result = await pool.query(`
        INSERT INTO representatives (
          bioguide_id, name, party, state, chamber, district,
          contact_json, external_ids, phone, website
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (bioguide_id) DO UPDATE SET
          name = EXCLUDED.name,
          party = EXCLUDED.party,
          state = EXCLUDED.state,
          chamber = EXCLUDED.chamber,
          district = EXCLUDED.district,
          contact_json = EXCLUDED.contact_json,
          phone = EXCLUDED.phone,
          website = EXCLUDED.website,
          updated_at = NOW()
        RETURNING id, name, district
      `, [
        bio.bioguide,
        name,
        party,
        STATE,
        chamber,
        district,
        contactJson,
        { bioguide: bio.bioguide },
        term.phone || null,
        term.url || null
      ]);
      
      const displayDistrict = district ? `District ${district}` : 'Statewide';
      console.log(`  ✅ ${name} (${party}, ${displayDistrict})`);
      inserted.push(result.rows[0]);
      
    } catch (e) {
      console.log(`  ❌ Error inserting ${name}: ${e.message}`);
    }
  }
  
  console.log(`\n✅ Inserted/updated ${inserted.length} representatives\n`);
  return inserted;
}

/**
 * Step 2: Fetch recent House votes
 */
async function findLatestRoll(year) {
  for (let testRoll = 800; testRoll > 0; testRoll -= 50) {
    const url = `https://clerk.house.gov/evs/${year}/roll${String(testRoll).padStart(3, '0')}.xml`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        for (let r = testRoll + 50; r > testRoll; r--) {
          const testUrl = `https://clerk.house.gov/evs/${year}/roll${String(r).padStart(3, '0')}.xml`;
          const testResp = await fetch(testUrl);
          if (testResp.ok) return r;
        }
        return testRoll;
      }
    } catch (e) {
      // Continue
    }
  }
  return 100;
}

async function fetchRecentVotes(stateBioguides) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 2: Fetch Recent Votes\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const year = 2025;
  const latestRoll = await findLatestRoll(year);
  console.log(`  Latest House roll: ${latestRoll}\n`);
  
  let votesStored = 0;
  
  for (let rollNum = latestRoll; rollNum > latestRoll - VOTES_TO_FETCH && rollNum > 0; rollNum--) {
    const url = `https://clerk.house.gov/evs/${year}/roll${String(rollNum).padStart(3, '0')}.xml`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const text = await response.text();
      const data = parser.parse(text);
      const vote = data['rollcall-vote'] || data;
      const meta = vote['vote-metadata'] || {};
      
      const congress = meta.congress || 119;
      const chamber = 'house';
      const voteDate = meta['action-date'];
      const question = meta['vote-question'];
      const description = meta['vote-desc'];
      const legisNum = meta['legis-num'];
      
      const billInfo = parseClerkHouseBill(meta);
      const canonicalBillId = billInfo?.canonical || null;
      
      const recordedVotes = vote['vote-data']?.['recorded-vote'] || [];
      const memberVotes = Array.isArray(recordedVotes) ? recordedVotes : [recordedVotes];
      
      let stateVotesInRoll = 0;
      
      for (const member of memberVotes) {
        const legislator = member.legislator || {};
        const bioguideId = legislator['@_name-id'];
        const votePosition = member.vote;
        
        if (!stateBioguides.includes(bioguideId)) continue;
        
        const repResult = await pool.query(
          'SELECT id FROM representatives WHERE bioguide_id = $1',
          [bioguideId]
        );
        
        if (repResult.rows.length === 0) continue;
        const repId = repResult.rows[0].id;
        
        let normalizedVote = 'not voting';
        const v = (votePosition || '').toLowerCase().trim();
        if (v.includes('yea') || v === 'aye') normalizedVote = 'yes';
        else if (v.includes('nay') || v === 'no') normalizedVote = 'no';
        else if (v.includes('present')) normalizedVote = 'present';
        
        let issueId = null;
        if (canonicalBillId) {
          const issueResult = await pool.query(
            'SELECT id FROM issues WHERE canonical_bill_id = $1',
            [canonicalBillId]
          );
          issueId = issueResult.rows[0]?.id || null;
        }
        
        try {
          await pool.query(`
            INSERT INTO votes (
              representative_id, issue_id, vote, vote_date, roll_call,
              chamber, canonical_bill_id, congress, roll_number, vote_metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (representative_id, roll_call, chamber) 
            DO UPDATE SET
              vote = EXCLUDED.vote,
              issue_id = EXCLUDED.issue_id,
              canonical_bill_id = EXCLUDED.canonical_bill_id,
              vote_date = EXCLUDED.vote_date
          `, [
            repId, issueId, normalizedVote, voteDate,
            `house-${congress}-${rollNum}`, chamber, canonicalBillId,
            congress, rollNum,
            JSON.stringify({ question, description, legis_num: legisNum })
          ]);
          
          stateVotesInRoll++;
        } catch (e) {
          // Skip on error
        }
      }
      
      if (stateVotesInRoll > 0) {
        votesStored += stateVotesInRoll;
        console.log(`  Roll ${rollNum}: ${stateVotesInRoll} ${STATE} votes (${canonicalBillId || 'no bill'})`);
      }
      
    } catch (e) {
      // Skip on error
    }
  }
  
  console.log(`\n✅ Stored ${votesStored} votes for ${STATE}\n`);
  return votesStored;
}

/**
 * Step 3: Create issues from votes
 */
async function createIssues() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 3: Create Issues from Votes\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const bills = await pool.query(`
    SELECT DISTINCT 
      v.canonical_bill_id,
      v.congress,
      v.vote_metadata
    FROM votes v
    INNER JOIN representatives r ON v.representative_id = r.id
    WHERE r.state = $1 AND v.canonical_bill_id IS NOT NULL
  `, [STATE]);
  
  console.log(`  Found ${bills.rows.length} unique bills\n`);
  
  let created = 0;
  
  for (const bill of bills.rows) {
    const metadata = bill.vote_metadata || {};
    const description = metadata.description || metadata.question || '';
    const title = description || `Bill ${bill.canonical_bill_id}`;
    
    try {
      await pool.query(`
        INSERT INTO issues (
          title, description, bill_id, canonical_bill_id,
          external_ids, source
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (canonical_bill_id) DO UPDATE SET
          title = COALESCE(issues.title, EXCLUDED.title),
          description = COALESCE(issues.description, EXCLUDED.description)
        RETURNING id
      `, [
        title, description, bill.canonical_bill_id,
        bill.canonical_bill_id,
        JSON.stringify({ congress: bill.congress }),
        'house_clerk_xml'
      ]);
      
      created++;
    } catch (e) {
      // Skip on error
    }
  }
  
  console.log(`  ✅ Created/updated ${created} issues\n`);
  
  // Link votes to issues
  const linked = await pool.query(`
    UPDATE votes v
    SET issue_id = i.id
    FROM issues i, representatives r
    WHERE v.canonical_bill_id = i.canonical_bill_id
      AND v.representative_id = r.id
      AND v.issue_id IS NULL
      AND r.state = $1
  `, [STATE]);
  
  console.log(`  ✅ Linked ${linked.rowCount} votes to issues\n`);
}

/**
 * Main pipeline
 */
async function main() {
  try {
    const reps = await ingestRepresentatives();
    
    if (reps.length === 0) {
      console.log('No representatives found. Exiting.\n');
      process.exit(0);
    }
    
    const bioguides = reps.map(r => {
      // Get bioguide from database
      return pool.query('SELECT bioguide_id FROM representatives WHERE id = $1', [r.id])
        .then(res => res.rows[0]?.bioguide_id);
    });
    
    const stateBioguides = (await Promise.all(bioguides)).filter(Boolean);
    
    await fetchRecentVotes(stateBioguides);
    await createIssues();
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ STATE INGESTION COMPLETE\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Summary
    const summary = await pool.query(`
      SELECT 
        COUNT(DISTINCT r.id) as reps,
        COUNT(v.id) as votes,
        COUNT(DISTINCT v.canonical_bill_id) as bills
      FROM representatives r
      LEFT JOIN votes v ON r.id = v.representative_id
      WHERE r.state = $1
    `, [STATE]);
    
    const stats = summary.rows[0];
    console.log(`📊 ${STATE} Statistics:`);
    console.log(`   Representatives: ${stats.reps}`);
    console.log(`   Votes: ${stats.votes}`);
    console.log(`   Bills: ${stats.bills}\n`);
    
    console.log('💡 Next steps:');
    console.log(`   1. Fetch bill titles: node scripts/fetch_2025_bill_titles.js`);
    console.log(`   2. Generate AI summaries: node scripts/quick_summarize_wa_votes.js`);
    console.log(`   3. Test with interactive lookup: node scripts/interactive_rep_lookup.js\n`);
    
  } catch (error) {
    console.error('❌ Pipeline failed:', error.message);
    console.error(error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
