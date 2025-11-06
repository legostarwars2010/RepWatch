#!/usr/bin/env node
require('dotenv').config();
const { pool } = require('../db/pool');
const { callLLM } = require('../services/llm');

/**
 * Generate AI summaries for all issues that don't have one yet
 * Uses bill title and description to create useful explanations
 */

async function summarizeIssue(issue) {
  const billId = issue.canonical_bill_id;
  const title = issue.title || 'Untitled Bill';
  const description = issue.description || 'No description available';
  
  const system = `You are an expert legislative analyst who explains bills in clear, accessible language. 
You will be given a bill title and description. Generate a structured JSON summary with these fields:
{
  "short_summary": "One paragraph (2-3 sentences) explaining what this bill does in plain English",
  "key_points": ["3-5 bullet points highlighting the most important aspects"],
  "yea_vote_means": "What voting YES on this bill means for constituents",
  "nay_vote_means": "What voting NO on this bill means for constituents",
  "categories": ["1-3 category tags like 'healthcare', 'environment', 'economy', etc."]
}`;

  const user = `Bill: ${billId}
Title: ${title}
Description: ${description}

Generate a comprehensive but accessible summary. Focus on practical impacts for voters.`;

  try {
    const result = await callLLM({ 
      system, 
      user, 
      max_tokens: 800,
      temperature: 0.3 
    });
    
    return result.json;
  } catch (error) {
    console.error(`  ❌ Error generating summary: ${error.message}`);
    return null;
  }
}

async function updateIssueSummary(issueId, summary) {
  await pool.query(`
    UPDATE issues
    SET 
      ai_summary = $1,
      ai_summary_updated_at = NOW()
    WHERE id = $2
  `, [JSON.stringify(summary), issueId]);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   GENERATE AI SUMMARIES FOR ISSUES                ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  // Get all issues that need summaries
  const result = await pool.query(`
    SELECT id, canonical_bill_id, title, description
    FROM issues
    WHERE canonical_bill_id IN (
      SELECT DISTINCT canonical_bill_id 
      FROM wa_test_votes
    )
    AND ai_summary IS NULL
    ORDER BY canonical_bill_id
  `);
  
  const issues = result.rows;
  
  if (issues.length === 0) {
    console.log('✅ All issues already have AI summaries!\n');
    await pool.end();
    return;
  }
  
  console.log(`Found ${issues.length} issues needing summaries\n`);
  
  let processed = 0;
  let successful = 0;
  let failed = 0;
  
  for (const issue of issues) {
    processed++;
    console.log(`[${processed}/${issues.length}] ${issue.canonical_bill_id}`);
    console.log(`  Title: ${issue.title?.substring(0, 60)}...`);
    
    const summary = await summarizeIssue(issue);
    
    if (summary) {
      await updateIssueSummary(issue.id, summary);
      console.log(`  ✅ Summary generated`);
      successful++;
    } else {
      console.log(`  ❌ Failed to generate summary`);
      failed++;
    }
    
    console.log('');
    
    // Rate limiting - be nice to the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('='.repeat(60));
  console.log(`\n📊 SUMMARY:`);
  console.log(`   Total processed: ${processed}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}\n`);
  
  if (successful > 0) {
    // Show a sample
    const sample = await pool.query(`
      SELECT canonical_bill_id, title, ai_summary
      FROM issues
      WHERE ai_summary IS NOT NULL
      LIMIT 1
    `);
    
    if (sample.rows.length > 0) {
      const s = sample.rows[0];
      console.log('📝 Sample Summary:');
      console.log(`   Bill: ${s.canonical_bill_id}`);
      console.log(`   Title: ${s.title}`);
      const summary = typeof s.ai_summary === 'string' 
        ? JSON.parse(s.ai_summary) 
        : s.ai_summary;
      if (summary.short_summary) {
        console.log(`   Summary: ${summary.short_summary.substring(0, 150)}...`);
      }
      console.log('');
    }
  }
  
  await pool.end();
}

main().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});
