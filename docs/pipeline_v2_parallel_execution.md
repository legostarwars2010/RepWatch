# RepWatch Pipeline v2 Parallel Execution Guide

This guide describes how to run `pipeline_v2` alongside the existing RepWatch system without changing current production behavior.

## Safety Rules

- `pipeline_v2` writes only to `v2_*` tables.
- Existing jobs (`scripts/daily_ingest.js` and related scripts) remain unchanged.
- Existing prompts and API endpoints remain unchanged.
- No v2 step updates non-v2 rows.

## New Assets Introduced

- Migration: `migrations/011_create_pipeline_v2_tables.sql`
- v2 code root: `src/pipeline_v2/`
- v2 tests + fixtures: `tests/legislation_v2/`
- Current pipeline baseline doc: `docs/current_pipeline_reference.md`

## Execution Sequence

1. Apply migration:
   - `node scripts/run_migrations.js`
2. Configure v2 source adapters and LLM client injection for `src/pipeline_v2/jobs/runPipelineV2.ts`.
3. Run v2 orchestration in order:
   - `ingestRawBills`
   - `ingestRawVotes`
   - `normalizeBills`
   - `normalizeVotes`
   - `chunkBillText`
   - `generateBillSemantics`
   - `generateVoteSemantics`
   - `synthesizeBillLifecycle`
4. Review validation artifacts in:
   - `v2_pipeline_runs`
   - `v2_artifact_validations`

## Side-by-Side Comparison Workflow

- Keep existing pipeline running as-is.
- Run v2 on the same period/data slices.
- Compare output coverage using `src/pipeline_v2/jobs/compareLegacyVsV2.ts`.
- Investigate records where:
  - legacy output exists and v2 output is missing
  - v2 output exists with `needs_review = true`

## Rollback / Isolation

- To disable v2, stop executing v2 jobs only.
- Existing production behavior is unchanged because legacy jobs/endpoints/tables are untouched.
- v2 schema and code can be removed independently if needed.
