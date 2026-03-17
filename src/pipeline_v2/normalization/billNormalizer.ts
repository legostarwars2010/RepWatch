import type { JsonObject, PipelineV2Db } from "../types";
import { buildExternalId, normalizeWhitespace } from "../utils/ids";

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNullableDate(value: unknown): string | null {
  const raw = toStringValue(value);
  return raw.length > 0 ? raw : null;
}

export interface NormalizedBill {
  externalId: string;
  congress: number | null;
  chamber: string | null;
  billType: string | null;
  billNumber: string | null;
  title: string;
  officialSummary: string;
  currentStatus: string | null;
  introducedAt: string | null;
  latestActionAt: string | null;
  metadata: JsonObject;
}

export function normalizeBill(raw: JsonObject): NormalizedBill {
  const congress = Number(raw.congress ?? raw.legislative_session ?? 0) || null;
  const billType = toStringValue(raw.bill_type ?? raw.type).toLowerCase() || null;
  const billNumber = toStringValue(raw.bill_number ?? raw.number) || null;
  const chamber = toStringValue(raw.chamber).toLowerCase() || null;
  const externalId =
    toStringValue(raw.external_id) || buildExternalId(["bill", congress, billType, billNumber, raw.id]);

  return {
    externalId,
    congress,
    chamber,
    billType,
    billNumber,
    title: normalizeWhitespace(toStringValue(raw.title || raw.short_title || "Untitled bill")),
    officialSummary: normalizeWhitespace(toStringValue(raw.official_summary ?? raw.summary ?? "")),
    currentStatus: toStringValue(raw.current_status ?? raw.status) || null,
    introducedAt: toNullableDate(raw.introduced_at ?? raw.introduced_date),
    latestActionAt: toNullableDate(raw.latest_action_at ?? raw.latest_action_date),
    metadata: raw
  };
}

export async function upsertNormalizedBill(db: PipelineV2Db, bill: NormalizedBill, sourceRawBillId: number): Promise<number> {
  const result = await db.query<{ id: number }>(
    `
    INSERT INTO v2_bills (
      external_id,
      congress,
      chamber,
      bill_type,
      bill_number,
      title,
      official_summary,
      current_status,
      introduced_at,
      latest_action_at,
      source_raw_bill_id,
      bill_metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (external_id) DO UPDATE SET
      title = EXCLUDED.title,
      official_summary = EXCLUDED.official_summary,
      current_status = EXCLUDED.current_status,
      latest_action_at = EXCLUDED.latest_action_at,
      bill_metadata = EXCLUDED.bill_metadata,
      updated_at = NOW()
    RETURNING id
    `,
    [
      bill.externalId,
      bill.congress,
      bill.chamber,
      bill.billType,
      bill.billNumber,
      bill.title,
      bill.officialSummary,
      bill.currentStatus,
      bill.introducedAt,
      bill.latestActionAt,
      sourceRawBillId,
      bill.metadata
    ]
  );
  return result.rows[0].id;
}
