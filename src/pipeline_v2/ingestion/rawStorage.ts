import type { JsonObject, PipelineV2Db } from "../types";
import { stablePayloadHash } from "../utils/hash";

export interface RawRecordInput {
  externalId: string;
  sourceName: string;
  sourceUrl: string;
  payload: JsonObject;
}

async function insertRawRecord(
  db: PipelineV2Db,
  tableName: "v2_raw_bills" | "v2_raw_votes" | "v2_raw_bill_actions" | "v2_raw_bill_text_versions",
  input: RawRecordInput
): Promise<number> {
  const payloadHash = await stablePayloadHash(input.payload);
  const result = await db.query<{ id: number }>(
    `
    INSERT INTO ${tableName} (
      external_id,
      source_name,
      source_url,
      fetched_at,
      payload_hash,
      payload_json
    )
    VALUES ($1, $2, $3, NOW(), $4, $5)
    ON CONFLICT (external_id, payload_hash) DO NOTHING
    RETURNING id
    `,
    [input.externalId, input.sourceName, input.sourceUrl, payloadHash, input.payload]
  );

  if (result.rowCount > 0) {
    return result.rows[0].id;
  }

  const existing = await db.query<{ id: number }>(
    `SELECT id FROM ${tableName} WHERE external_id = $1 AND payload_hash = $2`,
    [input.externalId, payloadHash]
  );
  return existing.rows[0]?.id ?? 0;
}

export async function storeRawBill(db: PipelineV2Db, input: RawRecordInput): Promise<number> {
  return insertRawRecord(db, "v2_raw_bills", input);
}

export async function storeRawBillAction(db: PipelineV2Db, input: RawRecordInput): Promise<number> {
  return insertRawRecord(db, "v2_raw_bill_actions", input);
}

export async function storeRawBillTextVersion(db: PipelineV2Db, input: RawRecordInput): Promise<number> {
  return insertRawRecord(db, "v2_raw_bill_text_versions", input);
}

export async function storeRawVote(db: PipelineV2Db, input: RawRecordInput): Promise<number> {
  return insertRawRecord(db, "v2_raw_votes", input);
}
