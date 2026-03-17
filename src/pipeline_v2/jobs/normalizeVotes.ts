import type { JsonObject, PipelineV2Db } from "../types";
import { normalizeVote, upsertVoteEvent } from "../normalization/voteNormalizer";

export interface NormalizeVotesResult {
  normalizedVotes: number;
}

export interface NormalizeVotesOptions {
  voteExternalIdPrefix?: string;
}

export async function normalizeVotes(
  db: PipelineV2Db,
  options: NormalizeVotesOptions = {}
): Promise<NormalizeVotesResult> {
  const billRows = await db.query<{ id: number; external_id: string }>("SELECT id, external_id FROM v2_bills");
  const billIdByExternalId = new Map<string, number>(
    billRows.rows.map((row) => [String(row.external_id), Number(row.id)])
  );

  const voteParams: unknown[] = [];
  let votesSql = "SELECT id, payload_json FROM v2_raw_votes";
  if (options.voteExternalIdPrefix) {
    voteParams.push(`${options.voteExternalIdPrefix}%`);
    votesSql += " WHERE external_id LIKE $1";
  }
  votesSql += " ORDER BY id ASC";
  const rawVotes = await db.query<{ id: number; payload_json: JsonObject }>(votesSql, voteParams);

  let normalizedVotes = 0;
  for (const rawVote of rawVotes.rows) {
    const normalized = normalizeVote(rawVote.payload_json);
    const billId = normalized.billExternalId ? billIdByExternalId.get(normalized.billExternalId) ?? null : null;
    await upsertVoteEvent(db, normalized, rawVote.id, billId);
    normalizedVotes += 1;
  }

  return { normalizedVotes };
}
