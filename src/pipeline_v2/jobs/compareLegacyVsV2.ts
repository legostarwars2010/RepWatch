import type { PipelineV2Db } from "../types";

export interface ComparisonRow {
  canonical_bill_id: string | null;
  legacy_summary_present: boolean;
  v2_summary_present: boolean;
  legacy_vote_explain_present: boolean;
  v2_vote_explain_present: boolean;
}

export async function compareLegacyVsV2(db: PipelineV2Db): Promise<ComparisonRow[]> {
  const rows = await db.query<ComparisonRow>(
    `
    SELECT
      i.canonical_bill_id,
      (i.ai_summary IS NOT NULL) AS legacy_summary_present,
      EXISTS (
        SELECT 1
        FROM v2_bills b
        JOIN v2_bill_semantic_outputs s ON s.bill_id = b.id
        WHERE b.external_id = i.canonical_bill_id
      ) AS v2_summary_present,
      (i.ai_explanations IS NOT NULL) AS legacy_vote_explain_present,
      EXISTS (
        SELECT 1
        FROM v2_bills b
        JOIN v2_vote_events ve ON ve.bill_id = b.id
        JOIN v2_vote_semantic_outputs vs ON vs.vote_event_id = ve.id
        WHERE b.external_id = i.canonical_bill_id
      ) AS v2_vote_explain_present
    FROM issues i
    WHERE i.canonical_bill_id IS NOT NULL
    ORDER BY i.canonical_bill_id ASC
    `
  );
  return rows.rows;
}
