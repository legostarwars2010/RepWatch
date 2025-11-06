#!/usr/bin/env node
/**
 * Interactive RepWatch - Enter an address to find your representative and their latest votes
 */

require('dotenv').config();
const readline = require('readline');
const { pool } = require('../db/pool');
const { resolveAddress } = require('../services/district_resolver');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function lookupRepresentative(address) {
  console.log('\n🔍 Looking up your representative...\n');
  
  // Resolve address to district
  const district = await resolveAddress(address);
  
  if (!district || !district.state || !district.district) {
    console.log('❌ Could not resolve address to a congressional district\n');
    return null;
  }
  
  const fullDistrict = `${district.state}-${district.district}`;
  console.log(`📍 District: ${fullDistrict} (${district.source || 'unknown'})\n`);
  
  // Find representative
  // Note: district column is integer, state is separate text column
  const districtNum = district.district === 'AL' ? null : parseInt(district.district);
  const repResult = await pool.query(`
    SELECT id, name, party, state, district, website, phone
    FROM representatives
    WHERE state = $1 AND (district = $2 OR (district IS NULL AND $2 IS NULL))
  `, [district.state, districtNum]);
  
  if (repResult.rows.length === 0) {
    console.log(`⚠️  No representative found for ${fullDistrict}\n`);
    console.log(`   This might be because we only have Washington State representatives in the database.\n`);
    return null;
  }
  
  return repResult.rows[0];
}

async function getLatestVotes(repId, limit = 5) {
  const result = await pool.query(`
    SELECT 
      v.vote,
      v.vote_date,
      v.canonical_bill_id,
      v.roll_call,
      i.title,
      i.description,
      i.ai_summary
    FROM votes v
    LEFT JOIN issues i ON v.issue_id = i.id
    WHERE v.representative_id = $1
    ORDER BY v.vote_date DESC, v.roll_call DESC
    LIMIT $2
  `, [repId, limit]);
  
  return result.rows;
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown date';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

function getVoteIcon(vote) {
  switch(vote?.toLowerCase()) {
    case 'yes': return '✅';
    case 'no': return '❌';
    case 'present': return '🟡';
    case 'abstain': return '⚪';
    default: return '⚫';
  }
}

async function displayRepresentativeInfo(rep, votes) {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    YOUR REPRESENTATIVE                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`👤 ${rep.name} (${rep.party})`);
  const displayDistrict = rep.district ? `${rep.state}-${rep.district}` : `${rep.state} (Statewide)`;
  console.log(`   District: ${displayDistrict}`);
  if (rep.website) console.log(`   Website: ${rep.website}`);
  if (rep.phone) console.log(`   Phone: ${rep.phone}`);
  
  console.log('\n' + '─'.repeat(64) + '\n');
  console.log('🗳️  LATEST VOTES:\n');
  
  if (votes.length === 0) {
    console.log('   No votes found.\n');
    return;
  }
  
  votes.forEach((vote, idx) => {
    const icon = getVoteIcon(vote.vote);
    const billId = vote.canonical_bill_id || 'Unknown Bill';
    const dateStr = formatDate(vote.vote_date);
    const title = vote.title || 'No title available';
    
    console.log(`${idx + 1}. ${icon} ${vote.vote.toUpperCase().padEnd(12)} ${billId} (${dateStr})`);
    console.log(`   ${title}\n`);
    
    // Show AI summary if available
    if (vote.ai_summary) {
      try {
        // ai_summary is already a JSON object (jsonb type), no need to parse
        const summary = typeof vote.ai_summary === 'string' 
          ? JSON.parse(vote.ai_summary) 
          : vote.ai_summary;
        
        // Handle both old and new summary formats
        const summaryText = summary.summary || summary.short_summary;
        if (summaryText) {
          console.log(`   📝 ${summaryText}\n`);
        }
        
        // Handle different vote types
        const voteType = vote.vote.toLowerCase();
        let explanation = null;
        
        if (voteType === 'yes') {
          explanation = summary.yea_explanation || summary.what_a_yea_vote_means;
        } else if (voteType === 'no') {
          explanation = summary.nay_explanation || summary.what_a_nay_vote_means;
        } else if (voteType === 'present') {
          explanation = 'Voting PRESENT means the representative was there but chose not to vote yes or no, effectively abstaining while being counted for quorum purposes.';
        } else if (voteType === 'not voting') {
          explanation = 'NOT VOTING means the representative did not cast a vote (absent or chose not to participate).';
        }
        
        if (explanation) {
          console.log(`   💡 ${explanation}\n`);
        }
      } catch (e) {
        // Skip if AI summary is malformed
        console.log(`   ⚠️  Error displaying summary: ${e.message}\n`);
      }
    } else {
      // No AI summary, but still explain special vote types
      const voteType = vote.vote.toLowerCase();
      if (voteType === 'present') {
        console.log(`   💡 Voting PRESENT means the representative was there but chose not to vote yes or no, effectively abstaining while being counted for quorum purposes.\n`);
      } else if (voteType === 'not voting') {
        console.log(`   💡 NOT VOTING means the representative did not cast a vote (absent or chose not to participate).\n`);
      }
    }
    
    console.log('   ' + '─'.repeat(60) + '\n');
  });
}

async function main() {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                  REPWATCH - INTERACTIVE LOOKUP                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  while (true) {
    const address = await question('\n📍 Enter your address (or "quit" to exit): ');
    
    if (address.toLowerCase() === 'quit' || address.toLowerCase() === 'exit' || address.toLowerCase() === 'q') {
      console.log('\n👋 Thanks for using RepWatch!\n');
      rl.close();
      process.exit(0);
    }
    
    if (!address.trim()) {
      console.log('⚠️  Please enter a valid address\n');
      continue;
    }
    
    try {
      const rep = await lookupRepresentative(address);
      
      if (!rep) {
        continue;
      }
      
      const numVotes = await question('\nHow many recent votes to show? (default: 5): ');
      const limit = parseInt(numVotes) || 5;
      
      const votes = await getLatestVotes(rep.id, limit);
      
      await displayRepresentativeInfo(rep, votes);
      
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      console.error('Please try again with a different address.\n');
    }
  }
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n\n👋 Exiting...\n');
  rl.close();
  process.exit(0);
});

main().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});
