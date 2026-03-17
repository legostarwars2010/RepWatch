# RepWatch Pipeline v2

`pipeline_v2` is an isolated ingestion and semantics pipeline that runs in parallel with the current RepWatch production pipeline.

## Isolation Guarantees

- Uses dedicated `v2_*` tables only.
- Lives entirely under `src/pipeline_v2/`.
- Does not modify existing ingestion scripts, prompts, endpoints, or legacy summary generation.

## Main Entry Point

- `src/pipeline_v2/jobs/runPipelineV2.ts`

## Stage Modules

- Raw ingestion: `jobs/ingestRawBills.ts`, `jobs/ingestRawVotes.ts`
- Normalization: `jobs/normalizeBills.ts`, `jobs/normalizeVotes.ts`
- Text chunking: `jobs/chunkBillText.ts`
- Semantics generation: `jobs/generateBillSemantics.ts`, `jobs/generateVoteSemantics.ts`
- Validation: `validation/validateBillSemantics.ts`, `validation/validateVoteSemantics.ts`
- Lifecycle synthesis: `lifecycle/computeBillLifecycle.ts`
