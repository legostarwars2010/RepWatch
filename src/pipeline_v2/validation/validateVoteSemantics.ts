import type { VoteSemantics } from "../schemas/voteSemantics";
import { assertVoteSemantics } from "../schemas/voteSemantics";
import { normalizeValidation, validateNeutralLanguage, validateReasonableLength, type ValidationResult } from "./validateCommon";

export interface VoteCanonicalState {
  voteResult: string;
}

export function validateVoteSemantics(input: unknown, canonicalState: VoteCanonicalState): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let payload: VoteSemantics;
  try {
    payload = assertVoteSemantics(input);
  } catch (error) {
    errors.push(`Invalid JSON schema: ${(error as Error).message}`);
    return normalizeValidation(errors, warnings);
  }

  if (payload.confidence_score < 0 || payload.confidence_score > 1) {
    errors.push("confidence_score must be between 0 and 1.");
  }

  errors.push(...validateReasonableLength("what_this_vote_decides", payload.what_this_vote_decides, 700));
  errors.push(...validateReasonableLength("effect_if_passes", payload.effect_if_passes, 700));
  errors.push(...validateReasonableLength("effect_if_fails", payload.effect_if_fails, 700));
  warnings.push(...validateReasonableLength("next_step", payload.next_step, 400));

  const neutralIssues = validateNeutralLanguage([
    payload.what_this_vote_decides,
    payload.effect_if_passes,
    payload.effect_if_fails,
    payload.next_step
  ]);
  errors.push(...neutralIssues);

  const canonicalResult = canonicalState.voteResult.toLowerCase();
  const failText = payload.effect_if_passes.toLowerCase();
  if ((canonicalResult.includes("failed") || canonicalResult.includes("rejected")) && failText.includes("already passed")) {
    errors.push("Contradiction: canonical vote result failed/rejected but output says already passed.");
  }

  return normalizeValidation(errors, warnings);
}
