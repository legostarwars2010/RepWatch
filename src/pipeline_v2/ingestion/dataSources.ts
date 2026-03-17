import type { JsonObject } from "../types";

export interface BillSource {
  sourceName: string;
  sourceUrl: string;
  fetchBills: () => Promise<JsonObject[]>;
  fetchBillActions?: (bill: JsonObject) => Promise<JsonObject[]>;
  fetchBillTextVersions?: (bill: JsonObject) => Promise<JsonObject[]>;
}

export interface VoteSource {
  sourceName: string;
  sourceUrl: string;
  fetchVotes: () => Promise<JsonObject[]>;
}

export async function fetchJsonArray(url: string): Promise<JsonObject[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new Error(`Expected array response from ${url}`);
  }
  return body as JsonObject[];
}
