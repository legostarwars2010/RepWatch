import type { JsonObject, PipelineV2Db } from "../types";
import { buildExternalId, normalizeWhitespace } from "../utils/ids";

export const VOTE_TYPE_ENUM = [
  "procedural",
  "passage",
  "amendment",
  "cloture",
  "confirmation",
  "other"
] as const;

export type VoteType = (typeof VOTE_TYPE_ENUM)[number];

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseVoteType(rawVoteType: unknown, voteQuestion: string): VoteType {
  const normalized = toStringValue(rawVoteType).toLowerCase();
  if (VOTE_TYPE_ENUM.includes(normalized as VoteType)) {
    return normalized as VoteType;
  }
  if (/cloture/.test(voteQuestion.toLowerCase())) return "cloture";
  if (/amendment/.test(voteQuestion.toLowerCase())) return "amendment";
  if (/passage/.test(voteQuestion.toLowerCase())) return "passage";
  if (/rule|motion|procedural|consideration/.test(voteQuestion.toLowerCase())) return "procedural";
  return "other";
}

export interface NormalizedVoteEvent {
  externalId: string;
  billExternalId: string | null;
  chamber: string | null;
  voteType: VoteType;
  voteQuestion: string;
  voteResult: string;
  voteDate: string | null;
  yeaCount: number | null;
  nayCount: number | null;
  presentCount: number | null;
  notVotingCount: number | null;
  payload: JsonObject;
}

export function normalizeVote(raw: JsonObject): NormalizedVoteEvent {
  const question = normalizeWhitespace(toStringValue(raw.vote_question ?? raw.question ?? "Unknown vote question"));
  return {
    externalId:
      toStringValue(raw.external_id) || buildExternalId(["vote", raw.congress, raw.chamber, raw.roll_number, raw.id]),
    billExternalId: toStringValue(raw.bill_external_id ?? raw.bill_id ?? raw.canonical_bill_id) || null,
    chamber: toStringValue(raw.chamber).toLowerCase() || null,
    voteType: parseVoteType(raw.vote_type, question),
    voteQuestion: question,
    voteResult: normalizeWhitespace(toStringValue(raw.vote_result ?? raw.result ?? "Unknown")),
    voteDate: toStringValue(raw.vote_date ?? raw.date) || null,
    yeaCount: Number(raw.yea_count ?? raw.yes ?? 0) || null,
    nayCount: Number(raw.nay_count ?? raw.no ?? 0) || null,
    presentCount: Number(raw.present_count ?? 0) || null,
    notVotingCount: Number(raw.not_voting_count ?? 0) || null,
    payload: raw
  };
}

export async function upsertVoteEvent(
  db: PipelineV2Db,
  vote: NormalizedVoteEvent,
  sourceRawVoteId: number,
  billId: number | null
): Promise<number> {
  const result = await db.query<{ id: number }>(
    `
    INSERT INTO v2_vote_events (
      external_id,
      bill_id,
      chamber,
      vote_type,
      vote_question,
      vote_result,
      vote_date,
      yea_count,
      nay_count,
      present_count,
      not_voting_count,
      source_raw_vote_id,
      payload_json
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (external_id) DO UPDATE SET
      vote_result = EXCLUDED.vote_result,
      vote_type = EXCLUDED.vote_type,
      payload_json = EXCLUDED.payload_json,
      updated_at = NOW()
    RETURNING id
    `,
    [
      vote.externalId,
      billId,
      vote.chamber,
      vote.voteType,
      vote.voteQuestion,
      vote.voteResult,
      vote.voteDate,
      vote.yeaCount,
      vote.nayCount,
      vote.presentCount,
      vote.notVotingCount,
      sourceRawVoteId,
      vote.payload
    ]
  );
  return result.rows[0].id;
}
