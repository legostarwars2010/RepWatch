import type { BillSource, VoteSource } from "../ingestion/dataSources";
import type { LlmClient } from "../semantics/llmClient";
import type { PipelineV2Db } from "../types";
import { ingestRawBills } from "./ingestRawBills";
import { ingestRawVotes } from "./ingestRawVotes";
import { normalizeBills } from "./normalizeBills";
import { normalizeVotes } from "./normalizeVotes";
import { chunkBillText } from "./chunkBillText";
import { generateBillSemantics } from "./generateBillSemantics";
import { generateVoteSemantics } from "./generateVoteSemantics";
import { synthesizeBillLifecycle } from "./synthesizeBillLifecycle";

export interface PipelineV2Dependencies {
  db: PipelineV2Db;
  billSource: BillSource;
  voteSource: VoteSource;
  llmClient: LlmClient;
}

export interface PipelineV2RunOptions {
  billExternalIdPrefix?: string;
  voteExternalIdPrefix?: string;
}

export interface PipelineV2RunSummary {
  rawBills: number;
  rawVotes: number;
  normalizedBills: number;
  normalizedVotes: number;
  billChunks: number;
  billSemantics: number;
  voteSemantics: number;
  lifecycleSynthesized: number;
}

export async function runPipelineV2(
  deps: PipelineV2Dependencies,
  options: PipelineV2RunOptions = {}
): Promise<PipelineV2RunSummary> {
  const rawBillResult = await ingestRawBills(deps.db, deps.billSource);
  const rawVoteResult = await ingestRawVotes(deps.db, deps.voteSource);
  const normalizedBillResult = await normalizeBills(deps.db, { billExternalIdPrefix: options.billExternalIdPrefix });
  const normalizedVoteResult = await normalizeVotes(deps.db, {
    voteExternalIdPrefix: options.voteExternalIdPrefix
  });
  const chunkCount = await chunkBillText(deps.db, 2200, { billExternalIdPrefix: options.billExternalIdPrefix });
  const billSemanticCount = await generateBillSemantics(deps.db, deps.llmClient, {
    billExternalIdPrefix: options.billExternalIdPrefix
  });
  const voteSemanticCount = await generateVoteSemantics(deps.db, deps.llmClient, {
    voteExternalIdPrefix: options.voteExternalIdPrefix
  });
  const lifecycleCount = await synthesizeBillLifecycle(deps.db, { billExternalIdPrefix: options.billExternalIdPrefix });

  return {
    rawBills: rawBillResult.ingestedBills,
    rawVotes: rawVoteResult.ingestedVotes,
    normalizedBills: normalizedBillResult.normalizedBills,
    normalizedVotes: normalizedVoteResult.normalizedVotes,
    billChunks: chunkCount,
    billSemantics: billSemanticCount,
    voteSemantics: voteSemanticCount,
    lifecycleSynthesized: lifecycleCount
  };
}
