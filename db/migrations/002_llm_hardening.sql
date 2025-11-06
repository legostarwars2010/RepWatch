-- 002_llm_hardening.sql
-- Add AI caching and metadata fields to issues table (idempotent)

ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS ai_summary JSONB,
  ADD COLUMN IF NOT EXISTS ai_summary_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_explanations JSONB,
  ADD COLUMN IF NOT EXISTS ai_prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS ai_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_last_error TEXT,
  ADD COLUMN IF NOT EXISTS ai_last_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS ai_last_tokens INTEGER;

CREATE INDEX IF NOT EXISTS ix_issues_ai_summary_updated_at ON issues(ai_summary_updated_at);
