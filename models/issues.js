const { pool } = require("../db/pool");
const ms = require('ms');

const SUMMARY_TTL_DAYS = Number(process.env.AI_SUMMARY_TTL_DAYS || 30);
const EXPLAIN_TTL_DAYS = Number(process.env.AI_EXPLAIN_TTL_DAYS || 30);
const PROMPT_VERSION = process.env.AI_PROMPT_VERSION || 'v1';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

async function getIssueById(id) {
  const result = await pool.query("SELECT * FROM issues WHERE id = $1", [id]);
  return result.rows[0] || null;
}

async function getCachedSummary(id) {
  const result = await pool.query(
    "SELECT ai_summary, ai_summary_updated_at, ai_prompt_version, ai_model FROM issues WHERE id = $1",
    [id]
  );
  return result.rows[0] || null;
}

function isTimestampFresh(ts, days) {
  if (!ts) return false;
  const ageMs = Date.now() - new Date(ts).getTime();
  return ageMs <= days * 24 * 60 * 60 * 1000;
}

function isSummaryFresh(issueRow) {
  if (!issueRow || !issueRow.ai_summary) return false;
  if (issueRow.ai_prompt_version !== PROMPT_VERSION) return false;
  if (issueRow.ai_model !== LLM_MODEL) return false;
  return isTimestampFresh(issueRow.ai_summary_updated_at, SUMMARY_TTL_DAYS);
}

function isExplainFresh(issueRow, voteKey) {
  if (!issueRow || !issueRow.ai_explanations) return false;
  if (issueRow.ai_prompt_version !== PROMPT_VERSION) return false;
  if (issueRow.ai_model !== LLM_MODEL) return false;
  const entry = issueRow.ai_explanations && issueRow.ai_explanations[voteKey];
  if (!entry) return false;
  const updatedAt = issueRow.ai_summary_updated_at || null;
  return isTimestampFresh(updatedAt, EXPLAIN_TTL_DAYS);
}

async function writeSummary(id, json, meta = {}) {
  await pool.query(
    `UPDATE issues SET ai_summary = $1, ai_summary_updated_at = NOW(), ai_prompt_version = $2, ai_model = $3, ai_last_latency_ms = $4, ai_last_tokens = $5 WHERE id = $6`,
    [json, PROMPT_VERSION, LLM_MODEL, meta.latencyMs || null, meta.tokens || null, id]
  );
}

async function writeExplain(id, voteKey, json, meta = {}) {
  // Use jsonb_set to atomically set ai_explanations.voteKey = json
  const path = `{${voteKey}}`;
  await pool.query(
    `UPDATE issues SET ai_explanations = jsonb_set(coalesce(ai_explanations, '{}'::jsonb), $1, $2::jsonb, true), ai_summary_updated_at = NOW(), ai_prompt_version = $3, ai_model = $4 WHERE id = $5`,
    [path, JSON.stringify(json), PROMPT_VERSION, LLM_MODEL, id]
  );
}

module.exports = {
  getIssueById,
  getCachedSummary,
  isSummaryFresh,
  isExplainFresh,
  writeSummary,
  writeExplain,
};
