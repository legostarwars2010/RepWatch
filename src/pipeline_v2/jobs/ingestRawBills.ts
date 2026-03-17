import type { PipelineV2Db } from "../types";
import type { BillSource } from "../ingestion/dataSources";
import { storeRawBill, storeRawBillAction, storeRawBillTextVersion } from "../ingestion/rawStorage";
import { buildExternalId } from "../utils/ids";

export interface IngestRawBillsResult {
  ingestedBills: number;
  ingestedActions: number;
  ingestedTextVersions: number;
}

export async function ingestRawBills(db: PipelineV2Db, source: BillSource): Promise<IngestRawBillsResult> {
  const bills = await source.fetchBills();
  let ingestedBills = 0;
  let ingestedActions = 0;
  let ingestedTextVersions = 0;

  for (const bill of bills) {
    const externalId = String(bill.external_id ?? buildExternalId(["bill", bill.congress, bill.id]));
    const rawBillId = await storeRawBill(db, {
      externalId,
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      payload: bill
    });
    if (rawBillId > 0) ingestedBills += 1;

    if (source.fetchBillActions) {
      const actions = await source.fetchBillActions(bill);
      for (const action of actions) {
        const actionExternalId = String(action.external_id ?? buildExternalId([externalId, "action", action.id]));
        const rawActionId = await storeRawBillAction(db, {
          externalId: actionExternalId,
          sourceName: source.sourceName,
          sourceUrl: source.sourceUrl,
          payload: action
        });
        if (rawActionId > 0) ingestedActions += 1;
      }
    }

    if (source.fetchBillTextVersions) {
      const textVersions = await source.fetchBillTextVersions(bill);
      for (const textVersion of textVersions) {
        const textExternalId = String(
          textVersion.external_id ?? buildExternalId([externalId, "text-version", textVersion.version_code, textVersion.id])
        );
        const rawTextId = await storeRawBillTextVersion(db, {
          externalId: textExternalId,
          sourceName: source.sourceName,
          sourceUrl: source.sourceUrl,
          payload: textVersion
        });
        if (rawTextId > 0) ingestedTextVersions += 1;
      }
    }
  }

  return { ingestedBills, ingestedActions, ingestedTextVersions };
}
