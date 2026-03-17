import type { JsonObject, PipelineV2Db } from "../types";
import type { LlmClient } from "../semantics/llmClient";
import { buildBillSemanticsPrompt, BILL_SEMANTICS_PROMPT_VERSION } from "../prompts/billSemanticsPrompt";
import { assertBillSemantics } from "../schemas/billSemantics";
import { validateBillSemantics } from "../validation/validateBillSemantics";
import { createPipelineRun, finishPipelineRun, insertArtifactValidation } from "./pipelineRunStore";

const PIPELINE_VERSION = "pipeline_v2";

interface BillInputRow {
  id: number;
  title: string;
  official_summary: string | null;
  current_status: string | null;
  bill_metadata: JsonObject;
}

interface BillChunkRow {
  heading: string | null;
  chunk_text: string;
}

export interface GenerateBillSemanticsOptions {
  billExternalIdPrefix?: string;
}

function coerceBillSemanticsFallback(payload: unknown): ReturnType<typeof assertBillSemantics> {
  if (payload && typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    return {
      one_line_summary: String(row.one_line_summary ?? "Summary unavailable."),
      plain_english_summary: String(row.plain_english_summary ?? "Summary unavailable."),
      long_summary: String(row.long_summary ?? row.plain_english_summary ?? "Summary unavailable."),
      key_provisions: Array.isArray(row.key_provisions) ? row.key_provisions.map((item) => String(item)) : [],
      affected_groups: Array.isArray(row.affected_groups) ? row.affected_groups.map((item) => String(item)) : [],
      why_it_matters: String(row.why_it_matters ?? "Not available."),
      issue_tags: Array.isArray(row.issue_tags) ? row.issue_tags.map((item) => String(item)) : [],
      confidence_score: Number(row.confidence_score ?? 0)
    };
  }
  return {
    one_line_summary: "Summary unavailable.",
    plain_english_summary: "Summary unavailable.",
    long_summary: "Summary unavailable.",
    key_provisions: [],
    affected_groups: [],
    why_it_matters: "Not available.",
    issue_tags: [],
    confidence_score: 0
  };
}

export async function generateBillSemantics(
  db: PipelineV2Db,
  llmClient: LlmClient,
  options: GenerateBillSemanticsOptions = {}
): Promise<number> {
  const runId = await createPipelineRun(db, "bill_semantics", {
    pipelineVersion: PIPELINE_VERSION,
    promptVersion: BILL_SEMANTICS_PROMPT_VERSION,
    modelName: "configured-at-runtime"
  });

  try {
    const billParams: unknown[] = [];
    let billsSql = `
      SELECT id, title, official_summary, current_status, bill_metadata
      FROM v2_bills
    `;
    if (options.billExternalIdPrefix) {
      billParams.push(`${options.billExternalIdPrefix}%`);
      billsSql += " WHERE external_id LIKE $1";
    }
    billsSql += " ORDER BY id ASC";
    const bills = await db.query<BillInputRow>(billsSql, billParams);

    let outputCount = 0;
    for (const bill of bills.rows) {
      const chunks = await db.query<BillChunkRow>(
        `
        SELECT heading, chunk_text
        FROM v2_bill_text_chunks
        WHERE bill_id = $1
        ORDER BY chunk_index ASC
        LIMIT 24
        `,
        [bill.id]
      );

      let attempts = 0;
      let semanticsPayload = null as unknown;
      let validationStatus = "invalid";
      let validationErrors: string[] = [];
      let validationWarnings: string[] = [];

      while (attempts < 2) {
        attempts += 1;
        const prompt = buildBillSemanticsPrompt({
          bill: { id: bill.id, title: bill.title },
          officialSummary: bill.official_summary ?? "",
          billMetadata: bill.bill_metadata,
          textChunks: chunks.rows.map((row) => ({ heading: row.heading, text: row.chunk_text }))
        });
        const llmResult = await llmClient.generate(prompt);
        semanticsPayload = llmResult.output;

        const validation = validateBillSemantics(semanticsPayload, { currentStatus: bill.current_status });
        validationErrors = validation.errors;
        validationWarnings = validation.warnings;
        validationStatus = validation.isValid ? "valid" : validation.needsReview ? "needs_review" : "invalid";

        if (validation.isValid) {
          break;
        }
      }

      const safePayload = (() => {
        try {
          return assertBillSemantics(semanticsPayload);
        } catch {
          return coerceBillSemanticsFallback(semanticsPayload);
        }
      })();
      const needsReview = validationStatus !== "valid";
      const insert = await db.query<{ id: number }>(
        `
        INSERT INTO v2_bill_semantic_outputs (
          bill_id,
          one_line_summary,
          plain_english_summary,
          long_summary,
          key_provisions,
          affected_groups,
          why_it_matters,
          issue_tags,
          confidence_score,
          needs_review,
          validation_status,
          pipeline_run_id,
          output_json
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING id
        `,
        [
          bill.id,
          safePayload.one_line_summary,
          safePayload.plain_english_summary,
          safePayload.long_summary,
          JSON.stringify(safePayload.key_provisions),
          JSON.stringify(safePayload.affected_groups),
          safePayload.why_it_matters,
          JSON.stringify(safePayload.issue_tags),
          safePayload.confidence_score,
          needsReview,
          validationStatus,
          runId,
          JSON.stringify(safePayload)
        ]
      );

      await insertArtifactValidation(db, {
        runId,
        artifactType: "bill_semantics",
        artifactId: insert.rows[0].id,
        isValid: validationStatus === "valid",
        needsReview,
        errors: validationErrors,
        warnings: validationWarnings
      });
      outputCount += 1;
    }

    await finishPipelineRun(db, runId, "completed", "valid", { outputCount });
    return outputCount;
  } catch (error) {
    await finishPipelineRun(db, runId, "failed", "invalid", {
      message: (error as Error).message
    });
    throw error;
  }
}
