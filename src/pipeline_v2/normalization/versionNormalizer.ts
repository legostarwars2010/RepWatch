import type { JsonObject, PipelineV2Db } from "../types";
import { buildExternalId, normalizeWhitespace } from "../utils/ids";

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export interface NormalizedBillVersion {
  externalId: string;
  versionCode: string | null;
  versionName: string | null;
  issuedAt: string | null;
  textUrl: string | null;
  textContent: string | null;
  payload: JsonObject;
}

export function normalizeBillVersion(billExternalId: string, raw: JsonObject): NormalizedBillVersion {
  return {
    externalId: toStringValue(raw.external_id) || buildExternalId([billExternalId, "version", raw.version_code, raw.id]),
    versionCode: toStringValue(raw.version_code) || null,
    versionName: toStringValue(raw.version_name) || null,
    issuedAt: toStringValue(raw.issued_at ?? raw.date) || null,
    textUrl: toStringValue(raw.text_url ?? raw.url) || null,
    textContent: normalizeWhitespace(toStringValue(raw.text_content ?? raw.text ?? "")) || null,
    payload: raw
  };
}

export async function upsertBillVersion(
  db: PipelineV2Db,
  billId: number,
  version: NormalizedBillVersion,
  sourceRawTextVersionId: number
): Promise<number> {
  const result = await db.query<{ id: number }>(
    `
    INSERT INTO v2_bill_versions (
      bill_id,
      external_id,
      version_code,
      version_name,
      issued_at,
      text_url,
      text_content,
      source_raw_text_version_id,
      payload_json
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (external_id) DO UPDATE SET
      text_url = EXCLUDED.text_url,
      text_content = EXCLUDED.text_content,
      payload_json = EXCLUDED.payload_json,
      updated_at = NOW()
    RETURNING id
    `,
    [
      billId,
      version.externalId,
      version.versionCode,
      version.versionName,
      version.issuedAt,
      version.textUrl,
      version.textContent,
      sourceRawTextVersionId,
      version.payload
    ]
  );
  return result.rows[0].id;
}
