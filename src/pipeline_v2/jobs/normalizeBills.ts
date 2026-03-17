import type { JsonObject, PipelineV2Db } from "../types";
import { normalizeBill, upsertNormalizedBill } from "../normalization/billNormalizer";
import { normalizeBillAction, upsertBillAction } from "../normalization/actionNormalizer";
import { normalizeBillVersion, upsertBillVersion } from "../normalization/versionNormalizer";

export interface NormalizeBillsResult {
  normalizedBills: number;
  normalizedActions: number;
  normalizedVersions: number;
}

export interface NormalizeBillsOptions {
  billExternalIdPrefix?: string;
}

export async function normalizeBills(
  db: PipelineV2Db,
  options: NormalizeBillsOptions = {}
): Promise<NormalizeBillsResult> {
  const billParams: unknown[] = [];
  let billsSql = "SELECT id, payload_json FROM v2_raw_bills";
  if (options.billExternalIdPrefix) {
    billParams.push(`${options.billExternalIdPrefix}%`);
    billsSql += " WHERE external_id LIKE $1";
  }
  billsSql += " ORDER BY id ASC";

  const rawBills = await db.query<{ id: number; payload_json: JsonObject }>(
    billsSql,
    billParams
  );
  let normalizedBills = 0;
  let normalizedActions = 0;
  let normalizedVersions = 0;

  const billIdMap = new Map<string, number>();
  for (const raw of rawBills.rows) {
    const bill = normalizeBill(raw.payload_json);
    const billId = await upsertNormalizedBill(db, bill, raw.id);
    billIdMap.set(bill.externalId, billId);
    normalizedBills += 1;
  }

  const actionParams: unknown[] = [];
  let actionsSql = "SELECT id, payload_json FROM v2_raw_bill_actions";
  if (options.billExternalIdPrefix) {
    actionParams.push(`${options.billExternalIdPrefix}%`);
    actionsSql += " WHERE payload_json->>'bill_external_id' LIKE $1";
  }
  actionsSql += " ORDER BY id ASC";
  const rawActions = await db.query<{ id: number; payload_json: JsonObject }>(actionsSql, actionParams);
  for (const rawAction of rawActions.rows) {
    const payload = rawAction.payload_json;
    const fallbackBillExternalId = String(payload.bill_external_id ?? payload.bill_id ?? "");
    if (!fallbackBillExternalId) {
      continue;
    }
    const billId = billIdMap.get(fallbackBillExternalId);
    if (!billId) {
      continue;
    }
    const action = normalizeBillAction(fallbackBillExternalId, payload);
    const billActionId = await upsertBillAction(db, billId, action, rawAction.id);
    if (action.actionDate || action.stage) {
      await db.query(
        `
        INSERT INTO v2_bill_status_history (
          bill_id,
          status,
          status_date,
          reason,
          source_action_id,
          payload_json
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [billId, action.stage ?? "action_recorded", action.actionDate, action.actionText, billActionId, action.payload]
      );
    }
    normalizedActions += 1;
  }

  const versionParams: unknown[] = [];
  let versionsSql = "SELECT id, payload_json FROM v2_raw_bill_text_versions";
  if (options.billExternalIdPrefix) {
    versionParams.push(`${options.billExternalIdPrefix}%`);
    versionsSql += " WHERE payload_json->>'bill_external_id' LIKE $1";
  }
  versionsSql += " ORDER BY id ASC";
  const rawVersions = await db.query<{ id: number; payload_json: JsonObject }>(versionsSql, versionParams);
  for (const rawVersion of rawVersions.rows) {
    const payload = rawVersion.payload_json;
    const billExternalId = String(payload.bill_external_id ?? payload.bill_id ?? "");
    if (!billExternalId) continue;
    const billId = billIdMap.get(billExternalId);
    if (!billId) continue;
    const version = normalizeBillVersion(billExternalId, payload);
    await upsertBillVersion(db, billId, version, rawVersion.id);
    normalizedVersions += 1;
  }

  return { normalizedBills, normalizedActions, normalizedVersions };
}
