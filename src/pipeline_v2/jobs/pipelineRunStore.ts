import type { JsonObject, PipelineRunMetadata, PipelineV2Db } from "../types";

export async function createPipelineRun(
  db: PipelineV2Db,
  runType: "bill_semantics" | "vote_semantics",
  metadata: PipelineRunMetadata
): Promise<number> {
  const result = await db.query<{ id: number }>(
    `
    INSERT INTO v2_pipeline_runs (
      run_type,
      pipeline_version,
      prompt_version,
      model_name,
      generation_timestamp,
      validation_status,
      status,
      metadata
    )
    VALUES ($1,$2,$3,$4,NOW(),'pending','running',$5)
    RETURNING id
    `,
    [runType, metadata.pipelineVersion, metadata.promptVersion, metadata.modelName, JSON.stringify({})]
  );
  return result.rows[0].id;
}

export async function finishPipelineRun(
  db: PipelineV2Db,
  runId: number,
  status: "completed" | "failed",
  validationStatus: "valid" | "invalid" | "needs_review",
  metadata: JsonObject
): Promise<void> {
  await db.query(
    `
    UPDATE v2_pipeline_runs
    SET status = $2,
        validation_status = $3,
        metadata = $4
    WHERE id = $1
    `,
    [runId, status, validationStatus, JSON.stringify(metadata)]
  );
}

export async function insertArtifactValidation(
  db: PipelineV2Db,
  params: {
    runId: number;
    artifactType: "bill_semantics" | "vote_semantics";
    artifactId: number;
    isValid: boolean;
    needsReview: boolean;
    errors: string[];
    warnings: string[];
  }
): Promise<void> {
  await db.query(
    `
    INSERT INTO v2_artifact_validations (
      pipeline_run_id,
      artifact_type,
      artifact_id,
      is_valid,
      needs_review,
      validation_errors,
      validation_warnings,
      validator_version
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,'v2-validator-1')
    `,
    [
      params.runId,
      params.artifactType,
      params.artifactId,
      params.isValid,
      params.needsReview,
      JSON.stringify(params.errors),
      JSON.stringify(params.warnings)
    ]
  );
}
