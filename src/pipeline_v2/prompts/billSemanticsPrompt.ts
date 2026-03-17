import type { JsonObject } from "../types";

export const BILL_SEMANTICS_PROMPT_VERSION = "v2-bill-semantics-2";

export function buildBillSemanticsPrompt(input: {
  bill: JsonObject;
  officialSummary: string;
  billMetadata: JsonObject;
  textChunks: Array<{ heading: string | null; text: string }>;
}): { system: string; user: string } {
  const system = [
    "You are a neutral legislative analyst.",
    "Return STRICT JSON only.",
    "Do not include markdown, commentary, or extra keys.",
    'The JSON object MUST have exactly: one_line_summary, plain_english_summary, long_summary, key_provisions, affected_groups, why_it_matters, issue_tags, confidence_score.',
    "Use factual language and avoid political persuasion."
  ].join(" ");

  const user = JSON.stringify({
    task: "generate_bill_semantics_v2",
    output_schema: {
      one_line_summary: "string",
      plain_english_summary: "string",
      long_summary: "string",
      key_provisions: ["string"],
      affected_groups: ["string"],
      why_it_matters: "string",
      issue_tags: ["string"],
      confidence_score: "number_between_0_and_1"
    },
    bill: input.bill,
    official_summary: input.officialSummary,
    bill_metadata: input.billMetadata,
    relevant_bill_text_chunks: input.textChunks
  });

  return { system, user };
}
