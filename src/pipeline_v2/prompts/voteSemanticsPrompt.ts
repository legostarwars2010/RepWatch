import type { JsonObject } from "../types";

export const VOTE_SEMANTICS_PROMPT_VERSION = "v2-vote-semantics-1";

export function buildVoteSemanticsPrompt(input: {
  voteEvent: JsonObject;
  voteQuestion: string;
  voteResult: string;
  linkedBillMetadata: JsonObject | null;
}): { system: string; user: string } {
  const system = [
    "You are a neutral legislative analyst.",
    "Return STRICT JSON only.",
    "Use concise plain-English output.",
    'The JSON object MUST have exactly: vote_type, procedural_flag, what_this_vote_decides, effect_if_passes, effect_if_fails, next_step, confidence_score.',
    "vote_type must be one of: procedural, passage, amendment, cloture, confirmation, other."
  ].join(" ");

  const user = JSON.stringify({
    task: "generate_vote_semantics_v2",
    output_schema: {
      vote_type: "procedural|passage|amendment|cloture|confirmation|other",
      procedural_flag: "boolean",
      what_this_vote_decides: "string",
      effect_if_passes: "string",
      effect_if_fails: "string",
      next_step: "string",
      confidence_score: "number_between_0_and_1"
    },
    vote_event: input.voteEvent,
    vote_question: input.voteQuestion,
    vote_result: input.voteResult,
    linked_bill_metadata: input.linkedBillMetadata
  });

  return { system, user };
}
