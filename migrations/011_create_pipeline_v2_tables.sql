-- RepWatch Pipeline v2 isolated schema.
-- This migration creates only new v2_* tables and does not alter existing production tables.

CREATE TABLE IF NOT EXISTS v2_raw_bills (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_hash TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_id, payload_hash)
);

CREATE TABLE IF NOT EXISTS v2_raw_bill_actions (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_hash TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_id, payload_hash)
);

CREATE TABLE IF NOT EXISTS v2_raw_bill_text_versions (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_hash TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_id, payload_hash)
);

CREATE TABLE IF NOT EXISTS v2_raw_votes (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_hash TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_id, payload_hash)
);

CREATE TABLE IF NOT EXISTS v2_bills (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  congress INTEGER,
  chamber TEXT,
  bill_type TEXT,
  bill_number TEXT,
  title TEXT NOT NULL,
  official_summary TEXT,
  current_status TEXT,
  introduced_at TIMESTAMPTZ,
  latest_action_at TIMESTAMPTZ,
  source_raw_bill_id BIGINT,
  lifecycle_json JSONB,
  bill_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_v2_bills_source_raw_bill
    FOREIGN KEY (source_raw_bill_id)
    REFERENCES v2_raw_bills(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v2_bill_actions (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  action_date TIMESTAMPTZ,
  action_text TEXT NOT NULL,
  actor TEXT,
  stage TEXT,
  source_raw_action_id BIGINT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_v2_bill_actions_bill
    FOREIGN KEY (bill_id)
    REFERENCES v2_bills(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v2_bill_actions_source_raw
    FOREIGN KEY (source_raw_action_id)
    REFERENCES v2_raw_bill_actions(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v2_vote_events (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  bill_id BIGINT,
  chamber TEXT,
  vote_type TEXT NOT NULL,
  vote_question TEXT NOT NULL,
  vote_result TEXT NOT NULL,
  vote_date TIMESTAMPTZ,
  yea_count INTEGER,
  nay_count INTEGER,
  present_count INTEGER,
  not_voting_count INTEGER,
  source_raw_vote_id BIGINT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_v2_vote_events_bill
    FOREIGN KEY (bill_id)
    REFERENCES v2_bills(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_v2_vote_events_source_raw
    FOREIGN KEY (source_raw_vote_id)
    REFERENCES v2_raw_votes(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v2_bill_status_history (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL,
  status TEXT NOT NULL,
  status_date TIMESTAMPTZ,
  reason TEXT,
  source_action_id BIGINT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_v2_bill_status_history_bill
    FOREIGN KEY (bill_id)
    REFERENCES v2_bills(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v2_bill_status_history_action
    FOREIGN KEY (source_action_id)
    REFERENCES v2_bill_actions(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v2_bill_versions (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  version_code TEXT,
  version_name TEXT,
  issued_at TIMESTAMPTZ,
  text_url TEXT,
  text_content TEXT,
  source_raw_text_version_id BIGINT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_v2_bill_versions_bill
    FOREIGN KEY (bill_id)
    REFERENCES v2_bills(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v2_bill_versions_source_raw
    FOREIGN KEY (source_raw_text_version_id)
    REFERENCES v2_raw_bill_text_versions(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v2_bill_text_chunks (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL,
  bill_version_id BIGINT NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading TEXT,
  chunk_text TEXT NOT NULL,
  estimated_tokens INTEGER NOT NULL,
  char_count INTEGER NOT NULL,
  chunk_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bill_version_id, chunk_index),
  CONSTRAINT fk_v2_bill_text_chunks_bill
    FOREIGN KEY (bill_id)
    REFERENCES v2_bills(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v2_bill_text_chunks_version
    FOREIGN KEY (bill_version_id)
    REFERENCES v2_bill_versions(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS v2_pipeline_runs (
  id BIGSERIAL PRIMARY KEY,
  run_type TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model_name TEXT NOT NULL,
  generation_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validation_status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS v2_bill_semantic_outputs (
  id BIGSERIAL PRIMARY KEY,
  bill_id BIGINT NOT NULL,
  bill_version_id BIGINT,
  one_line_summary TEXT NOT NULL,
  plain_english_summary TEXT NOT NULL,
  key_provisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  why_it_matters TEXT NOT NULL,
  issue_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence_score NUMERIC(5,4) NOT NULL,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  validation_status TEXT NOT NULL,
  pipeline_run_id BIGINT,
  output_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_v2_bill_semantics_bill
    FOREIGN KEY (bill_id)
    REFERENCES v2_bills(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v2_bill_semantics_version
    FOREIGN KEY (bill_version_id)
    REFERENCES v2_bill_versions(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_v2_bill_semantics_run
    FOREIGN KEY (pipeline_run_id)
    REFERENCES v2_pipeline_runs(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v2_vote_semantic_outputs (
  id BIGSERIAL PRIMARY KEY,
  vote_event_id BIGINT NOT NULL,
  vote_type TEXT NOT NULL,
  procedural_flag BOOLEAN NOT NULL,
  what_this_vote_decides TEXT NOT NULL,
  effect_if_passes TEXT NOT NULL,
  effect_if_fails TEXT NOT NULL,
  next_step TEXT NOT NULL,
  confidence_score NUMERIC(5,4) NOT NULL,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  validation_status TEXT NOT NULL,
  pipeline_run_id BIGINT,
  output_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_v2_vote_semantics_vote
    FOREIGN KEY (vote_event_id)
    REFERENCES v2_vote_events(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v2_vote_semantics_run
    FOREIGN KEY (pipeline_run_id)
    REFERENCES v2_pipeline_runs(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS v2_artifact_validations (
  id BIGSERIAL PRIMARY KEY,
  pipeline_run_id BIGINT NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_id BIGINT NOT NULL,
  is_valid BOOLEAN NOT NULL,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  validator_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_v2_artifact_validations_run
    FOREIGN KEY (pipeline_run_id)
    REFERENCES v2_pipeline_runs(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v2_raw_bills_external_id ON v2_raw_bills(external_id);
CREATE INDEX IF NOT EXISTS idx_v2_raw_bills_payload_hash ON v2_raw_bills(payload_hash);
CREATE INDEX IF NOT EXISTS idx_v2_raw_votes_external_id ON v2_raw_votes(external_id);
CREATE INDEX IF NOT EXISTS idx_v2_raw_votes_payload_hash ON v2_raw_votes(payload_hash);
CREATE INDEX IF NOT EXISTS idx_v2_bills_congress_bill_type ON v2_bills(congress, bill_type, bill_number);
CREATE INDEX IF NOT EXISTS idx_v2_bill_actions_bill_id ON v2_bill_actions(bill_id);
CREATE INDEX IF NOT EXISTS idx_v2_vote_events_bill_id ON v2_vote_events(bill_id);
CREATE INDEX IF NOT EXISTS idx_v2_pipeline_runs_generation ON v2_pipeline_runs(generation_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_v2_pipeline_runs_status ON v2_pipeline_runs(status, validation_status);
CREATE INDEX IF NOT EXISTS idx_v2_bill_semantic_outputs_bill_id ON v2_bill_semantic_outputs(bill_id);
CREATE INDEX IF NOT EXISTS idx_v2_vote_semantic_outputs_vote_id ON v2_vote_semantic_outputs(vote_event_id);
CREATE INDEX IF NOT EXISTS idx_v2_artifact_validations_run_id ON v2_artifact_validations(pipeline_run_id);
