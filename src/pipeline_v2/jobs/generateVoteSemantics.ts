import type { JsonObject, PipelineV2Db } from "../types";
import type { LlmClient } from "../semantics/llmClient";
import { buildVoteSemanticsPrompt, VOTE_SEMANTICS_PROMPT_VERSION } from "../prompts/voteSemanticsPrompt";
import { assertVoteSemantics } from "../schemas/voteSemantics";
import { validateVoteSemantics } from "../validation/validateVoteSemantics";
import { createPipelineRun, finishPipelineRun, insertArtifactValidation } from "./pipelineRunStore";

const PIPELINE_VERSION = "pipeline_v2";

interface VoteInputRow {
  id: number;
  vote_type: string;
  vote_question: string;
  vote_result: string;
  payload_json: JsonObject;
  bill_id: number | null;
}

interface BillMetaRow {
  bill_metadata: JsonObject;
}

export interface GenerateVoteSemanticsOptions {
  voteExternalIdPrefix?: string;
}

function coerceVoteSemanticsFallback(payload: unknown): ReturnType<typeof assertVoteSemantics> {
  if (payload && typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    return {
      vote_type: (String(row.vote_type ?? "other") as ReturnType<typeof assertVoteSemantics>["vote_type"]),
      procedural_flag: Boolean(row.procedural_flag ?? false),
      what_this_vote_decides: String(row.what_this_vote_decides ?? "Not available."),
      effect_if_passes: String(row.effect_if_passes ?? "Not available."),
      effect_if_fails: String(row.effect_if_fails ?? "Not available."),
      next_step: String(row.next_step ?? "Not available."),
      confidence_score: Number(row.confidence_score ?? 0)
    };
  }
  return {
    vote_type: "other",
    procedural_flag: false,
    what_this_vote_decides: "Not available.",
    effect_if_passes: "Not available.",
    effect_if_fails: "Not available.",
    next_step: "Not available.",
    confidence_score: 0
  };
}

export async function generateVoteSemantics(
  db: PipelineV2Db,
  llmClient: LlmClient,
  options: GenerateVoteSemanticsOptions = {}
): Promise<number> {
  const runId = await createPipelineRun(db, "vote_semantics", {
    pipelineVersion: PIPELINE_VERSION,
    promptVersion: VOTE_SEMANTICS_PROMPT_VERSION,
    modelName: "configured-at-runtime"
  });

  try {
    const voteParams: unknown[] = [];
    let votesSql = `
      SELECT id, vote_type, vote_question, vote_result, payload_json, bill_id
      FROM v2_vote_events
    `;
    if (options.voteExternalIdPrefix) {
      voteParams.push(`${options.voteExternalIdPrefix}%`);
      votesSql += " WHERE external_id LIKE $1";
    }
    votesSql += " ORDER BY id ASC";
    const votes = await db.query<VoteInputRow>(votesSql, voteParams);

    let outputCount = 0;
    for (const vote of votes.rows) {
      const linkedBill = vote.bill_id
        ? await db.query<BillMetaRow>("SELECT bill_metadata FROM v2_bills WHERE id = $1 LIMIT 1", [vote.bill_id])
        : { rows: [] as BillMetaRow[] };

      let attempts = 0;
      let semanticsPayload = null as unknown;
      let validationStatus = "invalid";
      let validationErrors: string[] = [];
      let validationWarnings: string[] = [];

      while (attempts < 2) {
        attempts += 1;
        const prompt = buildVoteSemanticsPrompt({
          voteEvent: vote.payload_json,
          voteQuestion: vote.vote_question,
          voteResult: vote.vote_result,
          linkedBillMetadata: linkedBill.rows[0]?.bill_metadata ?? null
        });
        const llmResult = await llmClient.generate(prompt);
        semanticsPayload = llmResult.output;

        const validation = validateVoteSemantics(semanticsPayload, { voteResult: vote.vote_result });
        validationErrors = validation.errors;
        validationWarnings = validation.warnings;
        validationStatus = validation.isValid ? "valid" : validation.needsReview ? "needs_review" : "invalid";

        if (validation.isValid) {
          break;
        }
      }

      const safePayload = (() => {
        try {
          return assertVoteSemantics(semanticsPayload);
        } catch {
          return coerceVoteSemanticsFallback(semanticsPayload);
        }
      })();
      const needsReview = validationStatus !== "valid";
      const insert = await db.query<{ id: number }>(
        `
        INSERT INTO v2_vote_semantic_outputs (
          vote_event_id,
          vote_type,
          procedural_flag,
          what_this_vote_decides,
          effect_if_passes,
          effect_if_fails,
          next_step,
          confidence_score,
          needs_review,
          validation_status,
          pipeline_run_id,
          output_json
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING id
        `,
        [
          vote.id,
          safePayload.vote_type,
          safePayload.procedural_flag,
          safePayload.what_this_vote_decides,
          safePayload.effect_if_passes,
          safePayload.effect_if_fails,
          safePayload.next_step,
          safePayload.confidence_score,
          needsReview,
          validationStatus,
          runId,
          JSON.stringify(safePayload)
        ]
      );

      await insertArtifactValidation(db, {
        runId,
        artifactType: "vote_semantics",
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
