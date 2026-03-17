# Current Pipeline Reference (Baseline)

This document describes the existing RepWatch ingestion and summarization pipeline as-is.
It is informational only and does not propose changes to current production behavior.

## Current Bill Ingest Flow

RepWatch does not run a standalone bill-first ingest in the active daily flow. Bills are primarily introduced through vote ingestion and then enriched.

1. `scripts/daily_ingest.js` runs `scripts/ingest_house_votes.js` and `scripts/ingest_senate_votes.js`.
2. Those scripts normalize bill identifiers from roll call payloads and attach `canonical_bill_id`.
3. `ensureIssuesFromVotes()` creates/links `issues` rows from vote-linked bill context.
4. `scripts/fetch_bill_summaries.js` enriches linked bills from Congress.gov and updates issue title/description/bill summary fields.

## Current Vote Ingest Flow

### House
- Source: House Clerk EVS XML endpoints.
- Parser: `services/evs_house_reader.js`.
- Ingest script: `scripts/ingest_house_votes.js`.
- Representative matching: `representatives.bioguide_id`.

### Senate
- Source: Senate roll call XML endpoints.
- Parser: `services/senate_votes_reader.js`.
- Ingest script: `scripts/ingest_senate_votes.js`.
- Representative matching: `representatives.external_ids->>'lis'`.

### Shared behavior
- Bill token normalization: `services/bill_normalize.js`.
- Upsert target: `votes` table.
- Issue linking target: `issues` table via canonical bill IDs.

## Current Prompts

The active prompts are inline JavaScript strings in:

- `services/llm_wrappers.js`:
  - `summarizeIssue()`/`summarizeSingleChunk()`
  - `explainVote()`
- Batch scripts with prompt usage:
  - `scripts/generate_ai_summaries_for_votes.js`
  - `scripts/generate_ai_summaries.js` (legacy/supplemental path)
  - `scripts/summarize_bill_with_ai.js` (file-based bill summary utility path)

There are no dedicated prompt template files in the current production path.

## Current Output Tables / Columns

### Primary operational tables
- `votes`
- `issues`
- `representatives`

### AI output fields on `issues`
- `ai_summary` (JSONB)
- `ai_explanations` (JSONB)
- `ai_summary_updated_at`
- `ai_prompt_version`
- `ai_model`
- `ai_last_latency_ms`
- `ai_last_tokens`
- `categories`
- `bill_summary`

## Current Model Usage

- Default model: `gpt-4o-mini`.
- Config source: `LLM_MODEL` env var (falls back to default).
- Prompt version source: `AI_PROMPT_VERSION` env var (default `v1`).
- Freshness checks in `models/issues.js` compare stored prompt/model metadata to current env config before reusing cached AI artifacts.

## Known Weaknesses (Current System)

- Tight coupling between ingestion and production tables (`votes`/`issues`) limits safe experimentation.
- Prompt content is inline rather than versioned in dedicated prompt files.
- AI outputs are co-located on `issues`, making side-by-side model comparisons harder.
- Bill ingestion is partially vote-driven, which can miss bill context before vote events exist.
- Batch and API summary writers are not fully metadata-consistent in all paths.
- No fully isolated, append-only raw layer for reproducible reprocessing across all artifact types.

## Safety-Critical Coupling Points

- `votes` upsert uniqueness depends on `(representative_id, roll_call, chamber)`.
- `issues` canonical linkage depends on unique `canonical_bill_id`.
- Existing endpoints join `votes` and `issues` directly.
- Existing pipelines and prompts are production-active and should remain unchanged while v2 is developed in parallel.
