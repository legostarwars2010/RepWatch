import { VOTE_TYPE_ENUM, type VoteType } from "../normalization/voteNormalizer";

export interface VoteSemantics {
  vote_type: VoteType;
  procedural_flag: boolean;
  what_this_vote_decides: string;
  effect_if_passes: string;
  effect_if_fails: string;
  next_step: string;
  confidence_score: number;
}

function isVoteType(value: unknown): value is VoteType {
  return typeof value === "string" && VOTE_TYPE_ENUM.includes(value as VoteType);
}

export function isVoteSemantics(value: unknown): value is VoteSemantics {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    isVoteType(payload.vote_type) &&
    typeof payload.procedural_flag === "boolean" &&
    typeof payload.what_this_vote_decides === "string" &&
    typeof payload.effect_if_passes === "string" &&
    typeof payload.effect_if_fails === "string" &&
    typeof payload.next_step === "string" &&
    typeof payload.confidence_score === "number"
  );
}

export function assertVoteSemantics(value: unknown): VoteSemantics {
  if (!isVoteSemantics(value)) {
    throw new Error("Invalid vote semantics payload.");
  }
  return value;
}
