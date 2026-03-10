#!/usr/bin/env node
/**
 * Generate AI summaries for issues.
 * Covers two categories:
 *   1. Bill-linked issues (canonical_bill_id set) — uses Congress.gov title/summary
 *   2. Senate roll-linked issues (source='senate_gov_xml', no canonical_bill_id) —
 *      nominations, amendments, procedural votes — uses vote_title + document_text
 *
 * Usage:
 *   node scripts/generate_ai_summaries_for_votes.js [--limit=N]
 *   node scripts/generate_ai_summaries_for_votes.js --refresh [--limit=N]
 *   node scripts/generate_ai_summaries_for_votes.js --senate-only [--limit=N]
 */
require('dotenv').config();
const { pool } = require('../db/pool');
const { summarizeIssue } = require('../services/llm_wrappers');

const args = process.argv.slice(2);
const limitArg    = args.find((a) => a.startsWith('--limit='));
const refresh     = args.includes('--refresh');
const senateOnly  = args.includes('--senate-only');
const LIMIT       = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50;

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   GENERATE AI SUMMARIES (bills + senate rolls)     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // ── Build WHERE clause ────────────────────────────────────────────────────
  // Include both bill-linked issues AND senate roll-linked issues (bill_id LIKE 'senate-roll:%')
  const hasContent = `(i.title IS NOT NULL OR i.description IS NOT NULL OR i.bill_summary IS NOT NULL)`;
  const linkedToVote = `(
    i.canonical_bill_id IN (SELECT DISTINCT canonical_bill_id FROM votes WHERE canonical_bill_id IS NOT NULL)
  )`;

  let baseWhere;
  if (refresh) {
    baseWhere = `${hasContent} AND ${linkedToVote}`;
  } else if (senateOnly) {
    baseWhere = `i.ai_summary IS NULL AND i.source = 'senate_gov_xml' AND ${hasContent} AND ${linkedToVote}`;
  } else {
    baseWhere = `i.ai_summary IS NULL AND ${hasContent} AND ${linkedToVote}`;
  }

  // Prioritise: issues with real bill_summary first, then by newest id
  const { rows: issues } = await pool.query(
    `SELECT i.id, i.canonical_bill_id, i.bill_id, i.title, i.description, i.bill_summary, i.source
     FROM issues i
     WHERE ${baseWhere}
     ORDER BY (i.bill_summary IS NOT NULL) DESC, i.id DESC
     LIMIT $1`,
    [LIMIT]
  );

  if (issues.length === 0) {
    console.log(refresh ? '✅ No issues to refresh.\n' : '✅ No issues need summaries.\n');
    await pool.end();
    return;
  }

  console.log(`${refresh ? 'Regenerating' : 'Generating'} ${issues.length} summaries (limit ${LIMIT})\n`);

  let ok = 0, err = 0;
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const isSenateRoll = issue.canonical_bill_id?.startsWith('senate-roll:');

    // For senate roll-linked issues, pull vote_metadata for context
    let voteQuestion = '';
    let voteStage = 'Senate floor';
    if (isSenateRoll) {
      // Extract roll_call from canonical_bill_id: "senate-roll:senate-119-2025-42"
      const rollCall = issue.canonical_bill_id.replace('senate-roll:', '');
      try {
        const vmRes = await pool.query(
          `SELECT vote_metadata FROM votes WHERE roll_call = $1 AND chamber = 'senate' LIMIT 1`,
          [rollCall]
        );
        const vm = vmRes.rows[0]?.vote_metadata || {};
        // vote_title is richest: "Confirmation of Pete Hegseth as Secretary of Defense"
        voteQuestion = vm.vote_title || vm.question || issue.title || '';
        // Provide vote result as additional context for the LLM
        if (vm.vote_result_text) {
          voteStage = `Senate floor — ${vm.vote_result_text}`;
        }
      } catch (_) {}
    }

    // Prefer Congress.gov bill_summary; fall back to description, then title
    const billText = issue.bill_summary || issue.description || issue.title || '';
    const issueForLlm = {
      title:         issue.title,
      description:   issue.description,
      bill_id:       issue.canonical_bill_id || issue.bill_id,
      // Use vote_title so LLM knows vote type (cloture, nomination, amendment, final passage)
      vote_question: isSenateRoll ? voteQuestion : (voteQuestion || issue.title),
      stage:         voteStage,
      bill_summary:  issue.bill_summary || billText,
      full_text:     issue.bill_summary || '',
    };

    try {
      const { json, meta } = await summarizeIssue(issueForLlm);
      await pool.query(
        `UPDATE issues SET ai_summary = $1, ai_summary_updated_at = NOW(), categories = $2 WHERE id = $3`,
        [json, json.categories || [], issue.id]
      );
      ok++;
      const preview = (issue.title || '').substring(0, 55);
      const billKey = issue.canonical_bill_id || issue.bill_id || '?';
      console.log(`[${i + 1}/${issues.length}] ✓ ${billKey} (${meta?.latencyMs}ms) "${preview}"`);
    } catch (e) {
      err++;
      const billKey = issue.canonical_bill_id || issue.bill_id || '?';
      console.error(`[${i + 1}/${issues.length}] ✗ ${billKey}: ${e.message}`);
    }

    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\nDone: ${ok} ok, ${err} failed.\n`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
