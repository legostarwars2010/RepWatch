export interface BillSemantics {
  one_line_summary: string;
  plain_english_summary: string;
  long_summary: string;
  key_provisions: string[];
  affected_groups: string[];
  why_it_matters: string;
  issue_tags: string[];
  confidence_score: number;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isBillSemantics(value: unknown): value is BillSemantics {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.one_line_summary === "string" &&
    typeof payload.plain_english_summary === "string" &&
    typeof payload.long_summary === "string" &&
    isStringArray(payload.key_provisions) &&
    isStringArray(payload.affected_groups) &&
    typeof payload.why_it_matters === "string" &&
    isStringArray(payload.issue_tags) &&
    typeof payload.confidence_score === "number"
  );
}

export function assertBillSemantics(value: unknown): BillSemantics {
  if (!isBillSemantics(value)) {
    throw new Error("Invalid bill semantics payload.");
  }
  return value;
}
