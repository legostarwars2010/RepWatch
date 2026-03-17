import type { PipelineV2Db } from "../types";
import type { VoteSource } from "../ingestion/dataSources";
import { storeRawVote } from "../ingestion/rawStorage";
import { buildExternalId } from "../utils/ids";

export interface IngestRawVotesResult {
  ingestedVotes: number;
}

export async function ingestRawVotes(db: PipelineV2Db, source: VoteSource): Promise<IngestRawVotesResult> {
  const votes = await source.fetchVotes();
  let ingestedVotes = 0;

  for (const vote of votes) {
    const externalId = String(
      vote.external_id ?? buildExternalId(["vote", vote.congress, vote.chamber, vote.roll_number, vote.id])
    );
    const rawVoteId = await storeRawVote(db, {
      externalId,
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      payload: vote
    });
    if (rawVoteId > 0) {
      ingestedVotes += 1;
    }
  }

  return { ingestedVotes };
}
