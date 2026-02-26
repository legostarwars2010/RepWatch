#!/usr/bin/env node
/**
 * Generate AI summaries for issues using real bill text (title, description, bill_summary from Congress.gov).
 * Uses llm_wrappers.summarizeIssue; prefers bill_summary > description > title so the LLM sees actual bill content.
 *
 * Usage:
 *   node scripts/generate_ai_summaries_for_votes.js [--limit=N]   # only issues with no ai_summary
 *   node scripts/generate_ai_summaries_for_votes.js --refresh [--limit=N]   # regenerate (overwrite) using bill_summary
 * Set NODE_ENV=development to use dev DB.
 */
require('dotenv').config();
const { pool } = require('../db/pool');
const { summarizeIssue } = require('../services/llm_wrappers');

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const refresh = args.includes('--refresh');
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50;

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   GENERATE AI SUMMARIES (using bill text)          ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const baseWhere = refresh
    ? `i.canonical_bill_id IN (SELECT DISTINCT canonical_bill_id FROM votes WHERE canonical_bill_id IS NOT NULL)
       AND (i.bill_summary IS NOT NULL OR i.description IS NOT NULL OR i.title IS NOT NULL)`
    : `i.ai_summary IS NULL
       AND (i.title IS NOT NULL OR i.description IS NOT NULL OR i.bill_summary IS NOT NULL)
       AND i.canonical_bill_id IN (SELECT DISTINCT canonical_bill_id FROM votes WHERE canonical_bill_id IS NOT NULL)`;

  const { rows: issues } = await pool.query(
    `SELECT i.id, i.canonical_bill_id, i.title, i.description, i.bill_summary
     FROM issues i
     WHERE ${baseWhere}
     ORDER BY i.id
     LIMIT $1`,
    [LIMIT]
  );

  if (issues.length === 0) {
    console.log(refresh ? '✅ No issues to refresh (or none with bill content).\n' : '✅ No issues need summaries.\n');
    await pool.end();
    return;
  }

  console.log(`${refresh ? 'Regenerating' : 'Generating'} ${issues.length} summaries (limit ${LIMIT})\n`);

  let ok = 0,
    err = 0;
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    // Prefer Congress.gov bill text so the summarizer sees real bill content
    const billText = issue.bill_summary || issue.description || issue.title || '';
    const issueForLlm = {
      title: issue.title,
      description: issue.description,
      bill_id: issue.canonical_bill_id,
      vote_question: issue.title,
      stage: '',
      bill_summary: issue.bill_summary || billText,
      full_text: issue.bill_summary || ''
    };

    try {
      const { json, meta } = await summarizeIssue(issueForLlm);
      await pool.query(
        `UPDATE issues SET ai_summary = $1, ai_summary_updated_at = NOW(), categories = $2 WHERE id = $3`,
        [json, json.categories || [], issue.id]
      );
      ok++;
      const preview = (billText || '').substring(0, 50);
      console.log(`[${i + 1}/${issues.length}] ✓ ${issue.canonical_bill_id} (${meta?.latencyMs}ms) ${preview ? `"${preview}..."` : ''}`);
    } catch (e) {
      err++;
      console.error(`[${i + 1}/${issues.length}] ✗ ${issue.canonical_bill_id}: ${e.message}`);
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
