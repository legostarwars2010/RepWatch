import type { BillSemantics } from "../schemas/billSemantics";
import { assertBillSemantics } from "../schemas/billSemantics";
import { normalizeValidation, validateNeutralLanguage, validateReasonableLength, type ValidationResult } from "./validateCommon";

export interface BillCanonicalState {
  currentStatus: string | null;
}

export function validateBillSemantics(input: unknown, canonicalState: BillCanonicalState): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let payload: BillSemantics;
  try {
    payload = assertBillSemantics(input);
  } catch (error) {
    errors.push(`Invalid JSON schema: ${(error as Error).message}`);
    return normalizeValidation(errors, warnings);
  }

  if (payload.confidence_score < 0 || payload.confidence_score > 1) {
    errors.push("confidence_score must be between 0 and 1.");
  }
  if (payload.key_provisions.length === 0) {
    errors.push("key_provisions must contain at least one item.");
  }
  if (payload.affected_groups.length === 0) {
    warnings.push("affected_groups is empty.");
  }

  errors.push(...validateReasonableLength("plain_english_summary", payload.plain_english_summary, 2000));
  errors.push(...validateReasonableLength("long_summary", payload.long_summary, 6000));
  warnings.push(...validateReasonableLength("one_line_summary", payload.one_line_summary, 280));

  const neutralIssues = validateNeutralLanguage([
    payload.one_line_summary,
    payload.plain_english_summary,
    payload.long_summary,
    payload.why_it_matters,
    ...payload.key_provisions
  ]);
  errors.push(...neutralIssues);

  const status = canonicalState.currentStatus?.toLowerCase() ?? "";
  const summary = `${payload.one_line_summary} ${payload.plain_english_summary}`.toLowerCase();
  if (status.includes("failed") && summary.includes("becomes law")) {
    errors.push("Contradiction: bill marked failed but summary says it becomes law.");
  }

  return normalizeValidation(errors, warnings);
}
