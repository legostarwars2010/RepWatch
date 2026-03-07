#!/usr/bin/env node
/**
 * Check current vote coverage in the database
 */

require('dotenv').config();
const { pool } = require('../db/pool');

async function checkCoverage() {
  try {
    console.log('📊 Checking vote coverage...\n');
    
    // Overall stats
    const totalRes = await pool.query(`
      SELECT 
        COUNT(*) as total_votes,
        MIN(vote_date) as earliest_date,
        MAX(vote_date) as latest_date
      FROM votes
    `);
    
    console.log('OVERALL COVERAGE:');
    console.log(`Total votes: ${totalRes.rows[0].total_votes}`);
    console.log(`Earliest: ${totalRes.rows[0].earliest_date}`);
    console.log(`Latest: ${totalRes.rows[0].latest_date}\n`);
    
    // By chamber
    const chamberRes = await pool.query(`
      SELECT 
        chamber,
        COUNT(*) as count,
        MIN(vote_date) as earliest,
        MAX(vote_date) as latest
      FROM votes
      GROUP BY chamber
      ORDER BY chamber
    `);
    
    console.log('BY CHAMBER:');
    chamberRes.rows.forEach(row => {
      console.log(`${row.chamber}: ${row.count} votes (${row.earliest} to ${row.latest})`);
    });
    console.log();
    
    // Recent gaps (check if we're missing recent votes)
    const recentRes = await pool.query(`
      SELECT 
        chamber,
        MAX(vote_date) as last_vote,
        CURRENT_DATE - MAX(vote_date) as days_ago
      FROM votes
      GROUP BY chamber
    `);
    
    console.log('RECENCY CHECK:');
    recentRes.rows.forEach(row => {
      console.log(`${row.chamber}: Last vote ${row.days_ago} days ago (${row.last_vote})`);
    });
    console.log();
    
    // Check for linked issues
    const linkedRes = await pool.query(`
      SELECT 
        COUNT(DISTINCT vote_id) as votes_with_issues,
        (SELECT COUNT(*) FROM votes) as total_votes,
        ROUND(100.0 * COUNT(DISTINCT vote_id) / (SELECT COUNT(*) FROM votes), 2) as percent_linked
      FROM vote_records
      WHERE issue_id IS NOT NULL
    `);
    
    console.log('ISSUE LINKING:');
    console.log(`Votes linked to issues: ${linkedRes.rows[0].votes_with_issues} / ${linkedRes.rows[0].total_votes} (${linkedRes.rows[0].percent_linked}%)\n`);
    
  } catch (err) {
    console.error('Error checking coverage:', err);
  } finally {
    await pool.end();
  }
}

checkCoverage();
