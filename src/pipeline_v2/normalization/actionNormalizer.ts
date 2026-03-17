import type { JsonObject, PipelineV2Db } from "../types";
import { buildExternalId, normalizeWhitespace } from "../utils/ids";

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export interface NormalizedBillAction {
  externalId: string;
  actionDate: string | null;
  actionText: string;
  actor: string | null;
  stage: string | null;
  payload: JsonObject;
}

export function normalizeBillAction(billExternalId: string, raw: JsonObject): NormalizedBillAction {
  return {
    externalId: stringValue(raw.external_id) || buildExternalId([billExternalId, "action", raw.id, raw.date]),
    actionDate: stringValue(raw.action_date ?? raw.date) || null,
    actionText: normalizeWhitespace(stringValue(raw.action_text ?? raw.text ?? "No action description")),
    actor: stringValue(raw.actor) || null,
    stage: stringValue(raw.stage) || null,
    payload: raw
  };
}

export async function upsertBillAction(
  db: PipelineV2Db,
  billId: number,
  action: NormalizedBillAction,
  sourceRawActionId: number
): Promise<number> {
  const result = await db.query<{ id: number }>(
    `
    INSERT INTO v2_bill_actions (
      bill_id,
      external_id,
      action_date,
      action_text,
      actor,
      stage,
      source_raw_action_id,
      payload_json
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (external_id) DO UPDATE SET
      action_text = EXCLUDED.action_text,
      stage = EXCLUDED.stage,
      payload_json = EXCLUDED.payload_json,
      updated_at = NOW()
    RETURNING id
    `,
    [billId, action.externalId, action.actionDate, action.actionText, action.actor, action.stage, sourceRawActionId, action.payload]
  );
  return result.rows[0].id;
}
